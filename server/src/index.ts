import express from 'express';
import cors from 'cors';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;
const DB_DIR = process.env.DB_DIR || path.join(__dirname, '../data');
const DB_PATH = path.join(DB_DIR, 'tokidachi.db');

// Ensure db directory exists (handled by Docker volume or node filesystem)
import fs from 'fs';
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const MAX_SAVE_DATA_BYTES = 300 * 1024;
const BACKUP_ID_RE = /^[\w-]{8,128}$/;
const STAGES = ['egg', 'blob', 'kid', 'teen', 'adult', 'grandpa'];

function sanitizeName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, 40);
}

function validateStage(raw: unknown): string {
  return typeof raw === 'string' && STAGES.includes(raw) ? raw : 'egg';
}

function clampNum(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.min(Math.max(n, 0), 1e15);
}

app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 120;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

app.use('/api/', (req, res, next) => {
  const ip = req.ip || 'unknown';
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return next();
  }
  entry.count += 1;
  if (entry.count > RATE_LIMIT_MAX) {
    return res.status(429).json({ error: 'Too many requests' });
  }
  next();
});

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(ip);
  }
}, RATE_LIMIT_WINDOW_MS).unref();

// Initialize Database
let db: any;
async function initDb() {
  db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database,
  });

  await db.run('PRAGMA foreign_keys = ON');

  await db.exec(`
    CREATE TABLE IF NOT EXISTS backups (
      id TEXT PRIMARY KEY,
      save_data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS leaderboard (
      backup_id TEXT NOT NULL,
      born_at TEXT NOT NULL DEFAULT '',
      companion_name TEXT NOT NULL,
      stage TEXT NOT NULL,
      active_seconds INTEGER NOT NULL,
      tokens_eaten REAL NOT NULL,
      crumbs INTEGER NOT NULL,
      dev_mode INTEGER NOT NULL DEFAULT 0,
      dead INTEGER NOT NULL DEFAULT 0,
      died_at TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (backup_id, born_at)
    );
  `);

  try {
    await db.run('ALTER TABLE leaderboard ADD COLUMN dev_mode INTEGER DEFAULT 0');
  } catch (err) {
    // column already exists
  }

  const columns = await db.all('PRAGMA table_info(leaderboard)');
  const hasBornAt = columns.some((c: any) => c.name === 'born_at');

  if (!hasBornAt) {
    await db.run('BEGIN TRANSACTION');
    try {
      await db.exec(`
        CREATE TABLE leaderboard_v2 (
          backup_id TEXT NOT NULL,
          born_at TEXT NOT NULL DEFAULT '',
          companion_name TEXT NOT NULL,
          stage TEXT NOT NULL,
          active_seconds INTEGER NOT NULL,
          tokens_eaten REAL NOT NULL,
          crumbs INTEGER NOT NULL,
          dev_mode INTEGER NOT NULL DEFAULT 0,
          dead INTEGER NOT NULL DEFAULT 0,
          died_at TEXT,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (backup_id, born_at)
        );

        INSERT INTO leaderboard_v2 (backup_id, born_at, companion_name, stage, active_seconds, tokens_eaten, crumbs, dev_mode, dead, died_at, updated_at)
        SELECT l.backup_id, COALESCE(json_extract(b.save_data, '$.game.bornAtIso'), ''), l.companion_name, l.stage, l.active_seconds, l.tokens_eaten, l.crumbs, 0, 0, NULL, l.updated_at
        FROM leaderboard l LEFT JOIN backups b ON b.id = l.backup_id
        WHERE COALESCE(l.dev_mode, 0) = 0;

        DROP TABLE leaderboard;
        ALTER TABLE leaderboard_v2 RENAME TO leaderboard;
      `);
      await db.run('COMMIT');
    } catch (err) {
      await db.run('ROLLBACK');
      throw err;
    }
  }

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_leaderboard_tokens ON leaderboard(tokens_eaten DESC);
    CREATE INDEX IF NOT EXISTS idx_leaderboard_active ON leaderboard(active_seconds DESC);
    CREATE INDEX IF NOT EXISTS idx_leaderboard_crumbs ON leaderboard(crumbs DESC);
  `);

  console.log(`Database initialized at ${DB_PATH}`);
}

// REST Endpoints

// 1. Sync backup and optionally leaderboard
app.post('/api/sync', async (req, res) => {
  const { backupId, saveData, submitToLeaderboard } = req.body;

  if (typeof backupId !== 'string' || !BACKUP_ID_RE.test(backupId)) {
    return res.status(400).json({ error: 'Missing or invalid backupId' });
  }

  const now = new Date().toISOString();
  let saveDataStr: string | null = null;
  if (saveData) {
    saveDataStr = JSON.stringify(saveData);
    if (Buffer.byteLength(saveDataStr, 'utf8') > MAX_SAVE_DATA_BYTES) {
      return res.status(413).json({ error: 'saveData too large' });
    }
  }

  try {
    await db.run('BEGIN TRANSACTION');

    if (saveData) {
      await db.run(
        `INSERT INTO backups (id, save_data, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET save_data = excluded.save_data, updated_at = excluded.updated_at`,
        [backupId, saveDataStr, now]
      );

      if (submitToLeaderboard) {
        const companion = saveData.game?.companion;
        const crumbs = clampNum(saveData.game?.wallet?.crumbs ?? 0);
        const devMode = saveData.devMode ? 1 : 0;
        const bornAt = typeof saveData.game?.bornAtIso === 'string' ? saveData.game.bornAtIso.slice(0, 40) : '';

        if (bornAt) {
          await db.run(
            `UPDATE OR IGNORE leaderboard SET born_at = ? WHERE backup_id = ? AND born_at = '' AND dead = 0`,
            [bornAt, backupId]
          );
        }

        const sanitizedName = sanitizeName(companion?.name);
        if (companion && sanitizedName) {
          const stage = validateStage(companion.stage);
          const activeSeconds = clampNum(companion.activeSeconds ?? 0);
          const tokensEaten = clampNum(companion.tokensEaten ?? 0);
          const dead = companion.dead ? 1 : 0;
          const diedAt = companion.dead ? now : null;

          await db.run(
            `INSERT INTO leaderboard (backup_id, born_at, companion_name, stage, active_seconds, tokens_eaten, crumbs, dev_mode, dead, died_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(backup_id, born_at) DO UPDATE SET
               companion_name = excluded.companion_name,
               stage = excluded.stage,
               active_seconds = excluded.active_seconds,
               tokens_eaten = excluded.tokens_eaten,
               crumbs = excluded.crumbs,
               dev_mode = MAX(leaderboard.dev_mode, excluded.dev_mode),
               dead = excluded.dead,
               died_at = CASE WHEN excluded.dead = 1 THEN COALESCE(leaderboard.died_at, excluded.died_at) ELSE NULL END,
               updated_at = excluded.updated_at
             WHERE leaderboard.dead = 0`,
            [backupId, bornAt, sanitizedName, stage, activeSeconds, tokensEaten, crumbs, devMode, dead, diedAt, now]
          );
        }

        const memorial = Array.isArray(saveData.game?.memorial) ? saveData.game.memorial.slice(0, 200) : [];
        for (const entry of memorial) {
          const entryBornAt = typeof entry?.bornAtIso === 'string' ? entry.bornAtIso.slice(0, 40) : '';
          const entryName = sanitizeName(entry?.name);
          if (!entryBornAt || !entryName) continue;

          const stage = validateStage(entry.stage);
          const activeSeconds = clampNum(entry.activeSeconds ?? 0);
          const diedAt = typeof entry?.diedAtIso === 'string' ? entry.diedAtIso : now;

          await db.run(
            `INSERT INTO leaderboard (backup_id, born_at, companion_name, stage, active_seconds, tokens_eaten, crumbs, dev_mode, dead, died_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 0, 0, ?, 1, ?, ?)
             ON CONFLICT(backup_id, born_at) DO UPDATE SET
               dead = 1,
               died_at = COALESCE(leaderboard.died_at, excluded.died_at),
               stage = excluded.stage,
               active_seconds = excluded.active_seconds,
               updated_at = excluded.updated_at
             WHERE leaderboard.dead = 0`,
            [backupId, entryBornAt, entryName, stage, activeSeconds, devMode, diedAt, now]
          );
        }
      }
    }

    await db.run('COMMIT');
    return res.json({ success: true, message: 'Sync completed successfully' });
  } catch (error) {
    try {
      await db.run('ROLLBACK');
    } catch (rbError) {
      console.error('Failed to rollback transaction', rbError);
    }
    console.error('Sync error:', error);
    return res.status(500).json({ error: 'Internal server error during sync' });
  }
});

// 2. Restore backup
app.get('/api/restore/:backupId', async (req, res) => {
  const { backupId } = req.params;

  try {
    const row = await db.get('SELECT save_data FROM backups WHERE id = ?', [backupId]);
    if (!row) {
      return res.status(404).json({ error: 'Backup not found' });
    }

    const saveData = JSON.parse(row.save_data);
    return res.json({ success: true, saveData });
  } catch (error) {
    console.error('Restore error:', error);
    return res.status(500).json({ error: 'Internal server error during restore' });
  }
});

// 3. Retrieve leaderboard rankings
app.get('/api/leaderboard', async (req, res) => {
  const sortBy = req.query.sortBy as string;
  let orderByField = 'tokens_eaten';

  if (sortBy === 'active_seconds') {
    orderByField = 'active_seconds';
  } else if (sortBy === 'crumbs') {
    orderByField = 'crumbs';
  }

  const aliveOnly = req.query.scope === 'alive';

  try {
    const rows = await db.all(
      `SELECT companion_name, stage, active_seconds, tokens_eaten, crumbs, dead, died_at, updated_at
       FROM leaderboard
       WHERE dev_mode = 0 ${aliveOnly ? 'AND dead = 0' : ''}
       ORDER BY ${orderByField} DESC
       LIMIT 100`
    );

    return res.json({ success: true, rankings: rows });
  } catch (error) {
    console.error('Leaderboard error:', error);
    return res.status(500).json({ error: 'Internal server error during leaderboard retrieval' });
  }
});

// Start Server
initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database', err);
    process.exit(1);
  });

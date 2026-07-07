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

app.use(cors());
app.use(express.json({ limit: '10mb' })); // Support larger backup size if needed

// Initialize Database
let db: any;
async function initDb() {
  db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database,
  });

  // Enable foreign keys
  await db.run('PRAGMA foreign_keys = ON');

  // Create tables
  await db.exec(`
    CREATE TABLE IF NOT EXISTS backups (
      id TEXT PRIMARY KEY,
      save_data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS leaderboard (
      backup_id TEXT PRIMARY KEY,
      companion_name TEXT NOT NULL,
      stage TEXT NOT NULL,
      active_seconds INTEGER NOT NULL,
      tokens_eaten REAL NOT NULL,
      crumbs INTEGER NOT NULL,
      dev_mode INTEGER DEFAULT 0,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (backup_id) REFERENCES backups (id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_leaderboard_tokens ON leaderboard(tokens_eaten DESC);
    CREATE INDEX IF NOT EXISTS idx_leaderboard_active ON leaderboard(active_seconds DESC);
    CREATE INDEX IF NOT EXISTS idx_leaderboard_crumbs ON leaderboard(crumbs DESC);
  `);

  // Migration: add dev_mode column if it doesn't exist
  try {
    await db.run('ALTER TABLE leaderboard ADD COLUMN dev_mode INTEGER DEFAULT 0');
  } catch (err) {
    // Ignore error if column already exists
  }

  console.log(`Database initialized at ${DB_PATH}`);
}

// REST Endpoints

// 1. Sync backup and optionally leaderboard
app.post('/api/sync', async (req, res) => {
  const { backupId, saveData, submitToLeaderboard } = req.body;

  if (!backupId || typeof backupId !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid backupId' });
  }

  const now = new Date().toISOString();

  try {
    // Start transaction for consistency
    await db.run('BEGIN TRANSACTION');

    if (saveData) {
      const saveDataStr = JSON.stringify(saveData);
      
      // Upsert backup
      await db.run(
        `INSERT INTO backups (id, save_data, updated_at) 
         VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET save_data = excluded.save_data, updated_at = excluded.updated_at`,
        [backupId, saveDataStr, now]
      );

      // If requested, and the save contains a companion, update the leaderboard
      if (submitToLeaderboard) {
        const companion = saveData.game?.companion;
        const crumbs = saveData.game?.wallet?.crumbs ?? 0;
        
        if (companion && companion.name && !companion.dead) {
          const devMode = saveData.devMode ? 1 : 0;
          await db.run(
            `INSERT INTO leaderboard (backup_id, companion_name, stage, active_seconds, tokens_eaten, crumbs, dev_mode, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(backup_id) DO UPDATE SET 
               companion_name = excluded.companion_name,
               stage = excluded.stage,
               active_seconds = excluded.active_seconds,
               tokens_eaten = excluded.tokens_eaten,
               crumbs = excluded.crumbs,
               dev_mode = excluded.dev_mode,
               updated_at = excluded.updated_at`,
            [
              backupId,
              companion.name,
              companion.stage,
              companion.activeSeconds ?? 0,
              companion.tokensEaten ?? 0,
              crumbs,
              devMode,
              now
            ]
          );
        } else if (companion && companion.dead) {
          // If the companion died, remove it from the active leaderboard
          await db.run('DELETE FROM leaderboard WHERE backup_id = ?', [backupId]);
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

  try {
    const rows = await db.all(
      `SELECT companion_name, stage, active_seconds, tokens_eaten, crumbs, dev_mode, updated_at
       FROM leaderboard
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

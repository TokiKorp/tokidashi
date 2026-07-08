import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { hashPassword, generateTempPassword, PASSWORD_MIN, PASSWORD_MAX } from './auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_DIR = process.env.DB_DIR || path.join(__dirname, '../data');
const DB_PATH = path.join(DB_DIR, 'tokidachi.db');

function usage(): never {
  console.error('Usage: node dist/reset-password.js <pseudo> [--set <newPassword>]');
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  const pseudo = args[0];
  if (!pseudo || pseudo.startsWith('--')) usage();

  let explicitPassword: string | null = null;
  const setIdx = args.indexOf('--set');
  if (setIdx !== -1) {
    explicitPassword = args[setIdx + 1] ?? null;
    if (!explicitPassword) usage();
    if (explicitPassword.length < PASSWORD_MIN || explicitPassword.length > PASSWORD_MAX) {
      console.error(`Password must be between ${PASSWORD_MIN} and ${PASSWORD_MAX} characters.`);
      process.exit(1);
    }
  }

  const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
  const account = await db.get('SELECT id FROM accounts WHERE pseudo = ? COLLATE NOCASE', [pseudo]);
  if (!account) {
    console.error(`No account found for pseudo "${pseudo}".`);
    await db.close();
    process.exit(2);
  }

  const newPassword = explicitPassword ?? generateTempPassword();
  const passwordHash = await hashPassword(newPassword);
  await db.run('UPDATE accounts SET password_hash = ? WHERE id = ?', [passwordHash, account.id]);
  await db.run('DELETE FROM sessions WHERE account_id = ?', [account.id]);
  await db.close();

  if (explicitPassword) {
    console.log(`Password updated for "${pseudo}". All sessions revoked.`);
  } else {
    console.log(`New password for "${pseudo}": ${newPassword}`);
    console.log('All sessions revoked.');
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});

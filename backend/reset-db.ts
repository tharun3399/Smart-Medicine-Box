import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Path to SQLite DB (same as server.ts)
const rootDir = process.cwd();
const dbPath = path.join(rootDir, 'backend', 'auth.db');

if (!fs.existsSync(dbPath)) {
  console.error('[reset-db] Database file not found at', dbPath);
  process.exit(1);
}

console.log('[reset-db] Opening database at', dbPath);
const db = new Database(dbPath);

try {
  db.exec(`
    DELETE FROM users;
    DELETE FROM medicines;
    VACUUM;
  `);
  console.log('[reset-db] All data deleted from users and medicines tables.');
} catch (err) {
  console.error('[reset-db] Failed to reset database:', err);
  process.exitCode = 1;
} finally {
  db.close();
}

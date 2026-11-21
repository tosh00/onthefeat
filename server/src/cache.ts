import { DatabaseSync } from 'node:sqlite';

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;
  db = new DatabaseSync(process.env.DB_PATH ?? (process.env.VITEST ? ':memory:' : './data.sqlite'));
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS cache (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS daily_challenges (
      date TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      source TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS random_challenges (
      token TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);
  return db;
}

export function cacheGet<T>(key: string): T | undefined {
  const row = getDb().prepare('SELECT value, expires_at FROM cache WHERE key = ?').get(key) as
    | { value: string; expires_at: number }
    | undefined;
  if (!row) return undefined;
  if (row.expires_at < Date.now()) {
    getDb().prepare('DELETE FROM cache WHERE key = ?').run(key);
    return undefined;
  }
  return JSON.parse(row.value) as T;
}

export function cacheSet(key: string, value: unknown, ttlMs: number): void {
  getDb()
    .prepare('INSERT OR REPLACE INTO cache (key, value, expires_at) VALUES (?, ?, ?)')
    .run(key, JSON.stringify(value), Date.now() + ttlMs);
}

import Database from "better-sqlite3";
import path from "path";

export const DB_PATH =
  process.env.DB_PATH || path.join(process.cwd(), "data", "crawler.db");

let _readDb: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_readDb) {
    _readDb = new Database(DB_PATH, { readonly: true });
    _readDb.pragma("journal_mode = WAL");
    _readDb.pragma("busy_timeout = 5000");
    _readDb.pragma("synchronous = normal");
    _readDb.pragma("cache_size = -32000");
    _readDb.pragma("mmap_size = 268435456");
    _readDb.pragma("temp_store = memory");
  }
  return _readDb;
}

export function getWriteDb(): Database.Database {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.pragma("foreign_keys = ON");
  db.pragma("synchronous = normal");
  db.pragma("cache_size = -32000");
  db.pragma("mmap_size = 268435456");
  db.pragma("temp_store = memory");
  return db;
}

import Database from "better-sqlite3";
import path from "path";

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "data", "crawler.db");

let _singleton: InstanceType<typeof Database> | null = null;

export function getDb() {
  if (!_singleton) {
    _singleton = new Database(DB_PATH, { readonly: true });
    _singleton.pragma("journal_mode = WAL");
    _singleton.pragma("synchronous = normal");
    _singleton.pragma("cache_size = -32000");
    _singleton.pragma("mmap_size = 268435456");
    _singleton.pragma("temp_store = memory");
    _singleton.pragma("busy_timeout = 5000");
  }
  return _singleton;
}

export function getWriteDb() {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = normal");
  db.pragma("cache_size = -32000");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  return db;
}

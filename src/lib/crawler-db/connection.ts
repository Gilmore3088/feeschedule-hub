import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "crawler.db");

export function getDb() {
  const db = new Database(DB_PATH, { readonly: true });
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = normal");
  db.pragma("cache_size = -32000");
  db.pragma("mmap_size = 268435456");
  db.pragma("temp_store = memory");
  return db;
}

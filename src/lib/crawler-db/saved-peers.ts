import Database from "better-sqlite3";
import path from "path";
import { getDb } from "./connection";

export interface SavedPeerSet {
  id: number;
  name: string;
  tiers: string | null;
  districts: string | null;
  charter_type: string | null;
  created_by: string;
  created_at: string;
}

export function ensureSavedPeerSetsTable(): void {
  const dbPath = path.join(process.cwd(), "data", "crawler.db");
  const db = new Database(dbPath);
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS saved_peer_sets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        tiers TEXT,
        districts TEXT,
        charter_type TEXT,
        created_by TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } finally {
    db.close();
  }
}

export function getSavedPeerSets(userId: string): SavedPeerSet[] {
  ensureSavedPeerSetsTable();
  const db = getDb();
  try {
    return db
      .prepare(
        `SELECT id, name, tiers, districts, charter_type, created_by, created_at
         FROM saved_peer_sets
         WHERE created_by = ?
         ORDER BY created_at DESC`
      )
      .all(userId) as SavedPeerSet[];
  } finally {
    db.close();
  }
}

export function savePeerSet(
  name: string,
  filters: { charter_type?: string; asset_tiers?: string[]; fed_districts?: number[] },
  userId: string
): number {
  ensureSavedPeerSetsTable();
  const dbPath = path.join(process.cwd(), "data", "crawler.db");
  const db = new Database(dbPath);
  try {
    const result = db
      .prepare(
        `INSERT INTO saved_peer_sets (name, tiers, districts, charter_type, created_by)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        name,
        filters.asset_tiers?.join(",") ?? null,
        filters.fed_districts?.join(",") ?? null,
        filters.charter_type ?? null,
        userId
      );
    return Number(result.lastInsertRowid);
  } finally {
    db.close();
  }
}

export function deletePeerSet(id: number, userId: string): boolean {
  ensureSavedPeerSetsTable();
  const dbPath = path.join(process.cwd(), "data", "crawler.db");
  const db = new Database(dbPath);
  try {
    const result = db
      .prepare("DELETE FROM saved_peer_sets WHERE id = ? AND created_by = ?")
      .run(id, userId);
    return result.changes > 0;
  } finally {
    db.close();
  }
}

import { sql } from "./connection";

export interface SavedPeerSet {
  id: number;
  name: string;
  tiers: string | null;
  districts: string | null;
  charter_type: string | null;
  created_by: string;
  created_at: string;
}

export async function ensureSavedPeerSetsTable(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS saved_peer_sets (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      tiers TEXT,
      districts TEXT,
      charter_type TEXT,
      created_by TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;
}

export async function getSavedPeerSets(userId: string): Promise<SavedPeerSet[]> {
  await ensureSavedPeerSetsTable();
  return await sql`
    SELECT id, name, tiers, districts, charter_type, created_by, created_at
    FROM saved_peer_sets
    WHERE created_by = ${userId}
    ORDER BY created_at DESC
  ` as SavedPeerSet[];
}

export async function savePeerSet(
  name: string,
  filters: { charter_type?: string; asset_tiers?: string[]; fed_districts?: number[] },
  userId: string
): Promise<number> {
  await ensureSavedPeerSetsTable();
  const [row] = await sql`
    INSERT INTO saved_peer_sets (name, tiers, districts, charter_type, created_by)
    VALUES (
      ${name},
      ${filters.asset_tiers?.join(",") ?? null},
      ${filters.fed_districts?.join(",") ?? null},
      ${filters.charter_type ?? null},
      ${userId}
    )
    RETURNING id
  `;
  return row.id;
}

export async function deletePeerSet(id: number, userId: string): Promise<boolean> {
  await ensureSavedPeerSetsTable();
  const result = await sql`
    DELETE FROM saved_peer_sets WHERE id = ${id} AND created_by = ${userId}
  `;
  return result.count > 0;
}

"use server";

import { requireAuth } from "@/lib/auth";
import { getDb } from "@/lib/crawler-db/connection";

const MAX_ROWS = 500;
const BLOCKED_KEYWORDS = ["INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE", "ATTACH", "DETACH", "PRAGMA"];

export async function runQuery(
  sql: string
): Promise<{ success: boolean; columns?: string[]; rows?: Record<string, unknown>[]; count?: number; error?: string; duration?: number }> {
  await requireAuth("view");

  const trimmed = sql.trim();
  if (!trimmed) return { success: false, error: "Empty query" };

  // Block write operations
  const upper = trimmed.toUpperCase();
  for (const kw of BLOCKED_KEYWORDS) {
    if (upper.startsWith(kw) || upper.includes(` ${kw} `) || upper.includes(`;${kw}`)) {
      return { success: false, error: `Write operations not allowed: ${kw}` };
    }
  }

  const db = getDb();
  const start = performance.now();

  try {
    const stmt = db.prepare(trimmed);
    const rows = stmt.all() as Record<string, unknown>[];
    const duration = Math.round(performance.now() - start);

    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
    const limited = rows.slice(0, MAX_ROWS);

    return {
      success: true,
      columns,
      rows: limited,
      count: rows.length,
      duration,
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

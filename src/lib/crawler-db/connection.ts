import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;

let _sql: ReturnType<typeof postgres> | null = null;

export function getSql() {
  if (!_sql) {
    if (!DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is required");
    }
    _sql = postgres(DATABASE_URL, {
      ssl: "require",
      max: 3,
      idle_timeout: 10,
      connect_timeout: 10,
    });
  }
  return _sql;
}

// Eager init — DATABASE_URL must be set at import time.
// For tests that import modules without DB access, set DATABASE_URL to any value
// or mock this module.
export const sql = DATABASE_URL
  ? getSql()
  : ((() => { throw new Error("DATABASE_URL not set"); }) as unknown as ReturnType<typeof postgres>);

export async function hasData(): Promise<boolean> {
  try {
    const [row] = await getSql()`SELECT COUNT(*) as cnt FROM crawl_targets`;
    return Number(row.cnt) > 0;
  } catch {
    return false;
  }
}

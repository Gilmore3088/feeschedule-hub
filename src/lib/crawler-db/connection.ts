import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
const DATABASE_URL_SESSION = process.env.DATABASE_URL_SESSION;

let _sql: ReturnType<typeof postgres> | null = null;
let _sqlSession: ReturnType<typeof postgres> | null = null;

/**
 * Session-mode postgres client. REQUIRED for LISTEN/NOTIFY because the
 * transaction-mode pooler (port 6543) does not persist LISTEN registrations
 * across pooled checkouts (research §Pitfall 2). Use ONLY for LISTEN; writes
 * and standard reads continue to use getSql().
 */
export function getSessionSql() {
  if (!_sqlSession) {
    if (!DATABASE_URL_SESSION) {
      throw new Error(
        "DATABASE_URL_SESSION environment variable is required for LISTEN/NOTIFY. " +
          "Set it to the Supabase session-mode pooler DSN (port 5432).",
      );
    }
    _sqlSession = postgres(DATABASE_URL_SESSION, {
      ssl: "require",
      max: 4,
      idle_timeout: 0,
      connect_timeout: 15,
      prepare: false,
    });
  }
  return _sqlSession;
}

export function getSql() {
  if (!_sql) {
    if (!DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is required");
    }
    _sql = postgres(DATABASE_URL, {
      ssl: "require",
      max: 10,
      idle_timeout: 20,
      connect_timeout: 15,
      prepare: false,  // Required for Supabase transaction mode pooler (port 6543)
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

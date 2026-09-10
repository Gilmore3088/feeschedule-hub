import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;

// Serverless instances fan out one pool per invocation, so the safe default
// is small — 3, not 5 — to stay well under the shared Supabase/Supavisor
// connection ceiling under concurrent cold starts. A single long-lived
// server (or a local dev box) can raise this via DATABASE_POOL_MAX.
const DEFAULT_POOL_MAX = 3;

/** Parses DATABASE_POOL_MAX, falling back to DEFAULT_POOL_MAX for anything
 * unset, non-numeric, non-integer, or not positive. */
export function resolvePoolMax(raw: string | undefined): number {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_POOL_MAX;
}

const DATABASE_POOL_MAX = resolvePoolMax(process.env.DATABASE_POOL_MAX);

// Server-side guard against a runaway query holding a pooled connection open.
// This pool is shared by the public site AND the agent pipeline's batch
// queries (hamilton/publish, darwin/verify, run-store), so the timeout has
// to cover the slowest legitimate batch query, not the public pages' own
// render budget — that ~8s figure stays a page-level design concern, not a
// pool setting. 30s protects against a truly runaway query without starving
// batch work.
const DEFAULT_STATEMENT_TIMEOUT_MS = 30000;

/** Parses DATABASE_STATEMENT_TIMEOUT_MS, falling back to
 * DEFAULT_STATEMENT_TIMEOUT_MS for anything unset, non-numeric,
 * non-integer, or not positive. */
export function resolveStatementTimeout(raw: string | undefined): number {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_STATEMENT_TIMEOUT_MS;
}

const STATEMENT_TIMEOUT_MS = resolveStatementTimeout(process.env.DATABASE_STATEMENT_TIMEOUT_MS);

let _sql: ReturnType<typeof postgres> | null = null;

export function getSql() {
  if (!_sql) {
    if (!DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is required");
    }
    _sql = postgres(DATABASE_URL, {
      ssl: "require",
      // Keep serverless instances below the shared Supabase/Supavisor ceiling.
      // Higher fan-out queues locally instead of hanging on connection startup.
      max: DATABASE_POOL_MAX,
      idle_timeout: 20,
      connect_timeout: 15,
      prepare: false,  // Required for Supabase transaction mode pooler (port 6543)
      connection: { statement_timeout: STATEMENT_TIMEOUT_MS },
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

/** Keep transaction callbacks callable despite postgres.js omitting the tag signature from its public transaction type. */
export function withTransaction<T>(callback: (tx: typeof sql) => Promise<T>): Promise<T> {
  return sql.begin((tx) => callback(tx as unknown as typeof sql)) as Promise<T>;
}

export async function hasData(): Promise<boolean> {
  try {
    const [row] = await getSql()`SELECT COUNT(*) as cnt FROM institution_sources`;
    return Number(row.cnt) > 0;
  } catch {
    return false;
  }
}

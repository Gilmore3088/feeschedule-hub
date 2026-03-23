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

// Lazy proxy: doesn't connect until first use (safe for test imports)
export const sql: ReturnType<typeof postgres> = new Proxy({} as ReturnType<typeof postgres>, {
  get(_target, prop) {
    return Reflect.get(getSql(), prop);
  },
  apply(_target, thisArg, args) {
    return Reflect.apply(getSql() as any, thisArg, args);
  },
}) as ReturnType<typeof postgres>;

export async function hasData(): Promise<boolean> {
  try {
    const [row] = await getSql()`SELECT COUNT(*) as cnt FROM crawl_targets`;
    return Number(row.cnt) > 0;
  } catch {
    return false;
  }
}

import postgres from "postgres";
import { readFile } from "node:fs/promises";
import "dotenv/config";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL not set — cannot apply migration");
}

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const migration = await readFile(
  "supabase/migrations/20260418_magellan_bootstrap.sql", "utf8"
);
await sql.unsafe(migration);

const rows = await sql`
  SELECT rescue_status, COUNT(*) FROM crawl_targets
  GROUP BY rescue_status ORDER BY 2 DESC
`;
console.log("rescue_status counts:");
for (const r of rows) console.log("  ", r.rescue_status ?? "NULL", r.count);

const agent = await sql`
  SELECT agent_name, lifecycle_state FROM agent_registry WHERE agent_name='magellan'
`;
console.log("agent:", agent);

await sql.end();

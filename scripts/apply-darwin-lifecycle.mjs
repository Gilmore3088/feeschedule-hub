import postgres from "postgres";
import { readFile } from "node:fs/promises";
import "dotenv/config";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL not set — cannot apply migration");
}

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const migration = await readFile(
  "supabase/migrations/20260417_darwin_lifecycle_q2.sql", "utf8"
);
await sql.unsafe(migration);
const rows = await sql`
  SELECT agent_name, lifecycle_state FROM agent_registry WHERE agent_name='darwin'
`;
console.log(rows);
await sql.end();

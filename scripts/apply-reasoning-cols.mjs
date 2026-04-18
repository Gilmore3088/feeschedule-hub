import postgres from "postgres";
import { readFile } from "node:fs/promises";
import "dotenv/config";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL not set — cannot apply migration");
}

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const migration = await readFile(
  "supabase/migrations/20260418_agent_events_reasoning_text.sql",
  "utf8",
);
await sql.unsafe(migration);

const cols = await sql`
  SELECT column_name
    FROM information_schema.columns
   WHERE table_name = 'agent_events'
     AND column_name IN ('reasoning_prompt_text', 'reasoning_output_text', 'reasoning_r2_key')
   ORDER BY ordinal_position
`;
console.log(
  "agent_events new cols:",
  cols.map((r) => r.column_name),
);
await sql.end();

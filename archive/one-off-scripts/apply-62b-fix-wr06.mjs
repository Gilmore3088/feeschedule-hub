import fs from 'fs';
import postgres from 'postgres';
import { config } from 'dotenv';
config();
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
try {
  await sql.unsafe(
    fs.readFileSync(
      'supabase/migrations/20260517_lineage_graph_missing_tier_guards.sql',
      'utf8',
    ),
  );
  console.log('OK  20260517_lineage_graph_missing_tier_guards.sql');
  // Smoke: call the function with a fee_published_id we expect to not exist.
  const r = await sql`SELECT lineage_graph(-1::BIGINT) AS g`;
  console.log('lineage_graph(-1) =>', JSON.stringify(r[0].g));
} catch (err) {
  console.error('FAIL:', err.message);
  process.exitCode = 1;
}
await sql.end();

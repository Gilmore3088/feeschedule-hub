import fs from 'fs';
import postgres from 'postgres';
import { config } from 'dotenv';
config();
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
try {
  await sql.unsafe(
    fs.readFileSync(
      'supabase/migrations/20260514_fix_agent_health_rollup_metrics.sql',
      'utf8',
    ),
  );
  console.log('OK  20260514_fix_agent_health_rollup_metrics.sql');
  // Smoke: call the function and confirm it returns an integer (no longer a
  // NULLIF-on-zero-denominator crash, no runtime errors from the join).
  const r = await sql`SELECT refresh_agent_health_rollup() AS n`;
  console.log('refresh_agent_health_rollup() returned:', r[0].n);
} catch (err) {
  console.error('FAIL:', err.message);
  process.exitCode = 1;
}
await sql.end();

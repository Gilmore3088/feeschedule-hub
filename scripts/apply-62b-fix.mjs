import fs from 'fs';
import postgres from 'postgres';
import { config } from 'dotenv';
config();
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
try {
  await sql.unsafe(fs.readFileSync('supabase/migrations/20260513_fix_refresh_agent_health_rollup.sql', 'utf8'));
  console.log('OK  20260513_fix_refresh_agent_health_rollup.sql');
  await sql.unsafe(fs.readFileSync('supabase/migrations/20260512_agent_health_rollup_seed.sql', 'utf8'));
  console.log('OK  20260512_agent_health_rollup_seed.sql (retry)');
  const result = await sql`SELECT COUNT(*) FROM agent_health_rollup`;
  console.log('agent_health_rollup row count:', result[0].count);
} catch (err) {
  console.error('FAIL:', err.message);
  process.exitCode = 1;
}
await sql.end();

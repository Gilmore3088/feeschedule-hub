import fs from 'fs';
import path from 'path';
import postgres from 'postgres';
import { config } from 'dotenv';
config();
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
const files = [
  '20260511_pg_cron_review_dispatcher.sql',
  '20260512_agent_health_rollup_seed.sql',
];
let failed = null;
for (const f of files) {
  try {
    await sql.unsafe(fs.readFileSync(path.join('supabase/migrations', f), 'utf8'));
    console.log(`OK  ${f}`);
  } catch (err) {
    console.error(`FAIL ${f}: ${err.message}`);
    failed = f;
    break;
  }
}
await sql.end();
process.exit(failed ? 1 : 0);

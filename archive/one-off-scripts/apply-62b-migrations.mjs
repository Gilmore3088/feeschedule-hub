import fs from 'fs';
import path from 'path';
import postgres from 'postgres';
import { config } from 'dotenv';

config();

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });

const files = [
  '20260501_agent_events_status_widen.sql',
  '20260502_agent_registry_lifecycle_state.sql',
  '20260503_agent_lessons.sql',
  '20260504_shadow_outputs.sql',
  '20260505_canary_runs.sql',
  '20260506_lineage_graph_function.sql',
  '20260507_v_agent_reasoning_trace.sql',
  '20260508_agent_messages_notify_trigger.sql',
  '20260509_agent_health_rollup.sql',
  '20260510_promote_to_tier3_tighten.sql',
];

let failedAt = null;
for (const f of files) {
  const p = path.join('supabase/migrations', f);
  const body = fs.readFileSync(p, 'utf8');
  try {
    await sql.unsafe(body);
    console.log(`OK  ${f}`);
  } catch (err) {
    console.error(`FAIL ${f}: ${err.message}`);
    failedAt = f;
    break;
  }
}
await sql.end();
process.exit(failedAt ? 1 : 0);

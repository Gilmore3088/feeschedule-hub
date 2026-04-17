import postgres from 'postgres';
import { config } from 'dotenv';

config();
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });

const check = async (label, fn, expect) => {
  try {
    const result = await fn();
    const ok = expect(result);
    console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: ${JSON.stringify(result)}`);
    return ok;
  } catch (err) {
    console.log(`ERR  ${label}: ${err.message}`);
    return false;
  }
};

let allPass = true;

// 1. status CHECK widened
allPass &= await check(
  '1. agent_events.status CHECK widened',
  () => sql`SELECT check_clause FROM information_schema.check_constraints WHERE constraint_name = 'agent_events_status_check'`,
  (rows) => rows[0] && rows[0].check_clause && rows[0].check_clause.includes('improve_rejected') && rows[0].check_clause.includes('shadow_diff')
);

// 2. agent_registry new columns
allPass &= await check(
  '2. agent_registry lifecycle_state + review_schedule',
  () => sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'agent_registry' AND column_name IN ('lifecycle_state','review_schedule') ORDER BY column_name`,
  (rows) => rows.length === 2 && rows[0].column_name === 'lifecycle_state' && rows[1].column_name === 'review_schedule'
);

// 3. New functions (agent_messages_notify, lineage_graph, refresh_agent_health_rollup)
allPass &= await check(
  '3. 3 new functions present',
  () => sql`SELECT proname FROM pg_proc WHERE proname IN ('lineage_graph','agent_messages_notify','refresh_agent_health_rollup') ORDER BY proname`,
  (rows) => rows.length === 3
);

// 4. NOTIFY trigger installed
allPass &= await check(
  '4. agent_messages_notify_trigger installed',
  () => sql`SELECT tgname FROM pg_trigger WHERE tgname = 'agent_messages_notify_trigger'`,
  (rows) => rows.length >= 1
);

// 5. 4 new tables present
allPass &= await check(
  '5. 4 new tables (agent_lessons, shadow_outputs, canary_runs, agent_health_rollup)',
  () => sql`SELECT table_name FROM information_schema.tables WHERE table_name IN ('agent_lessons','shadow_outputs','canary_runs','agent_health_rollup') ORDER BY table_name`,
  (rows) => rows.length === 4
);

// 6. lineage_graph smoke test
allPass &= await check(
  '6. lineage_graph(-1::BIGINT) returns error JSON',
  () => sql`SELECT lineage_graph(-1::BIGINT) as r`,
  (rows) => rows[0] && rows[0].r && (rows[0].r.error || JSON.stringify(rows[0].r).includes('not found'))
);

// 7. promote_to_tier3 hard-fail (should raise)
const q7 = await sql`SELECT fee_verified_id FROM fees_verified LIMIT 1`;
if (q7.length === 0) {
  console.log('SKIP 7. promote_to_tier3: no fees_verified rows yet (table empty) — tighten will be tested when handshakes land');
} else {
  const feeId = q7[0].fee_verified_id;
  try {
    await sql`SELECT promote_to_tier3(${feeId}::BIGINT, gen_random_uuid())`;
    console.log('FAIL 7. promote_to_tier3 did NOT raise exception');
    allPass = false;
  } catch (err) {
    if (err.message && err.message.includes('adversarial handshake incomplete')) {
      console.log('PASS 7. promote_to_tier3 raised adversarial handshake incomplete');
    } else {
      console.log('FAIL 7. promote_to_tier3 raised different error: ' + err.message);
      allPass = false;
    }
  }
}

await sql.end();
process.exit(allPass ? 0 : 1);

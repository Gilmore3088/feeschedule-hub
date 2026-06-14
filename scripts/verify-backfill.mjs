import postgres from "postgres";
import "dotenv/config";
const sql = postgres(process.env.DATABASE_URL, { prepare: false });
try {
  const stranded = (await sql`SELECT COUNT(*)::int AS n FROM fees_raw WHERE source='migration_v10' AND agent_event_id='00000000-0000-0000-0000-000000000000'::uuid`)[0].n;
  const relinked = (await sql`SELECT COUNT(*)::int AS n FROM fees_raw WHERE source='migration_v10' AND agent_event_id <> '00000000-0000-0000-0000-000000000000'::uuid`)[0].n;
  const flaggedRemaining = (await sql`SELECT COUNT(*)::int AS n FROM fees_raw WHERE source='migration_v10' AND outlier_flags @> '["lineage_missing"]'::jsonb`)[0].n;
  const backfillEvents = (await sql`SELECT COUNT(*)::int AS n FROM agent_events WHERE agent_name='legacy_backfill' AND action='migration_v10_lineage'`)[0].n;
  console.log("=== Backfill verification ===");
  console.log(`stranded (zero-UUID):       ${stranded}   ← must be 0`);
  console.log(`relinked (real UUID):       ${relinked}`);
  console.log(`lineage_missing flag left:  ${flaggedRemaining}   ← must be 0`);
  console.log(`backfill agent_events:      ${backfillEvents}   ← should be 3948`);

  // Spot-check Space Coast
  console.log("\n=== Space Coast (8109) after backfill ===");
  const sc = await sql`SELECT fee_raw_id, fee_name, amount, agent_event_id, outlier_flags FROM fees_raw WHERE institution_id=8109 LIMIT 3`;
  for (const r of sc) console.log(` ${r.fee_raw_id} ${r.fee_name} $${r.amount} → ${r.agent_event_id} flags=${JSON.stringify(r.outlier_flags)}`);
} catch (e) { console.error("ERR:", e.message); }
await sql.end();

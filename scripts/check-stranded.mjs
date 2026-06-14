import postgres from "postgres";
import "dotenv/config";
const sql = postgres(process.env.DATABASE_URL, { prepare: false });
try {
  const total = await sql`SELECT COUNT(*)::int AS n FROM fees_raw WHERE agent_event_id = '00000000-0000-0000-0000-000000000000'::uuid OR 'lineage_missing' = ANY(SELECT jsonb_array_elements_text(outlier_flags))`;
  const promotable = await sql`SELECT COUNT(*)::int AS n FROM fees_raw WHERE agent_event_id <> '00000000-0000-0000-0000-000000000000'::uuid`;
  const bySource = await sql`SELECT source, COUNT(*)::int AS n FROM fees_raw GROUP BY source ORDER BY n DESC LIMIT 8`;
  const stranded_insts = await sql`SELECT COUNT(DISTINCT institution_id)::int AS n FROM fees_raw WHERE agent_event_id = '00000000-0000-0000-0000-000000000000'::uuid`;
  console.log("fees_raw with zero-UUID lineage (stranded):", total[0].n);
  console.log("fees_raw with real agent_event_id (promotable):", promotable[0].n);
  console.log("distinct institutions stranded by lineage:", stranded_insts[0].n);
  console.log("\nby source:");
  for (const r of bySource) console.log(`  ${r.source ?? "NULL"}: ${r.n}`);
} catch (e) { console.error("ERR:", e.message); }
await sql.end();

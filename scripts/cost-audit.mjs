import postgres from "postgres";
import "dotenv/config";
const sql = postgres(process.env.DATABASE_URL, { prepare: false });
try {
  const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='agent_budgets' ORDER BY ordinal_position`;
  console.log("agent_budgets cols:", cols.map(c => c.column_name).join(", "));
  const budgets = await sql`SELECT * FROM agent_budgets ORDER BY agent_name LIMIT 20`;
  console.log("\nbudget rows:");
  for (const b of budgets) console.log(" ", JSON.stringify(b));

  console.log("\n=== RECENT API SPEND (last 7d, agent_events.cost_cents) ===");
  const spend = await sql`SELECT agent_name, COUNT(*)::int AS calls, SUM(cost_cents)::int AS cents FROM agent_events WHERE created_at > NOW() - INTERVAL '7 days' AND cost_cents > 0 GROUP BY agent_name ORDER BY cents DESC LIMIT 10`;
  if (spend.length === 0) console.log("(none)");
  for (const r of spend) console.log(`  ${r.agent_name}: ${r.calls} calls, $${(r.cents/100).toFixed(2)}`);

  console.log("\n=== DARWIN COST SAMPLE (any agent_event with cost_cents) ===");
  const darwinSample = await sql`SELECT agent_name, COUNT(*)::int AS n, AVG(cost_cents)::numeric AS avg_c, MAX(cost_cents)::int AS max_c FROM agent_events WHERE cost_cents > 0 GROUP BY agent_name ORDER BY n DESC LIMIT 5`;
  for (const r of darwinSample) console.log(`  ${r.agent_name}: n=${r.n}, avg=${Number(r.avg_c).toFixed(2)}c, max=${r.max_c}c`);

  console.log("\n=== BACKLOG ===");
  const backlog = await sql`SELECT COUNT(*)::int AS n FROM fees_raw WHERE source='migration_v10' AND agent_event_id = '00000000-0000-0000-0000-000000000000'::uuid`;
  console.log(`  stranded fees_raw: ${backlog[0].n}`);
} catch (e) { console.error("ERR:", e.message); }
await sql.end();

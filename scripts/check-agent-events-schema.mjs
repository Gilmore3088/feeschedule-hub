import postgres from "postgres";
import "dotenv/config";
const sql = postgres(process.env.DATABASE_URL, { prepare: false });
try {
  const cols = await sql`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name='agent_events' ORDER BY ordinal_position`;
  console.log("agent_events schema:");
  for (const c of cols) console.log(`  ${c.column_name}: ${c.data_type} ${c.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'} default=${c.column_default ?? '-'}`);
  console.log("\nrow count:", (await sql`SELECT COUNT(*)::int AS n FROM agent_events`)[0].n);
  const sample = await sql`SELECT * FROM agent_events ORDER BY created_at DESC LIMIT 1`;
  console.log("\nlatest row:");
  if (sample[0]) for (const [k, v] of Object.entries(sample[0])) console.log(`  ${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
} catch (e) { console.error("ERR:", e.message); }
await sql.end();

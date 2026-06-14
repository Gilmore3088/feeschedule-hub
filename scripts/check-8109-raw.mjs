import postgres from "postgres";
import "dotenv/config";
const sql = postgres(process.env.DATABASE_URL, { prepare: false });
try {
  const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='fees_raw' ORDER BY ordinal_position`;
  console.log("fees_raw columns:", cols.map(c => c.column_name).join(", "));
  const raws = await sql`SELECT * FROM fees_raw WHERE institution_id=8109 ORDER BY created_at DESC LIMIT 20`;
  console.log("\nrow count:", raws.length);
  if (raws[0]) {
    console.log("\nsample row:");
    for (const [k, v] of Object.entries(raws[0])) console.log(`  ${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
  }
} catch (e) { console.error("ERR:", e.message); }
await sql.end();

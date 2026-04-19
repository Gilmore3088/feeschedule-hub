import postgres from "postgres";
import { config } from "dotenv";
config();

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });

async function main() {
  console.log("=== schema_migrations tracking ===");
  const mig = await sql`SELECT filename, applied_at FROM schema_migrations ORDER BY applied_at`;
  for (const r of mig) console.log(`  ${r.applied_at.toISOString()}  ${r.filename}`);

  console.log("\n=== crawl_targets identity columns ===");
  const cols = await sql`
    SELECT column_name, data_type
      FROM information_schema.columns
     WHERE table_name = 'crawl_targets'
       AND column_name IN ('rssd_id','ncua_charter_id','routing_number','lei','cert_number')
     ORDER BY column_name
  `;
  for (const r of cols) console.log(`  ${r.column_name.padEnd(20)} ${r.data_type}`);

  console.log("\n=== classification_history table ===");
  const ch = await sql`
    SELECT column_name, data_type
      FROM information_schema.columns
     WHERE table_name = 'classification_history'
     ORDER BY ordinal_position
  `;
  if (ch.length === 0) console.log("  ❌ NOT FOUND");
  else for (const r of ch) console.log(`  ${r.column_name.padEnd(22)} ${r.data_type}`);

  console.log("\n=== trigger on fees_verified ===");
  const trig = await sql`
    SELECT trigger_name, event_manipulation, action_timing
      FROM information_schema.triggers
     WHERE event_object_table = 'fees_verified'
       AND trigger_name = 'trg_classification_history'
  `;
  if (trig.length === 0) console.log("  ❌ NOT FOUND");
  else for (const r of trig) console.log(`  ${r.trigger_name}  ${r.action_timing} ${r.event_manipulation}`);

  console.log("\n=== ncua_charter_id backfill count ===");
  const [cu] = await sql`
    SELECT COUNT(*)::int AS filled
      FROM crawl_targets
     WHERE source = 'ncua' AND ncua_charter_id IS NOT NULL
  `;
  console.log(`  ${cu.filled} credit-union rows now have ncua_charter_id populated`);

  console.log("\n=== indexes on crawl_targets identity columns ===");
  const idx = await sql`
    SELECT indexname FROM pg_indexes
     WHERE tablename = 'crawl_targets'
       AND (indexname LIKE '%rssd%' OR indexname LIKE '%ncua%'
            OR indexname LIKE '%routing%' OR indexname LIKE '%lei%')
     ORDER BY indexname
  `;
  for (const r of idx) console.log(`  ${r.indexname}`);
}

try {
  await main();
} finally {
  await sql.end();
}

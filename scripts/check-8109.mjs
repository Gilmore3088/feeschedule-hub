import postgres from "postgres";
import "dotenv/config";
const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }
const sql = postgres(url, { prepare: false });
try {
  const ct = await sql`SELECT id, institution_name, fee_schedule_url, charter_type, asset_size_tier, state_code, fed_district FROM crawl_targets WHERE id=8109`;
  console.log("crawl_target:", JSON.stringify(ct[0] ?? null, null, 2));
  const fr = await sql`SELECT COUNT(*)::int AS n FROM fees_raw WHERE institution_id=8109`;
  const fv = await sql`SELECT review_status, COUNT(*)::int AS n FROM fees_verified WHERE institution_id=8109 GROUP BY review_status`;
  const fp = await sql`SELECT COUNT(*)::int AS n FROM fees_published WHERE institution_id=8109`;
  console.log("\nfees_raw:", fr[0].n);
  console.log("fees_verified by status:", fv);
  console.log("fees_published:", fp[0].n);
  const recent = await sql`SELECT fee_name, amount, canonical_fee_key, review_status FROM fees_verified WHERE institution_id=8109 LIMIT 5`;
  console.log("\nsample verified:", recent);
  const crawls = await sql`SELECT id, status, started_at, completed_at, error_message FROM crawls WHERE crawl_target_id=8109 ORDER BY started_at DESC LIMIT 5`;
  console.log("\nrecent crawls:", crawls);
} catch (e) { console.error("ERR:", e.message); }
await sql.end();

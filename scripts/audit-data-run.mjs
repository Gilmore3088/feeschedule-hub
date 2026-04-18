import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { prepare: false });
const q = async (label, s) => {
  try {
    const r = await s;
    return { metric: label, value: r };
  } catch (e) {
    return { metric: label, error: String(e).slice(0, 100) };
  }
};
const results = [];
results.push(await q('total_institutions', sql`SELECT COUNT(*)::int AS cnt FROM crawl_targets`.then(r => r[0].cnt)));
results.push(await q('fee_rows_total', sql`SELECT COUNT(*)::int AS cnt FROM extracted_fees`.then(r => r[0].cnt)));
results.push(await q('review_distribution', sql`SELECT review_status, COUNT(*)::int AS cnt FROM extracted_fees GROUP BY 1 ORDER BY cnt DESC`));
results.push(await q('null_amount_non_free', sql`SELECT COUNT(*)::int AS cnt FROM extracted_fees WHERE amount IS NULL AND fee_category IS NOT NULL AND fee_category NOT LIKE '%free%'`.then(r => r[0].cnt)));
results.push(await q('uncategorized_fees', sql`SELECT COUNT(*)::int AS cnt FROM extracted_fees WHERE fee_category IS NULL OR fee_category = ''`.then(r => r[0].cnt)));
results.push(await q('stale_90d_pct', sql`SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE last_crawl_at < NOW() - INTERVAL '90 days' OR last_crawl_at IS NULL) / NULLIF(COUNT(*),0), 1) AS pct FROM crawl_targets`.then(r => r[0].pct)));
results.push(await q('invalid_state_codes', sql`SELECT state_code, COUNT(*)::int AS cnt FROM crawl_targets WHERE state_code NOT IN ('AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','PR','VI','GU','AS') AND state_code IS NOT NULL GROUP BY 1 ORDER BY cnt DESC LIMIT 10`));
results.push(await q('duplicate_fee_names_count', sql`SELECT COUNT(*)::int AS cnt FROM (SELECT crawl_target_id, fee_name FROM extracted_fees GROUP BY 1,2 HAVING COUNT(*) > 1) d`.then(r => r[0].cnt)));
results.push(await q('institutions_without_fees', sql`SELECT COUNT(*)::int AS cnt FROM crawl_targets t WHERE NOT EXISTS (SELECT 1 FROM extracted_fees f WHERE f.crawl_target_id = t.id)`.then(r => r[0].cnt)));
console.log(JSON.stringify(results, null, 2));
await sql.end();

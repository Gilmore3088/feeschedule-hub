import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { prepare: false });

console.log('=== Sample duplicate groups (top 5 by size) ===');
const samples = await sql`
  SELECT crawl_target_id, fee_name, COUNT(*) AS n
  FROM extracted_fees
  GROUP BY 1, 2
  HAVING COUNT(*) > 1
  ORDER BY n DESC
  LIMIT 5
`;
for (const s of samples) {
  console.log(`\ntarget=${s.crawl_target_id} name=${JSON.stringify(s.fee_name)} count=${s.n}`);
  const rows = await sql`
    SELECT id, amount, fee_category, review_status, extraction_confidence, created_at
    FROM extracted_fees
    WHERE crawl_target_id = ${s.crawl_target_id} AND fee_name = ${s.fee_name}
    ORDER BY created_at
  `;
  for (const r of rows) {
    console.log(`  id=${r.id} amount=${r.amount} cat=${r.fee_category} status=${r.review_status} conf=${r.extraction_confidence} at=${r.created_at}`);
  }
}

console.log('\n=== Preview: rows that would be removed ===');
const [preview] = await sql`
  WITH ranked AS (
    SELECT
      id, crawl_target_id, fee_name, review_status, extraction_confidence, created_at,
      ROW_NUMBER() OVER (
        PARTITION BY crawl_target_id, fee_name
        ORDER BY
          CASE review_status
            WHEN 'approved' THEN 1
            WHEN 'staged'   THEN 2
            WHEN 'flagged'  THEN 3
            WHEN 'pending'  THEN 4
            WHEN 'rejected' THEN 5
            ELSE 6
          END,
          COALESCE(extraction_confidence, 0) DESC,
          created_at DESC,
          id DESC
      ) AS rn
    FROM extracted_fees
  )
  SELECT
    COUNT(*) FILTER (WHERE rn > 1)::int AS would_remove,
    COUNT(*) FILTER (WHERE rn = 1)::int AS would_keep,
    COUNT(DISTINCT (crawl_target_id, fee_name)) FILTER (WHERE rn > 1)::int AS affected_groups
  FROM ranked
`;
console.log(JSON.stringify(preview, null, 2));

console.log('\n=== By review_status of losers ===');
const byStatus = await sql`
  WITH ranked AS (
    SELECT
      id, review_status,
      ROW_NUMBER() OVER (
        PARTITION BY crawl_target_id, fee_name
        ORDER BY
          CASE review_status
            WHEN 'approved' THEN 1
            WHEN 'staged'   THEN 2
            WHEN 'flagged'  THEN 3
            WHEN 'pending'  THEN 4
            WHEN 'rejected' THEN 5
            ELSE 6
          END,
          COALESCE(extraction_confidence, 0) DESC,
          created_at DESC,
          id DESC
      ) AS rn
    FROM extracted_fees
  )
  SELECT review_status, COUNT(*)::int AS would_remove
  FROM ranked WHERE rn > 1 GROUP BY 1 ORDER BY 2 DESC
`;
console.table(byStatus);

await sql.end();

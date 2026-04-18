import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { prepare: false });

const [v2] = await sql`
  WITH ranked AS (
    SELECT
      id, review_status, crawl_target_id, fee_name, amount, fee_category,
      ROW_NUMBER() OVER (
        PARTITION BY crawl_target_id, fee_name, amount, fee_category
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
    COUNT(DISTINCT (crawl_target_id, fee_name, amount, fee_category)) FILTER (WHERE rn > 1)::int AS affected_groups
  FROM ranked
`;
console.log('Narrow-key dedup (preserving fee tiers):');
console.log(JSON.stringify(v2, null, 2));

const byStatus = await sql`
  WITH ranked AS (
    SELECT
      id, review_status,
      ROW_NUMBER() OVER (
        PARTITION BY crawl_target_id, fee_name, amount, fee_category
        ORDER BY
          CASE review_status
            WHEN 'approved' THEN 1 WHEN 'staged' THEN 2 WHEN 'flagged' THEN 3
            WHEN 'pending' THEN 4 WHEN 'rejected' THEN 5 ELSE 6
          END,
          COALESCE(extraction_confidence, 0) DESC, created_at DESC, id DESC
      ) AS rn
    FROM extracted_fees
  )
  SELECT review_status, COUNT(*)::int AS would_remove
  FROM ranked WHERE rn > 1 GROUP BY 1 ORDER BY 2 DESC
`;
console.log('\nBy status of losers:');
console.table(byStatus);

await sql.end();

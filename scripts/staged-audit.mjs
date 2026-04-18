import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { prepare: false });

console.log('=== Staged fee confidence distribution ===');
const byConf = await sql`
  SELECT
    CASE
      WHEN extraction_confidence >= 0.99 THEN '0.99-1.00'
      WHEN extraction_confidence >= 0.95 THEN '0.95-0.99'
      WHEN extraction_confidence >= 0.90 THEN '0.90-0.95'
      WHEN extraction_confidence >= 0.85 THEN '0.85-0.90'
      WHEN extraction_confidence >= 0.80 THEN '0.80-0.85'
      WHEN extraction_confidence >= 0.70 THEN '0.70-0.80'
      WHEN extraction_confidence IS NULL THEN 'NULL'
      ELSE '< 0.70'
    END AS band,
    COUNT(*)::int AS cnt
  FROM extracted_fees
  WHERE review_status = 'staged'
  GROUP BY 1
  ORDER BY 1 DESC
`;
console.table(byConf);

console.log('\n=== Staged fees with null amount (cannot contribute to medians) ===');
const [nullAmt] = await sql`
  SELECT COUNT(*)::int AS cnt FROM extracted_fees
  WHERE review_status='staged' AND amount IS NULL
`;
console.log(JSON.stringify(nullAmt));

console.log('\n=== Staged fees with null category ===');
const [nullCat] = await sql`
  SELECT COUNT(*)::int AS cnt FROM extracted_fees
  WHERE review_status='staged' AND (fee_category IS NULL OR fee_category='')
`;
console.log(JSON.stringify(nullCat));

console.log('\n=== Maturity impact: categories that would flip to "strong" (10+ approved) after promote ===');
const maturity = await sql`
  WITH current_counts AS (
    SELECT fee_category,
      COUNT(*) FILTER (WHERE review_status='approved')::int AS approved_now,
      COUNT(*) FILTER (WHERE review_status='staged' AND extraction_confidence >= 0.95 AND amount IS NOT NULL)::int AS would_promote
    FROM extracted_fees
    WHERE fee_category IS NOT NULL AND fee_category != ''
    GROUP BY fee_category
  )
  SELECT fee_category, approved_now, would_promote,
    CASE
      WHEN approved_now >= 10 THEN 'already-strong'
      WHEN approved_now + would_promote >= 10 THEN 'flips-to-strong'
      ELSE 'still-provisional'
    END AS impact
  FROM current_counts
  ORDER BY fee_category
`;
const counts = { 'already-strong': 0, 'flips-to-strong': 0, 'still-provisional': 0 };
let flippedExamples = [];
for (const r of maturity) {
  counts[r.impact]++;
  if (r.impact === 'flips-to-strong') flippedExamples.push(r);
}
console.log(JSON.stringify(counts, null, 2));
console.log('\nCategories that flip to strong:');
console.table(flippedExamples);

await sql.end();

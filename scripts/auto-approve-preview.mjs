import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { prepare: false });

console.log('=== Promotion candidates (would be flipped staged → approved) ===');
const [candidates] = await sql`
  SELECT
    COUNT(*) FILTER (WHERE extraction_confidence >= 0.99 AND amount IS NOT NULL AND fee_category IS NOT NULL)::int AS at_99,
    COUNT(*) FILTER (WHERE extraction_confidence >= 0.95 AND extraction_confidence < 0.99 AND amount IS NOT NULL AND fee_category IS NOT NULL)::int AS at_95_99,
    COUNT(*) FILTER (WHERE extraction_confidence >= 0.90 AND extraction_confidence < 0.95 AND amount IS NOT NULL AND fee_category IS NOT NULL)::int AS at_90_95,
    COUNT(*) FILTER (WHERE extraction_confidence >= 0.95 AND amount IS NOT NULL AND fee_category IS NOT NULL)::int AS total_95_plus
  FROM extracted_fees WHERE review_status = 'staged'
`;
console.table(candidates);

console.log('\n=== Approved count per category AFTER promotion at >=0.95 gate ===');
const after = await sql`
  SELECT fee_category,
    COUNT(*) FILTER (WHERE review_status='approved')::int AS approved_now,
    COUNT(*) FILTER (WHERE review_status='staged' AND extraction_confidence >= 0.95 AND amount IS NOT NULL)::int AS would_add,
    (COUNT(*) FILTER (WHERE review_status='approved') +
     COUNT(*) FILTER (WHERE review_status='staged' AND extraction_confidence >= 0.95 AND amount IS NOT NULL))::int AS approved_after
  FROM extracted_fees
  WHERE fee_category IS NOT NULL AND fee_category != ''
  GROUP BY fee_category
  ORDER BY approved_after DESC
  LIMIT 15
`;
console.table(after);

await sql.end();

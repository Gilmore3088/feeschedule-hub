import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { prepare: false });

console.log('1. Backing up staged rows about to flip ...');
await sql`
  CREATE TABLE IF NOT EXISTS extracted_fees_promote_backup_20260418 AS
  SELECT *, 'staged'::text AS was_status, NOW() AS backed_up_at FROM extracted_fees WHERE 1=0
`;

const result = await sql.begin(async (tx) => {
  await tx`SET LOCAL app.allow_legacy_writes = 'true'`;

  await tx`
    INSERT INTO extracted_fees_promote_backup_20260418
    SELECT *, review_status, NOW()
    FROM extracted_fees
    WHERE review_status = 'staged'
      AND extraction_confidence >= 0.95
      AND amount IS NOT NULL
      AND fee_category IS NOT NULL
      AND fee_category != ''
  `;
  const [bcount] = await tx`SELECT COUNT(*)::int AS n FROM extracted_fees_promote_backup_20260418`;

  const promoted = await tx`
    UPDATE extracted_fees
    SET review_status = 'approved'
    WHERE review_status = 'staged'
      AND extraction_confidence >= 0.95
      AND amount IS NOT NULL
      AND fee_category IS NOT NULL
      AND fee_category != ''
    RETURNING id
  `;

  return { backed_up: bcount.n, promoted: promoted.length };
});

console.log('2. Post-promote distribution:');
const dist = await sql`SELECT review_status, COUNT(*)::int AS cnt FROM extracted_fees GROUP BY 1 ORDER BY cnt DESC`;
console.log(JSON.stringify({ ...result, review_distribution: dist }, null, 2));

console.log('\n3. Top 10 categories after:');
const top = await sql`
  SELECT fee_category,
    COUNT(*) FILTER (WHERE review_status='approved')::int AS approved,
    COUNT(*) FILTER (WHERE review_status='staged')::int AS staged
  FROM extracted_fees WHERE fee_category IS NOT NULL
  GROUP BY 1 ORDER BY approved DESC LIMIT 10
`;
console.table(top);

await sql.end();

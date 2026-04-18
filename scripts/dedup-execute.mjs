import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { prepare: false });

console.log('1. Creating backup tables ...');
await sql`
  CREATE TABLE IF NOT EXISTS extracted_fees_dedup_backup_20260418 (
    LIKE extracted_fees INCLUDING ALL
  )
`;
await sql`ALTER TABLE extracted_fees_dedup_backup_20260418 ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NOW()`;
await sql`
  CREATE TABLE IF NOT EXISTS fee_reviews_dedup_backup_20260418 (
    LIKE fee_reviews INCLUDING ALL
  )
`;
await sql`ALTER TABLE fee_reviews_dedup_backup_20260418 ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NOW()`;

console.log('2. Dedup transaction ...');
const result = await sql.begin(async (tx) => {
  await tx`SET LOCAL app.allow_legacy_writes = 'true'`;

  const losers = await tx`
    WITH ranked AS (
      SELECT id,
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
    SELECT id FROM ranked WHERE rn > 1
  `;
  const ids = losers.map(r => r.id);
  console.log(`   ${ids.length} losers identified`);

  // Backup + delete fee_reviews first (FK dependency)
  await tx`
    INSERT INTO fee_reviews_dedup_backup_20260418
    SELECT *, NOW() FROM fee_reviews WHERE fee_id = ANY(${ids}::int[])
  `;
  const reviewsDel = await tx`DELETE FROM fee_reviews WHERE fee_id = ANY(${ids}::int[]) RETURNING id`;
  console.log(`   fee_reviews removed: ${reviewsDel.length}`);

  // Backup + delete extracted_fees
  await tx`
    INSERT INTO extracted_fees_dedup_backup_20260418
    SELECT *, NOW() FROM extracted_fees WHERE id = ANY(${ids}::int[])
  `;
  const feesDel = await tx`DELETE FROM extracted_fees WHERE id = ANY(${ids}::int[]) RETURNING id`;
  return { fees_deleted: feesDel.length, reviews_deleted: reviewsDel.length };
});

console.log('\n3. Post-dedup verification ...');
const [after] = await sql`SELECT COUNT(*)::int AS n FROM extracted_fees`;
const [dupsAfter] = await sql`
  SELECT COUNT(*)::int AS n FROM (
    SELECT crawl_target_id, fee_name, amount, fee_category, COUNT(*)
    FROM extracted_fees GROUP BY 1,2,3,4 HAVING COUNT(*) > 1
  ) d
`;
const dist = await sql`SELECT review_status, COUNT(*)::int AS cnt FROM extracted_fees GROUP BY 1 ORDER BY cnt DESC`;
console.log(JSON.stringify({
  ...result,
  rows_remaining: after.n,
  narrow_key_duplicate_groups_remaining: dupsAfter.n,
  review_distribution: dist,
}, null, 2));

await sql.end();

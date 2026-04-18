/**
 * Phase 62B-14 — Reverse the lineage demo seed.
 *
 * Deletes only rows matching the 62B-14 sentinels:
 *   fees_published WHERE canonical_fee_key = '__demo_62b_14__'
 *   fees_verified  WHERE canonical_fee_key = '__demo_62b_14__'
 *   fees_raw       WHERE outlier_flags ? 'demo_62b_14'
 *
 * Order matters — published first (FK to verified), verified next (FK to raw),
 * raw last. This is the safe reversal of the seed order.
 *
 * Usage:
 *   node scripts/unseed-62b-lineage-demo.mjs
 */

import postgres from "postgres";
import "dotenv/config";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set; aborting.");
  process.exit(2);
}

const DEMO_CANONICAL = "__demo_62b_14__";

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });

try {
  let published = 0;
  let verified = 0;
  let raw = 0;

  await sql.begin(async (tx) => {
    const p = await tx`
      DELETE FROM fees_published
       WHERE canonical_fee_key = ${DEMO_CANONICAL}
      RETURNING 1
    `;
    published = p.length;

    const v = await tx`
      DELETE FROM fees_verified
       WHERE canonical_fee_key = ${DEMO_CANONICAL}
      RETURNING 1
    `;
    verified = v.length;

    const r = await tx`
      DELETE FROM fees_raw
       WHERE outlier_flags ? 'demo_62b_14'
      RETURNING 1
    `;
    raw = r.length;
  });

  console.log(`Unseed complete: published=${published} verified=${verified} raw=${raw}`);
  if (published === 0 && verified === 0 && raw === 0) {
    console.log("Nothing to remove — seed was not present.");
  }
} catch (err) {
  console.error("UNSEED FAILED:", err.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}

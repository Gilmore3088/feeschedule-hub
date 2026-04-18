/**
 * Phase 62B-14 — Seed demo lineage chains for UAT Gap 6a.
 *
 * Inserts 10 full-lineage rows (fees_raw → fees_verified → fees_published)
 * so the Lineage tab at /admin/agents/lineage has trace targets while the
 * real pipeline (Phase 63/64) has not yet produced any promoted fees.
 *
 * Idempotent: re-running does NOT duplicate.
 * Reversible: run scripts/unseed-62b-lineage-demo.mjs to remove.
 *
 * Sentinels for identification + reversal:
 *   fees_raw.outlier_flags       → contains "demo_62b_14"
 *   fees_verified.canonical_fee_key = '__demo_62b_14__'
 *   fees_published.fee_name LIKE 'DEMO: %' AND canonical_fee_key = '__demo_62b_14__'
 *
 * Usage:
 *   node scripts/seed-62b-lineage-demo.mjs
 */

import postgres from "postgres";
import "dotenv/config";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set; aborting.");
  process.exit(2);
}

const DEMO_CANONICAL = "__demo_62b_14__";
const DEMO_UUID = "00000000-0000-0000-0000-dead62b14aaa";

// 10 hand-crafted rows. Hard-coded institution_ids (1..10) — migration comment
// notes institution_id FK is not enforced at the table level.
const DEMO_FEES = [
  { institution_id: 1, fee_name: "DEMO: Monthly Maintenance", amount: 12.00, frequency: "monthly" },
  { institution_id: 2, fee_name: "DEMO: Overdraft",           amount: 35.00, frequency: "per_event" },
  { institution_id: 3, fee_name: "DEMO: NSF",                 amount: 34.00, frequency: "per_event" },
  { institution_id: 4, fee_name: "DEMO: ATM Non-Network",     amount: 3.00,  frequency: "per_use" },
  { institution_id: 5, fee_name: "DEMO: Foreign Transaction", amount: 0.03,  frequency: "per_txn" },
  { institution_id: 6, fee_name: "DEMO: Wire Domestic Out",   amount: 25.00, frequency: "per_event" },
  { institution_id: 7, fee_name: "DEMO: Stop Payment",        amount: 30.00, frequency: "per_event" },
  { institution_id: 8, fee_name: "DEMO: Paper Statement",     amount: 3.00,  frequency: "monthly" },
  { institution_id: 9, fee_name: "DEMO: Returned Deposit",    amount: 12.00, frequency: "per_event" },
  { institution_id: 10, fee_name: "DEMO: Cashiers Check",     amount: 10.00, frequency: "per_event" },
];

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });

try {
  // Idempotence check — skip insertion if sentinel rows already exist.
  const existing = await sql`
    SELECT COUNT(*)::int AS n FROM fees_published
     WHERE canonical_fee_key = ${DEMO_CANONICAL}
  `;
  if (existing[0].n > 0) {
    console.log(`Seed already present: ${existing[0].n} demo rows in fees_published. No-op.`);
    await sql.end();
    process.exit(0);
  }

  let rawInserted = 0;
  let verifiedInserted = 0;
  let publishedInserted = 0;

  await sql.begin(async (tx) => {
    for (const fee of DEMO_FEES) {
      // Tier 1 — fees_raw (source='manual_import' is allowed by CHECK constraint)
      const rawRow = await tx`
        INSERT INTO fees_raw (
          institution_id, document_r2_key, source_url, extraction_confidence,
          agent_event_id, fee_name, amount, frequency, outlier_flags, source
        ) VALUES (
          ${fee.institution_id},
          ${"demo/62b14/" + fee.institution_id + ".pdf"},
          ${"https://example.com/demo/" + fee.institution_id + "/schedule"},
          ${0.95},
          ${DEMO_UUID}::UUID,
          ${fee.fee_name},
          ${fee.amount},
          ${fee.frequency},
          ${'["demo_62b_14"]'}::jsonb,
          ${"manual_import"}
        )
        RETURNING fee_raw_id
      `;
      const feeRawId = rawRow[0].fee_raw_id;
      rawInserted++;

      // Tier 2 — fees_verified (canonical_fee_key = sentinel)
      const verifiedRow = await tx`
        INSERT INTO fees_verified (
          fee_raw_id, institution_id, source_url, document_r2_key,
          extraction_confidence, canonical_fee_key, variant_type, outlier_flags,
          verified_by_agent_event_id, fee_name, amount, frequency, review_status
        ) VALUES (
          ${feeRawId},
          ${fee.institution_id},
          ${"https://example.com/demo/" + fee.institution_id + "/schedule"},
          ${"demo/62b14/" + fee.institution_id + ".pdf"},
          ${0.95},
          ${DEMO_CANONICAL},
          ${"demo"},
          ${'["demo_62b_14"]'}::jsonb,
          ${DEMO_UUID}::UUID,
          ${fee.fee_name},
          ${fee.amount},
          ${fee.frequency},
          ${"verified"}
        )
        RETURNING fee_verified_id
      `;
      const feeVerifiedId = verifiedRow[0].fee_verified_id;
      verifiedInserted++;

      // Tier 3 — fees_published (direct INSERT; bypass promote_to_tier3 stub)
      await tx`
        INSERT INTO fees_published (
          lineage_ref, institution_id, canonical_fee_key,
          source_url, document_r2_key, extraction_confidence,
          agent_event_id, verified_by_agent_event_id, published_by_adversarial_event_id,
          fee_name, amount, frequency, variant_type, coverage_tier
        ) VALUES (
          ${feeVerifiedId},
          ${fee.institution_id},
          ${DEMO_CANONICAL},
          ${"https://example.com/demo/" + fee.institution_id + "/schedule"},
          ${"demo/62b14/" + fee.institution_id + ".pdf"},
          ${0.95},
          ${DEMO_UUID}::UUID,
          ${DEMO_UUID}::UUID,
          ${DEMO_UUID}::UUID,
          ${fee.fee_name},
          ${fee.amount},
          ${fee.frequency},
          ${"demo"},
          ${"provisional"}
        )
      `;
      publishedInserted++;
    }
  });

  // Summary
  const summary = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM fees_raw WHERE outlier_flags ? 'demo_62b_14') AS raw_rows,
      (SELECT COUNT(*)::int FROM fees_verified WHERE canonical_fee_key = ${DEMO_CANONICAL}) AS verified_rows,
      (SELECT COUNT(*)::int FROM fees_published WHERE canonical_fee_key = ${DEMO_CANONICAL}) AS published_rows
  `;
  console.log(`Inserted (this run): raw=${rawInserted} verified=${verifiedInserted} published=${publishedInserted}`);
  console.log(`Total present:       raw=${summary[0].raw_rows} verified=${summary[0].verified_rows} published=${summary[0].published_rows}`);
  console.log(`Reverse with:        node scripts/unseed-62b-lineage-demo.mjs`);
} catch (err) {
  console.error("SEED FAILED:", err.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}

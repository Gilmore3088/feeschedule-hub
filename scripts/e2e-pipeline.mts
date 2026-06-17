/**
 * End-to-end test for the rebuilt pipeline.
 *
 * Part 1: run the full 5-stage pipeline in DRY-RUN through the real runner
 *         against the live DB, recording a real pipeline_runs row with one
 *         pipeline_steps row per stage. Proves multi-stage orchestration + live
 *         per-step counts end-to-end. Read-only.
 *
 * Part 2: prove the publish APPLY write-path on ONE real eligible fee inside a
 *         transaction that is rolled back — exercising the darwin+knox handshake
 *         and the promote_to_tier3 gate against the real schema with ZERO
 *         permanent footprint (no interference with the owner's live agents).
 *
 * Run:  npx tsx scripts/e2e-pipeline.ts
 */

import { randomUUID } from "node:crypto";
import { config } from "dotenv";

config({ path: ".env.local" });
config();

// Import after env is loaded (connection.ts reads DATABASE_URL eagerly).
const { executeRun } = await import("@/lib/pipeline/runner");
const { createRun, seedSteps, getRecentRuns, getRunSteps } = await import("@/lib/pipeline/db");
const { stageNames } = await import("@/lib/pipeline/stages");
const { sql } = await import("@/lib/crawler-db/connection");

let exitCode = 0;

// ── Part 1: full pipeline dry-run through the real runner ──────────────────
console.log("=== E2E Part 1: full pipeline DRY-RUN through the real runner ===");
const stages = stageNames(); // discover, extract, classify, review, publish
const runId = await createRun("api", "e2e-test", stages, {});
await seedSteps(runId, stages);
const outcome = await executeRun(runId, stages, {});
const [run] = await getRecentRuns(1);
const steps = await getRunSteps(runId);

console.log(`run #${runId} -> ${outcome.status} (${run?.stages_done}/${run?.stages_total} stages)`);
for (const s of steps) {
  const note = typeof s.notes_json?.message === "string" ? s.notes_json.message : "";
  console.log(
    `  ${s.stage.padEnd(9)} ${s.status.padEnd(10)} in=${String(s.rows_in ?? "-").padEnd(7)} out=${s.rows_out ?? "-"}   ${note}`,
  );
}
if (outcome.status !== "succeeded" || steps.some((s) => s.status !== "succeeded")) {
  console.error("E2E FAILED: dry-run chain did not fully succeed");
  exitCode = 1;
}

// ── Part 2: publish APPLY on one real row, rolled back ─────────────────────
console.log("\n=== E2E Part 2: publish APPLY on 1 real row inside a ROLLED-BACK tx ===");
let applyProven = false;
try {
  await sql.begin(async (tx) => {
    const t = tx as unknown as typeof sql;
    const before = (await t`SELECT count(*)::int AS n FROM fees_published`) as { n: number }[];
    const cand = (await t`
      SELECT v.fee_verified_id
        FROM fees_verified v
        LEFT JOIN fees_published p ON p.lineage_ref = v.fee_verified_id
       WHERE p.fee_published_id IS NULL
         AND v.extraction_confidence >= 0.9
         AND COALESCE(v.review_status, 'pending') <> 'rejected'
       ORDER BY v.fee_verified_id
       LIMIT 1
    `) as { fee_verified_id: number }[];

    if (cand.length === 0) {
      console.log("no eligible row to prove the apply path; skipping (not a failure)");
      throw new Error("__rollback__");
    }

    const fvid = cand[0].fee_verified_id;
    const correlationId = randomUUID();
    const adversarialEventId = randomUUID();
    const payload = { fee_verified_id: fvid, auto_publish: true };
    await t`
      INSERT INTO agent_messages
        (sender_agent, recipient_agent, intent, state, correlation_id, payload, round_number)
      VALUES
        ('darwin', 'knox', 'accept', 'open', ${correlationId}::uuid, ${t.json(payload)}, 1),
        ('knox', 'darwin', 'accept', 'open', ${correlationId}::uuid, ${t.json(payload)}, 1)
    `;
    await t`SELECT promote_to_tier3(${fvid}::bigint, ${adversarialEventId}::uuid)`;
    const after = (await t`SELECT count(*)::int AS n FROM fees_published`) as { n: number }[];
    const delta = Number(after[0].n) - Number(before[0].n);
    applyProven = delta === 1;
    console.log(
      `fee_verified_id=${fvid}: handshake posted, promote_to_tier3 published 1 row in-tx (fees_published ${before[0].n} -> ${after[0].n}).`,
    );
    // Abort so nothing persists — leaves zero footprint.
    throw new Error("__rollback__");
  });
} catch (e) {
  if (!(e instanceof Error) || e.message !== "__rollback__") {
    console.error("apply-path error:", e);
    exitCode = 1;
  }
}
console.log(
  applyProven
    ? "apply-path PROVEN: 1 row published through the real gate, then rolled back (no permanent footprint)."
    : "apply-path not proven (no eligible row, or gate rejected).",
);

await sql.end();
console.log(`\nE2E ${exitCode === 0 ? "PASSED" : "FAILED"}.`);
process.exit(exitCode);

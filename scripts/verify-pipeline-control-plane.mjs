#!/usr/bin/env node
// End-to-end verification for the pipeline control plane (Phase 1).
//
// Proves the spine against the LIVE DB by running the EXACT SQL the app uses:
//   1. read the publish eligibility count (read-only),
//   2. create a pipeline_runs row + seed its step,
//   3. execute the dry-run "publish" stage, recording rows_in,
//   4. mark the step + run succeeded,
//   5. read the run + steps back and print them.
//
// It leaves one real run behind so the control room (/admin/pipeline) has
// something to display. Read-only against production data; writes only to the
// new pipeline_runs / pipeline_steps tables.
//
// Usage:  node scripts/verify-pipeline-control-plane.mjs

import postgres from "postgres";
import { config } from "dotenv";

config({ path: ".env.local" });
config();

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
const MIN_CONFIDENCE = 0.9;

try {
  // 0. Tables exist?
  const [{ exists }] = await sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'pipeline_runs'
    ) AS exists`;
  if (!exists) {
    console.error("pipeline_runs does not exist — apply 20260603_pipeline_control_plane.sql first.");
    process.exit(1);
  }

  // 1. Publish eligibility (the real stage query, read-only).
  const [{ eligible }] = await sql`
    SELECT count(*)::int AS eligible
    FROM fees_verified v
    LEFT JOIN fees_published p ON p.lineage_ref = v.fee_verified_id
    WHERE p.fee_published_id IS NULL
      AND v.extraction_confidence >= ${MIN_CONFIDENCE}
      AND COALESCE(v.review_status, 'pending') <> 'rejected'`;
  console.log(`Eligible verified fees ready to publish: ${eligible}`);

  // 2. Create run + seed step.
  const [run] = await sql`
    INSERT INTO pipeline_runs (trigger_source, triggered_by, status, params_json, stages_total)
    VALUES ('manual', 'verify-script', 'queued', ${sql.json({ stages: ["publish"] })}, 1)
    RETURNING id`;
  const runId = Number(run.id);
  await sql`
    INSERT INTO pipeline_steps (run_id, stage, seq, status)
    VALUES (${runId}, 'publish', 1, 'pending')
    ON CONFLICT (run_id, stage) DO NOTHING`;
  console.log(`Created run #${runId}`);

  // 3-4. Execute the stage + record results.
  await sql`UPDATE pipeline_runs SET status='running', started_at=NOW() WHERE id=${runId}`;
  await sql`UPDATE pipeline_steps SET status='running', started_at=NOW() WHERE run_id=${runId} AND stage='publish'`;
  await sql`
    UPDATE pipeline_steps
       SET status='succeeded', rows_in=${eligible}, rows_out=0,
           notes_json=${sql.json({ mode: "dry-run", minConfidence: MIN_CONFIDENCE, message: `${eligible} ready` })},
           finished_at=NOW()
     WHERE run_id=${runId} AND stage='publish'`;
  await sql`UPDATE pipeline_runs SET stages_done=1, status='succeeded', finished_at=NOW() WHERE id=${runId}`;

  // 5. Read back.
  const [readRun] = await sql`
    SELECT id, status, trigger_source, triggered_by, stages_done, stages_total, started_at, finished_at
      FROM pipeline_runs WHERE id=${runId}`;
  const steps = await sql`
    SELECT stage, status, rows_in, rows_out, notes_json
      FROM pipeline_steps WHERE run_id=${runId} ORDER BY seq`;

  console.log("\n--- Recorded run ---");
  console.log(JSON.stringify(readRun, null, 2));
  console.log("--- Recorded steps ---");
  console.log(JSON.stringify(steps, null, 2));
  console.log(`\nVERIFIED: run #${runId} -> ${readRun.status}, step publish -> ${steps[0]?.status} (rows_in=${steps[0]?.rows_in}).`);
  console.log("Open /admin/pipeline to see it in the control room.");
} catch (err) {
  console.error("Verification failed:", err);
  process.exit(1);
} finally {
  await sql.end();
}

/**
 * Validation drain — run the classify stage in apply mode over a limited batch
 * and report the results + a quality sample. Records a real pipeline run.
 *
 * Run:  npx tsx scripts/drain-classify.mts [limit]
 */

import { config } from "dotenv";
config({ path: ".env.local" });
config();

const { createRun, seedSteps, getRunSteps } = await import("@/lib/pipeline/db");
const { executeRun } = await import("@/lib/pipeline/runner");
const { sql } = await import("@/lib/crawler-db/connection");

const LIMIT = Number(process.argv[2] ?? 500);

console.log(`=== Validation drain: classify apply, limit ${LIMIT} ===`);
const [{ n: before }] = (await sql`SELECT count(*)::int AS n FROM fees_verified`) as { n: number }[];

const runId = await createRun("api", "validation-drain", ["classify"], { apply: true, limit: LIMIT });
await seedSteps(runId, ["classify"]);
const t0 = Date.now();
const outcome = await executeRun(runId, ["classify"], { apply: true, limit: LIMIT });
const [step] = await getRunSteps(runId);

console.log(`run #${runId} -> ${outcome.status} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`  rows_in=${step.rows_in}  promoted=${step.rows_out}  cost_cents=${step.cost_cents}`);
console.log(`  notes: ${JSON.stringify(step.notes_json)}`);

const [{ n: after }] = (await sql`SELECT count(*)::int AS n FROM fees_verified`) as { n: number }[];
console.log(`  fees_verified ${before} -> ${after}  (+${after - before})`);

// Rows this drain produced are tagged by a darwin/classify primary agent_event.
console.log("\n-- sample 20 newly classified (canonical_fee_key  <-  fee_name) --");
const sample = (await sql`
  SELECT v.fee_name, v.canonical_fee_key, v.extraction_confidence
    FROM fees_verified v
    JOIN agent_events e ON e.event_id = v.verified_by_agent_event_id
   WHERE e.agent_name = 'darwin' AND e.action = 'classify'
   ORDER BY v.fee_verified_id DESC
   LIMIT 20
`) as { fee_name: string; canonical_fee_key: string; extraction_confidence: number }[];
for (const r of sample) {
  console.log(`  ${String(r.canonical_fee_key).padEnd(26)} <- ${String(r.fee_name).slice(0, 44).padEnd(44)} (${r.extraction_confidence})`);
}

console.log("\n-- canonical_fee_key distribution from this drain (top 15) --");
const dist = (await sql`
  SELECT v.canonical_fee_key, count(*)::int AS n
    FROM fees_verified v
    JOIN agent_events e ON e.event_id = v.verified_by_agent_event_id
   WHERE e.agent_name = 'darwin' AND e.action = 'classify'
   GROUP BY 1 ORDER BY n DESC LIMIT 15
`) as { canonical_fee_key: string; n: number }[];
for (const r of dist) console.log(`  ${r.n.toString().padStart(4)}  ${r.canonical_fee_key}`);

await sql.end();
console.log("\nDone.");

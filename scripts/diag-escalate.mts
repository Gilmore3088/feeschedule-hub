/**
 * Validate the two-tier escalation: classify a random sample with the cheap
 * model, then re-run the unresolved ones through the stronger model and report
 * how many it correctly recovers. Read-only (no DB writes).
 *
 * Run:  npx tsx scripts/diag-escalate.mts [n]
 */

import { config } from "dotenv";
config({ path: ".env.local" });
config();

const { sql } = await import("@/lib/crawler-db/connection");
const { classifyFeeNames, CLASSIFY_MODEL, ESCALATION_MODEL } = await import("@/lib/pipeline/llm");
const { normalizeFeeName, isValidClassification } = await import("@/lib/pipeline/taxonomy");

const N = Number(process.argv[2] ?? 60);

type R = { fee_name: string; canonical_fee_key: string | null; confidence: number };
const promotes = (r: R | undefined, n: string) =>
  !!(r && r.canonical_fee_key && isValidClassification(n, r.canonical_fee_key) && r.confidence >= 0.9);

const rows = (await sql`
  SELECT fr.fee_name FROM fees_raw fr
   LEFT JOIN fees_verified fv ON fv.fee_raw_id = fr.fee_raw_id
   WHERE fv.fee_verified_id IS NULL
   ORDER BY random() LIMIT ${N}
`) as { fee_name: string }[];
const norms = rows.map((r) => normalizeFeeName(r.fee_name));

const pass1 = await classifyFeeNames(norms, CLASSIFY_MODEL);
const hmap = new Map(pass1.results.map((r) => [r.fee_name, r]));
const basePromoted = norms.filter((n) => promotes(hmap.get(n), n));
const unresolved = norms.filter((n) => !promotes(hmap.get(n), n));

const pass2 = await classifyFeeNames(unresolved, ESCALATION_MODEL);
const smap = new Map(pass2.results.map((r) => [r.fee_name, r]));
const recovered = unresolved.filter((n) => promotes(smap.get(n), n));

const combined = basePromoted.length + recovered.length;
console.log(`sample=${N}`);
console.log(`  haiku auto-promote: ${basePromoted.length} (${Math.round((basePromoted.length / N) * 100)}%)`);
console.log(`  unresolved after haiku: ${unresolved.length}`);
console.log(`  sonnet recovered: ${recovered.length} of ${unresolved.length}`);
console.log(`  COMBINED yield: ${combined}/${N} (${Math.round((combined / N) * 100)}%)`);
console.log(`  cost: haiku ${pass1.costCents}c + sonnet ${pass2.costCents}c`);

console.log("\n-- recovered by sonnet (name : haiku -> sonnet) — eyeball correctness --");
for (const n of recovered) {
  const hh = hmap.get(n), ss = smap.get(n);
  console.log(`  ${n.slice(0, 44).padEnd(44)} ${(hh?.canonical_fee_key ?? "null")}/${hh?.confidence ?? 0} -> ${ss?.canonical_fee_key}/${ss?.confidence}`);
}

console.log("\n-- still unresolved after sonnet (sample 15) --");
for (const n of unresolved.filter((n) => !promotes(smap.get(n), n)).slice(0, 15)) {
  const ss = smap.get(n);
  console.log(`  ${n.slice(0, 44).padEnd(44)} ${(ss?.canonical_fee_key ?? "null")}/${ss?.confidence ?? 0}`);
}

await sql.end();

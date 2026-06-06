/**
 * Diagnostic: is classify's low promotion rate real model uncertainty, or a
 * name-matching bug (LLM echoing names that don't match our normalized input)?
 * Pulls a RANDOM sample of unclassified raw names and inspects raw LLM output.
 *
 * Run:  npx tsx scripts/diag-classify.mts [n]
 */

import { config } from "dotenv";
config({ path: ".env.local" });
config();

const { sql } = await import("@/lib/crawler-db/connection");
const { classifyFeeNames } = await import("@/lib/pipeline/llm");
const { normalizeFeeName, isValidClassification } = await import("@/lib/pipeline/taxonomy");

const N = Number(process.argv[2] ?? 40);

const rows = (await sql`
  SELECT fr.fee_name
    FROM fees_raw fr
    LEFT JOIN fees_verified fv ON fv.fee_raw_id = fr.fee_raw_id
   WHERE fv.fee_verified_id IS NULL
   ORDER BY random()
   LIMIT ${N}
`) as { fee_name: string }[];

const norms = rows.map((r) => normalizeFeeName(r.fee_name));
const { results } = await classifyFeeNames(norms);
const byName = new Map(results.map((r) => [r.fee_name, r]));

let matched = 0, mismatch = 0, nullKey = 0, invalid = 0, lowConf = 0, wouldPromote = 0;
for (const n of norms) {
  const r = byName.get(n);
  if (!r) { mismatch++; continue; }
  matched++;
  if (r.canonical_fee_key === null) { nullKey++; continue; }
  if (!isValidClassification(n, r.canonical_fee_key)) { invalid++; continue; }
  if (r.confidence >= 0.9) wouldPromote++;
  else lowConf++;
}

console.log(`Sample of ${norms.length} random unclassified names:`);
console.log({ matched, mismatch, nullKey, invalid, lowConfBelow90: lowConf, wouldPromote });
console.log(`\n-- per-name --`);
for (const n of norms) {
  const r = byName.get(n);
  const verdict = !r ? "NO-MATCH(bug?)" : r.canonical_fee_key === null ? "null/0.0" : `${r.canonical_fee_key} ${r.confidence}`;
  console.log(`  ${n.slice(0, 46).padEnd(46)} -> ${verdict}`);
}
await sql.end();

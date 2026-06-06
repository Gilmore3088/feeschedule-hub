/**
 * classify stage — Darwin port. Classifies raw fees into canonical categories
 * and promotes high-confidence rows to fees_verified via the existing
 * promote_to_tier2 DB function (the same contract Darwin uses, so this stays
 * consistent with the owner's pipeline).
 *
 * Dry-run (default): count unclassified fees_raw candidates, no LLM, no writes.
 * Apply (apply=true): run the LLM, validate, and promote rows >= 0.90 confidence.
 */

import { randomUUID } from "node:crypto";
import { sql } from "@/lib/crawler-db/connection";
import { numParam, boolParam, type Stage, type StageContext, type StageResult } from "../stage";
import { classifyFeeNames } from "../llm";
import { normalizeFeeName, isValidClassification } from "../taxonomy";

const DEFAULT_LIMIT = 200;
const AUTO_PROMOTE_THRESHOLD = 0.9;

interface RawCandidate {
  fee_raw_id: number;
  fee_name: string;
  amount: number | null;
}

export const classifyStage: Stage = {
  name: "classify",
  description:
    "Classify raw fees into canonical categories (Darwin). Dry-run counts candidates; apply runs the LLM and promotes high-confidence rows to fees_verified.",

  async run(ctx: StageContext): Promise<StageResult> {
    const limit = numParam(ctx.params.limit, DEFAULT_LIMIT);
    const apply = boolParam(ctx.params.apply);

    if (!apply) {
      const rows = (await sql`
        SELECT count(*)::int AS n
          FROM fees_raw fr
          LEFT JOIN fees_verified fv ON fv.fee_raw_id = fr.fee_raw_id
         WHERE fv.fee_verified_id IS NULL
      `) as { n: number }[];
      const n = Number(rows[0]?.n ?? 0);
      return {
        rowsIn: n,
        rowsOut: 0,
        notes: { mode: "dry-run", message: `${n} raw fee(s) awaiting classification` },
      };
    }

    // FOR UPDATE OF fr SKIP LOCKED mirrors Darwin so a drain can run alongside
    // the Modal classifier without grabbing rows it is actively holding. The
    // full guarantee against double-promotion is the pending fees_verified dedup
    // unique constraint; until then, run drains sequentially.
    const candidates = (await sql`
      SELECT fr.fee_raw_id, fr.fee_name, fr.amount
        FROM fees_raw fr
        LEFT JOIN fees_verified fv ON fv.fee_raw_id = fr.fee_raw_id
       WHERE fv.fee_verified_id IS NULL
       ORDER BY fr.fee_raw_id
       LIMIT ${limit}
       FOR UPDATE OF fr SKIP LOCKED
    `) as RawCandidate[];

    if (candidates.length === 0) {
      return { rowsIn: 0, rowsOut: 0, notes: { mode: "apply", message: "nothing to classify" } };
    }

    const normalized = candidates.map((c) => ({ ...c, norm: normalizeFeeName(c.fee_name) }));
    const { results, costCents } = await classifyFeeNames(normalized.map((c) => c.norm));
    const byName = new Map(results.map((r) => [r.fee_name, r]));

    let promoted = 0;
    let lowConfidence = 0;
    let invalid = 0;
    for (const c of normalized) {
      const r = byName.get(c.norm);
      if (!r || r.canonical_fee_key === null) {
        lowConfidence++;
        continue;
      }
      if (!isValidClassification(c.norm, r.canonical_fee_key)) {
        invalid++;
        continue;
      }
      if (r.confidence < AUTO_PROMOTE_THRESHOLD) {
        lowConfidence++;
        continue;
      }
      const ok = await promoteToTier2(c.fee_raw_id, r.canonical_fee_key, c.norm, r.confidence);
      if (ok) promoted++;
      else invalid++;
    }

    return {
      rowsIn: candidates.length,
      rowsOut: promoted,
      costCents,
      notes: { mode: "apply", promoted, lowConfidence, invalid },
    };
  },
};

/**
 * Faithful Darwin write: open a darwin classify agent_events row, then call
 * promote_to_tier2 (Darwin-only gate) in the same transaction. Returns false on
 * any failure so a single bad row never aborts the batch.
 */
async function promoteToTier2(
  feeRawId: number,
  canonicalFeeKey: string,
  normalizedName: string,
  confidence: number,
): Promise<boolean> {
  const eventId = randomUUID();
  try {
    await sql.begin(async (tx) => {
      const t = tx as unknown as typeof sql;
      await t`
        INSERT INTO agent_events
          (event_id, agent_name, action, tool_name, entity, status, input_payload, output_payload)
        VALUES
          (${eventId}::uuid, 'darwin', 'classify', 'classify_fees', 'fees_raw', 'success',
           ${t.json({ fee_raw_id: feeRawId, normalized: normalizedName })},
           ${t.json({ canonical_fee_key: canonicalFeeKey, confidence })})
      `;
      await t`
        SELECT promote_to_tier2(
          ${feeRawId}::bigint, 'darwin', NULL::bytea, ${eventId}::uuid,
          ${canonicalFeeKey}::text, NULL, '[]'::jsonb
        )
      `;
    });
    return true;
  } catch {
    return false;
  }
}

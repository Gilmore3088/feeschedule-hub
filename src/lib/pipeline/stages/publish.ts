/**
 * publish stage — drain high-confidence verified fees into the published index.
 *
 * Dry-run (default): execute the real eligibility query (same predicate as
 * fee_crawler/commands/publish_fees.py) and report how many verified fees are
 * ready. Writes nothing.
 *
 * Apply (apply=true): for each eligible row, post the darwin+knox intent='accept'
 * handshake messages (shared correlation_id) and call the hard DB gate
 * promote_to_tier3(fee_verified_id, adversarial_event_id), which inserts the
 * fees_published row. Each row is its own transaction so one failure can't abort
 * the drain. This mirrors publish_fees.py's auto-publish ceremony.
 */

import { randomUUID } from "node:crypto";
import { sql } from "@/lib/crawler-db/connection";
import { numParam, boolParam, type Stage, type StageContext, type StageResult } from "../stage";

const DEFAULT_MIN_CONFIDENCE = 0.9;
const DEFAULT_LIMIT = 500;

export const publishStage: Stage = {
  name: "publish",
  description:
    "Publish high-confidence verified fees. Dry-run counts what's eligible; apply runs the darwin+knox handshake and promotes to fees_published.",

  async run(ctx: StageContext): Promise<StageResult> {
    const minConfidence = numParam(ctx.params.minConfidence, DEFAULT_MIN_CONFIDENCE);
    const limit = numParam(ctx.params.limit, DEFAULT_LIMIT);
    const apply = boolParam(ctx.params.apply);

    if (!apply) {
      const rows = (await sql`
        SELECT count(*)::int AS eligible
        FROM fees_verified v
        LEFT JOIN fees_published p ON p.lineage_ref = v.fee_verified_id
        WHERE p.fee_published_id IS NULL
          AND v.extraction_confidence >= ${minConfidence}
          AND COALESCE(v.review_status, 'pending') <> 'rejected'
      `) as { eligible: number }[];
      const eligible = Number(rows[0]?.eligible ?? 0);
      return {
        rowsIn: eligible,
        rowsOut: 0,
        notes: {
          mode: "dry-run",
          minConfidence,
          message:
            eligible > 0
              ? `${eligible} verified fee(s) ready to publish (run with apply=true to publish).`
              : "No verified fees currently meet the publish threshold.",
        },
      };
    }

    const eligible = (await sql`
      SELECT v.fee_verified_id
      FROM fees_verified v
      LEFT JOIN fees_published p ON p.lineage_ref = v.fee_verified_id
      WHERE p.fee_published_id IS NULL
        AND v.extraction_confidence >= ${minConfidence}
        AND COALESCE(v.review_status, 'pending') <> 'rejected'
      ORDER BY v.extraction_confidence DESC, v.fee_verified_id ASC
      LIMIT ${limit}
    `) as { fee_verified_id: number }[];

    let published = 0;
    let failed = 0;
    for (const row of eligible) {
      const ok = await publishOne(row.fee_verified_id);
      if (ok) published++;
      else failed++;
    }

    return {
      rowsIn: eligible.length,
      rowsOut: published,
      notes: { mode: "apply", minConfidence, published, failed },
    };
  },
};

/**
 * One row: post darwin+knox accept messages then call the tier-3 gate, all in a
 * single transaction so a failed promotion leaves no orphan handshake messages.
 */
export async function publishOne(feeVerifiedId: number): Promise<boolean> {
  const correlationId = randomUUID();
  const adversarialEventId = randomUUID();
  const payload = { fee_verified_id: feeVerifiedId, auto_publish: true };
  try {
    await sql.begin(async (tx) => {
      const t = tx as unknown as typeof sql;
      await t`
        INSERT INTO agent_messages
          (sender_agent, recipient_agent, intent, state, correlation_id, payload, round_number)
        VALUES
          ('darwin', 'knox', 'accept', 'open', ${correlationId}::uuid, ${t.json(payload)}, 1),
          ('knox', 'darwin', 'accept', 'open', ${correlationId}::uuid, ${t.json(payload)}, 1)
      `;
      await t`SELECT promote_to_tier3(${feeVerifiedId}::bigint, ${adversarialEventId}::uuid)`;
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * publish stage — drain high-confidence verified fees into the published index.
 *
 * Phase 1 runs in DRY-RUN mode: it executes the real eligibility query (the same
 * predicate as fee_crawler/commands/publish_fees.py) and reports how many
 * verified fees are ready to publish. It writes nothing.
 *
 * The apply path is deliberately deferred to Phase 2 because publishing is gated
 * by a hard DB function — promote_to_tier3(fee_verified_id, adversarial_event_id)
 * (supabase/migrations/20260510_promote_to_tier3_tighten.sql) — which requires an
 * intent='accept' agent_messages row from BOTH darwin AND knox. Those messages
 * are produced by the classify/review stages, which land in Phase 2 alongside the
 * apply path. Flipping this stage to apply mode is then a localized change.
 */

import { sql } from "@/lib/crawler-db/connection";
import type { Stage, StageContext, StageResult } from "../stage";

const DEFAULT_MIN_CONFIDENCE = 0.9;

export const publishStage: Stage = {
  name: "publish",
  description:
    "Count verified fees ready for the published index (dry-run; apply path lands in Phase 2).",

  async run(ctx: StageContext): Promise<StageResult> {
    const minConfidence =
      typeof ctx.params.minConfidence === "number"
        ? ctx.params.minConfidence
        : DEFAULT_MIN_CONFIDENCE;

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
            ? `${eligible} verified fee(s) ready to publish — apply path lands in Phase 2.`
            : "No verified fees currently meet the publish threshold.",
      },
    };
  },
};

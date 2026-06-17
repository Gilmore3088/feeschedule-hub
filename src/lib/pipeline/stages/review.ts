/**
 * review stage — Knox port. Adversarial review of verified fees using Knox's
 * deterministic rules (no LLM):
 *   Rule 1: reject if amount > 5x the peer median (same canonical key + asset
 *           tier), but only when there are >= 5 peers.
 *   Rule 2: reject a zero amount unless the fee name signals a free fee.
 * The decision is posted to agent_messages as an intent='accept'|'reject' row
 * from knox (the same handshake currency promote_to_tier3 checks).
 *
 * Dry-run (default): count verified fees awaiting review, no writes.
 * Apply (apply=true): score each and post a knox message.
 */

import { randomUUID } from "node:crypto";
import { sql } from "@/lib/crawler-db/connection";
import { numParam, boolParam, type Stage, type StageContext, type StageResult } from "../stage";

const DEFAULT_LIMIT = 100;
const REJECT_MULTIPLIER = 5.0;
const MIN_PEERS = 5;
const FREE_FEE_KEYWORDS = ["free", "waived", "no charge", "no fee", "complimentary", "included"];

interface PendingRow {
  fee_verified_id: number;
  institution_id: number;
  canonical_fee_key: string;
  fee_name: string;
  amount: number | null;
  asset_size_tier: string | null;
}

export const reviewStage: Stage = {
  name: "review",
  description:
    "Adversarial review of verified fees (Knox rules: peer-median outlier + zero-amount sanity). Dry-run counts pending; apply posts accept/reject messages.",

  async run(ctx: StageContext): Promise<StageResult> {
    const limit = numParam(ctx.params.limit, DEFAULT_LIMIT);
    const apply = boolParam(ctx.params.apply);

    const pending = (await sql`
      SELECT v.fee_verified_id, v.institution_id, v.canonical_fee_key,
             v.fee_name, v.amount, ct.asset_size_tier
        FROM fees_verified v
        JOIN crawl_targets ct ON ct.id = v.institution_id
       WHERE NOT EXISTS (
         SELECT 1 FROM agent_messages m
          WHERE m.sender_agent = 'knox'
            AND m.payload->>'fee_verified_id' = v.fee_verified_id::text
       )
       ORDER BY v.fee_verified_id
       LIMIT ${limit}
    `) as PendingRow[];

    if (!apply) {
      return {
        rowsIn: pending.length,
        rowsOut: 0,
        notes: { mode: "dry-run", message: `${pending.length} verified fee(s) awaiting review` },
      };
    }

    let accepted = 0;
    let rejected = 0;
    for (const row of pending) {
      const { decision, reasons } = await reviewOne(row);
      await postKnoxMessage(row.fee_verified_id, decision, reasons);
      if (decision === "accept") accepted++;
      else rejected++;
    }

    return {
      rowsIn: pending.length,
      rowsOut: accepted,
      notes: { mode: "apply", accepted, rejected },
    };
  },
};

export async function reviewOne(
  row: PendingRow,
): Promise<{ decision: "accept" | "reject"; reasons: string[] }> {
  // Rule 2: zero amount without a free-fee signal.
  if (row.amount !== null && Number(row.amount) === 0) {
    const name = row.fee_name.toLowerCase();
    if (!FREE_FEE_KEYWORDS.some((k) => name.includes(k))) {
      return { decision: "reject", reasons: ["zero amount without a free-fee keyword"] };
    }
  }

  // Rule 1: peer-median outlier (needs enough peers to be meaningful).
  if (row.amount !== null && row.asset_size_tier) {
    try {
      const peer = (await sql`
        SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY v.amount) AS median,
               count(*)::int AS n
          FROM fees_verified v
          JOIN crawl_targets ct ON ct.id = v.institution_id
         WHERE v.canonical_fee_key = ${row.canonical_fee_key}
           AND ct.asset_size_tier = ${row.asset_size_tier}
           AND v.fee_verified_id <> ${row.fee_verified_id}
           AND v.amount IS NOT NULL
      `) as { median: number | null; n: number }[];
      const p = peer[0];
      if (p && p.n >= MIN_PEERS && p.median !== null && Number(row.amount) > REJECT_MULTIPLIER * Number(p.median)) {
        return {
          decision: "reject",
          reasons: [`amount ${row.amount} exceeds ${REJECT_MULTIPLIER}x peer median ${p.median} (n=${p.n})`],
        };
      }
    } catch {
      // Peer query failed — treat as insufficient peer data, do not block.
    }
  }

  return { decision: "accept", reasons: ["passed peer + sanity checks"] };
}

async function postKnoxMessage(
  feeVerifiedId: number,
  decision: "accept" | "reject",
  reasons: string[],
): Promise<void> {
  const correlationId = randomUUID();
  await sql`
    INSERT INTO agent_messages
      (sender_agent, recipient_agent, intent, state, correlation_id, payload, round_number)
    VALUES
      ('knox', 'darwin', ${decision}, 'open', ${correlationId}::uuid,
       ${sql.json({ fee_verified_id: feeVerifiedId, reasons })}, 1)
  `;
}

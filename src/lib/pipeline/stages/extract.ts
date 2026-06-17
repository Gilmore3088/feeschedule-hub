/**
 * extract stage — the heavy stage, run in a Vercel Sandbox microVM (replacing
 * Modal). For each target with a fee-schedule URL but no raw fees yet: open the
 * page in a sandbox browser, LLM-extract the fees, and write them to fees_raw
 * (the same tier-1 table Knox's extractor appends to).
 *
 * Dry-run (default): count targets needing extraction. No sandbox, no writes.
 * Apply (apply=true): runs the sandbox + LLM + write. Live apply requires Vercel
 * Sandbox credentials (OIDC on Vercel) — see sandbox.ts.
 */

import { randomUUID } from "node:crypto";
import { sql } from "@/lib/crawler-db/connection";
import { numParam, boolParam, type Stage, type StageContext, type StageResult } from "../stage";
import { fetchPageText } from "../sandbox";
import { extractFeesFromText, type ExtractedFee } from "../extract-llm";

const DEFAULT_LIMIT = 20;

interface Target {
  id: number;
  institution_name: string;
  fee_schedule_url: string;
}

export const extractStage: Stage = {
  name: "extract",
  description:
    "Extract fees from each target's fee schedule via a Vercel Sandbox browser, writing fees_raw. Dry-run counts targets needing extraction.",

  async run(ctx: StageContext): Promise<StageResult> {
    const limit = numParam(ctx.params.limit, DEFAULT_LIMIT);
    const apply = boolParam(ctx.params.apply);

    if (!apply) {
      const rows = (await sql`
        SELECT count(*)::int AS n
          FROM crawl_targets ct
         WHERE ct.fee_schedule_url IS NOT NULL AND ct.fee_schedule_url <> ''
           AND NOT EXISTS (SELECT 1 FROM fees_raw fr WHERE fr.institution_id = ct.id)
      `) as { n: number }[];
      const n = Number(rows[0]?.n ?? 0);
      return {
        rowsIn: n,
        rowsOut: 0,
        notes: { mode: "dry-run", message: `${n} target(s) need extraction` },
      };
    }

    const candidates = (await sql`
      SELECT ct.id, ct.institution_name, ct.fee_schedule_url
        FROM crawl_targets ct
       WHERE ct.fee_schedule_url IS NOT NULL AND ct.fee_schedule_url <> ''
         AND NOT EXISTS (SELECT 1 FROM fees_raw fr WHERE fr.institution_id = ct.id)
       ORDER BY ct.id
       LIMIT ${limit}
    `) as Target[];

    let written = 0;
    let failed = 0;
    let costCents = 0;
    for (const target of candidates) {
      try {
        const { text } = await fetchPageText(target.fee_schedule_url);
        const { fees, costCents: cc } = await extractFeesFromText(text, target.institution_name);
        costCents += cc;
        if (fees.length > 0) {
          written += await writeRawFees(target.id, target.fee_schedule_url, fees);
        }
      } catch {
        failed++;
      }
    }

    return {
      rowsIn: candidates.length,
      rowsOut: written,
      costCents,
      notes: { mode: "apply", written, failed },
    };
  },
};

/** Write extracted fees to fees_raw under a single extractor agent_events row. */
async function writeRawFees(
  institutionId: number,
  sourceUrl: string,
  fees: ExtractedFee[],
): Promise<number> {
  const eventId = randomUUID();
  let count = 0;
  await sql.begin(async (tx) => {
    const t = tx as unknown as typeof sql;
    await t`
      INSERT INTO agent_events (event_id, agent_name, action, tool_name, entity, status, input_payload)
      VALUES (${eventId}::uuid, 'extractor', 'extract', 'record_fees', 'crawl_targets', 'success',
              ${t.json({ institution_id: institutionId, source_url: sourceUrl, fee_count: fees.length })})
    `;
    for (const f of fees) {
      await t`
        INSERT INTO fees_raw
          (institution_id, agent_event_id, source_url, fee_name, amount, frequency, outlier_flags, source)
        VALUES
          (${institutionId}, ${eventId}::uuid, ${sourceUrl}, ${f.fee_name}, ${f.amount}, ${f.frequency},
           '[]'::jsonb, 'knox')
      `;
      count++;
    }
  });
  return count;
}

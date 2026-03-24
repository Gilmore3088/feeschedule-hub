"use server";

import { requireAuth } from "@/lib/auth";
import { sql } from "@/lib/crawler-db/connection";

interface VerificationEntry {
  fee_id: number;
  verdict: "correct" | "incorrect";
}

export async function saveGoldStandardVerification(
  institutionId: number,
  entries: VerificationEntry[]
): Promise<void> {
  const user = await requireAuth("approve");

  for (const entry of entries) {
    await sql`
      INSERT INTO gold_standard_fees
        (crawl_target_id, fee_id, verdict, verified_by, verified_at)
      VALUES
        (${institutionId}, ${entry.fee_id}, ${entry.verdict}, ${user.username}, NOW())
      ON CONFLICT (fee_id)
      DO UPDATE SET
        verdict = EXCLUDED.verdict,
        verified_by = EXCLUDED.verified_by,
        verified_at = NOW()
    `;
  }
}

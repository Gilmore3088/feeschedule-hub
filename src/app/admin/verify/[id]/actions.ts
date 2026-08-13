"use server";

import { requireAuth } from "@/lib/auth";
import { sql } from "@/lib/data-store/connection";

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
      SELECT save_gold_standard_fee_verification(
        ${institutionId},
        ${entry.fee_id},
        ${entry.verdict},
        ${user.username}
      )
    `;
  }
}

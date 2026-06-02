"use server";
/**
 * Admin fee review/approval actions, agentic-pipeline edition.
 *
 * Previously this file wrote to `extracted_fees` and used SET LOCAL
 * app.allow_legacy_writes='true' to bypass the freeze trigger. As of the
 * 2026-05-24 cutover, every action targets `fees_verified` (Tier-2 of the
 * three-tier pipeline). Historical audit rows in `fee_reviews` are
 * preserved but new code does NOT write to that table — the audit trail
 * for these mutations lives in `agent_events` / `agent_auth_log`, written
 * by the agent gateway on the Python side. From this file we touch only
 * the user-visible state on `fees_verified`.
 */

import { revalidatePath } from "next/cache";
import { getCurrentUser, hasPermission, type Permission } from "./auth";
import { sql } from "@/lib/crawler-db/connection";

async function requirePermission(permission: Permission) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  if (!hasPermission(user, permission)) throw new Error("Forbidden");
  return user;
}

// fees_verified.review_status: 'verified' (Darwin output) -> 'approved' (analyst)
//                              | 'challenged' (analyst pushback) | 'rejected'.
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  verified: ["approved", "rejected", "challenged"],
  challenged: ["approved", "rejected"],
  approved: ["challenged", "rejected"],
  rejected: ["challenged"],
};

function assertTransition(current: string, target: string) {
  const allowed = ALLOWED_TRANSITIONS[current];
  if (!allowed || !allowed.includes(target)) {
    throw new Error(`Cannot transition from '${current}' to '${target}'`);
  }
}

// ─── Single-row actions ───────────────────────────────────────────────────

export async function approveFee(
  feeId: number,
  _notes?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await requirePermission("approve");
    await sql.begin(async (tx: any) => {
      const [fee] = await tx`
        SELECT fee_verified_id, review_status
        FROM fees_verified WHERE fee_verified_id = ${feeId}
      `;
      if (!fee) throw new Error("Fee not found");
      assertTransition(fee.review_status, "approved");
      await tx`UPDATE fees_verified SET review_status = 'approved' WHERE fee_verified_id = ${feeId}`;
    });
    revalidatePath("/admin/review");
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function rejectFee(
  feeId: number,
  _notes?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await requirePermission("reject");
    await sql.begin(async (tx: any) => {
      const [fee] = await tx`
        SELECT fee_verified_id, review_status
        FROM fees_verified WHERE fee_verified_id = ${feeId}
      `;
      if (!fee) throw new Error("Fee not found");
      assertTransition(fee.review_status, "rejected");
      await tx`UPDATE fees_verified SET review_status = 'rejected' WHERE fee_verified_id = ${feeId}`;
    });
    revalidatePath("/admin/review");
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function editFee(
  feeId: number,
  updates: {
    fee_name?: string;
    amount?: number | null;
    frequency?: string | null;
  },
  _notes?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await requirePermission("edit");
    await sql.begin(async (tx: any) => {
      const [fee] = await tx`
        SELECT fee_verified_id, review_status
        FROM fees_verified WHERE fee_verified_id = ${feeId}
      `;
      if (!fee) throw new Error("Fee not found");
      if (fee.review_status === "approved" || fee.review_status === "rejected") {
        throw new Error("Cannot edit a reviewed fee");
      }
      if (updates.fee_name !== undefined) {
        await tx`UPDATE fees_verified SET fee_name = ${updates.fee_name} WHERE fee_verified_id = ${feeId}`;
      }
      if (updates.amount !== undefined) {
        await tx`UPDATE fees_verified SET amount = ${updates.amount} WHERE fee_verified_id = ${feeId}`;
      }
      if (updates.frequency !== undefined) {
        await tx`UPDATE fees_verified SET frequency = ${updates.frequency} WHERE fee_verified_id = ${feeId}`;
      }
    });
    revalidatePath("/admin/review");
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function updateFeeCategory(
  feeId: number,
  canonicalKey: string | null,
): Promise<{ success: boolean; error?: string }> {
  try {
    await requirePermission("edit");
    await sql`
      UPDATE fees_verified SET canonical_fee_key = ${canonicalKey}
      WHERE fee_verified_id = ${feeId}
    `;
    revalidatePath("/admin/review");
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function editAndApproveFee(
  feeId: number,
  updates: {
    fee_name?: string;
    amount?: number | null;
    frequency?: string | null;
  },
  notes?: string,
): Promise<{ success: boolean; error?: string }> {
  const edit = await editFee(feeId, updates, notes);
  if (!edit.success) return edit;
  return approveFee(feeId, notes);
}

export async function unstageFee(
  feeId: number,
  _notes?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await requirePermission("approve");
    await sql`
      UPDATE fees_verified SET review_status = 'challenged'
      WHERE fee_verified_id = ${feeId}
    `;
    revalidatePath("/admin/review");
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

// ─── Bulk actions ─────────────────────────────────────────────────────────

export async function bulkApproveStagedFees(
  feeIds?: number[],
): Promise<{ success: boolean; count?: number; error?: string }> {
  try {
    await requirePermission("approve");
    if (feeIds && feeIds.length === 0) return { success: true, count: 0 };
    const rows = feeIds
      ? await sql`
          UPDATE fees_verified SET review_status = 'approved'
          WHERE fee_verified_id = ANY(${feeIds}::bigint[])
            AND review_status IN ('verified', 'challenged')
          RETURNING fee_verified_id
        `
      : await sql`
          UPDATE fees_verified SET review_status = 'approved'
          WHERE review_status IN ('verified', 'challenged')
          RETURNING fee_verified_id
        `;
    revalidatePath("/admin/review");
    return { success: true, count: rows.length };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function bulkRejectFees(
  feeIds: number[],
  _notes?: string,
): Promise<{ success: boolean; count?: number; error?: string }> {
  try {
    await requirePermission("reject");
    if (feeIds.length === 0) return { success: true, count: 0 };
    const rows = await sql`
      UPDATE fees_verified SET review_status = 'rejected'
      WHERE fee_verified_id = ANY(${feeIds}::bigint[])
      RETURNING fee_verified_id
    `;
    revalidatePath("/admin/review");
    return { success: true, count: rows.length };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function bulkEditAndApproveFees(
  edits: {
    feeId: number;
    updates: { fee_name?: string; amount?: number | null; frequency?: string | null };
  }[],
  _notes?: string,
): Promise<{ success: boolean; count?: number; error?: string }> {
  try {
    await requirePermission("edit");
    let count = 0;
    for (const { feeId, updates } of edits) {
      const r = await editAndApproveFee(feeId, updates);
      if (r.success) count++;
    }
    revalidatePath("/admin/review");
    return { success: true, count };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function bulkApproveFees(
  feeIds: number[],
  _notes?: string,
): Promise<{ success: boolean; count?: number; error?: string }> {
  return bulkApproveStagedFees(feeIds);
}

export async function bulkApproveByConfidence(
  minConfidence: number,
): Promise<{ success: boolean; count?: number; error?: string }> {
  try {
    await requirePermission("approve");
    const rows = await sql`
      UPDATE fees_verified SET review_status = 'approved'
      WHERE review_status IN ('verified', 'challenged')
        AND extraction_confidence >= ${minConfidence}
      RETURNING fee_verified_id
    `;
    revalidatePath("/admin/review");
    return { success: true, count: rows.length };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function bulkRejectByInstitution(
  institutionId: number,
): Promise<{ success: boolean; count?: number; error?: string }> {
  try {
    await requirePermission("reject");
    const rows = await sql`
      UPDATE fees_verified SET review_status = 'rejected'
      WHERE institution_id = ${institutionId}
        AND review_status NOT IN ('approved', 'rejected')
      RETURNING fee_verified_id
    `;
    revalidatePath("/admin/review");
    return { success: true, count: rows.length };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function bulkUpdateFeeCategory(
  feeIds: number[],
  canonicalKey: string | null,
): Promise<{ success: boolean; count?: number; error?: string }> {
  try {
    await requirePermission("edit");
    if (feeIds.length === 0) return { success: true, count: 0 };
    const rows = await sql`
      UPDATE fees_verified SET canonical_fee_key = ${canonicalKey}
      WHERE fee_verified_id = ANY(${feeIds}::bigint[])
      RETURNING fee_verified_id
    `;
    revalidatePath("/admin/review");
    return { success: true, count: rows.length };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

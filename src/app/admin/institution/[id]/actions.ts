"use server";

import { requireAuth } from "@/lib/auth";
import { sql } from "@/lib/crawler-db/connection";
import { revalidatePath } from "next/cache";

export async function updateFeeUrl(
  institutionId: number,
  url: string,
): Promise<{ ok?: boolean; error?: string }> {
  await requireAuth("edit");

  if (!url.startsWith("http")) {
    return { error: "URL must start with http" };
  }

  try {
    await sql`
      UPDATE crawl_targets
      SET fee_schedule_url = ${url},
          document_type = NULL
      WHERE id = ${institutionId}
    `;
    revalidatePath(`/admin/institution/${institutionId}`);
    return { ok: true };
  } catch (e) {
    console.error("updateFeeUrl failed:", e);
    return { error: "Failed to update URL" };
  }
}

export async function approveFee(
  feeId: number,
  institutionId: number,
): Promise<{ ok?: boolean; error?: string }> {
  await requireAuth("approve");

  try {
    await sql`
      UPDATE extracted_fees SET review_status = 'approved' WHERE id = ${feeId}
    `;
    revalidatePath(`/admin/institution/${institutionId}`);
    return { ok: true };
  } catch (e) {
    console.error("approveFee failed:", e);
    return { error: "Failed to approve fee" };
  }
}

export async function markDuplicate(
  feeId: number,
  institutionId: number,
): Promise<{ ok?: boolean; error?: string }> {
  await requireAuth("reject");

  try {
    await sql`
      UPDATE extracted_fees SET review_status = 'rejected', validation_flags = jsonb_build_object('reason', 'duplicate') WHERE id = ${feeId}
    `;
    revalidatePath(`/admin/institution/${institutionId}`);
    return { ok: true };
  } catch (e) {
    console.error("markDuplicate failed:", e);
    return { error: "Failed to mark as duplicate" };
  }
}

export async function rejectFee(
  feeId: number,
  institutionId: number,
): Promise<{ ok?: boolean; error?: string }> {
  await requireAuth("reject");

  try {
    await sql`
      UPDATE extracted_fees SET review_status = 'rejected' WHERE id = ${feeId}
    `;
    revalidatePath(`/admin/institution/${institutionId}`);
    return { ok: true };
  } catch (e) {
    console.error("rejectFee failed:", e);
    return { error: "Failed to reject fee" };
  }
}

export async function approveAllFees(
  institutionId: number,
): Promise<{ ok?: boolean; error?: string; count?: number }> {
  await requireAuth("approve");

  try {
    const result = await sql`
      UPDATE extracted_fees SET review_status = 'approved'
      WHERE crawl_target_id = ${institutionId} AND review_status IN ('staged', 'pending')
    `;
    revalidatePath(`/admin/institution/${institutionId}`);
    return { ok: true, count: result.count };
  } catch (e) {
    console.error("approveAllFees failed:", e);
    return { error: "Failed to approve fees" };
  }
}

export async function updateFee(
  feeId: number,
  institutionId: number,
  updates: { amount?: number | null; fee_name?: string; conditions?: string },
): Promise<{ ok?: boolean; error?: string }> {
  await requireAuth("edit");

  try {
    if (updates.amount !== undefined) {
      await sql`UPDATE extracted_fees SET amount = ${updates.amount} WHERE id = ${feeId}`;
    }
    if (updates.fee_name !== undefined) {
      await sql`UPDATE extracted_fees SET fee_name = ${updates.fee_name} WHERE id = ${feeId}`;
    }
    if (updates.conditions !== undefined) {
      await sql`UPDATE extracted_fees SET conditions = ${updates.conditions} WHERE id = ${feeId}`;
    }
    revalidatePath(`/admin/institution/${institutionId}`);
    return { ok: true };
  } catch (e) {
    console.error("updateFee failed:", e);
    return { error: "Failed to update fee" };
  }
}

export async function markInstitutionOffline(
  institutionId: number,
): Promise<{ ok?: boolean; error?: string }> {
  await requireAuth("edit");

  try {
    await sql`
      UPDATE crawl_targets
      SET fee_schedule_url = NULL,
          document_type = 'offline'
      WHERE id = ${institutionId}
    `;
    revalidatePath(`/admin/institution/${institutionId}`);
    return { ok: true };
  } catch (e) {
    console.error("markInstitutionOffline failed:", e);
    return { error: "Failed to mark offline" };
  }
}

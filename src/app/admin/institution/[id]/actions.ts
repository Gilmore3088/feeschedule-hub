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

    // Auto-trigger extraction after URL save (fire-and-forget)
    runExtract(institutionId).catch(() => {});

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
      UPDATE fees_verified SET review_status = 'approved' WHERE fee_verified_id = ${feeId}
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
      UPDATE fees_verified SET review_status = 'rejected', outlier_flags = '["duplicate"]'::jsonb WHERE fee_verified_id = ${feeId}
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
      UPDATE fees_verified SET review_status = 'rejected' WHERE fee_verified_id = ${feeId}
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
      UPDATE fees_verified SET review_status = 'approved'
      WHERE institution_id = ${institutionId} AND review_status IN ('verified', 'challenged')
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
      await sql`UPDATE fees_verified SET amount = ${updates.amount} WHERE fee_verified_id = ${feeId}`;
    }
    if (updates.fee_name !== undefined) {
      await sql`UPDATE fees_verified SET fee_name = ${updates.fee_name} WHERE fee_verified_id = ${feeId}`;
    }
    if (updates.conditions !== undefined) {
      await sql`UPDATE fees_verified SET conditions = ${updates.conditions} WHERE fee_verified_id = ${feeId}`;
    }
    revalidatePath(`/admin/institution/${institutionId}`);
    return { ok: true };
  } catch (e) {
    console.error("updateFee failed:", e);
    return { error: "Failed to update fee" };
  }
}

export async function runExtract(
  institutionId: number,
): Promise<{ ok?: boolean; error?: string; feeCount?: number }> {
  await requireAuth("edit");

  try {
    const [inst] = await sql`SELECT * FROM crawl_targets WHERE id = ${institutionId}`;
    if (!inst) return { error: "Institution not found" };
    if (!inst.fee_schedule_url) return { error: "No fee schedule URL set" };

    // Call Modal endpoint for single-institution extraction
    const modalExtractUrl = process.env.MODAL_EXTRACT_URL || "https://gilmore3088--bank-fee-index-workers-extract-single.modal.run";

    const res = await fetch(modalExtractUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_id: institutionId }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { error: `Modal extraction failed (${res.status}): ${body.slice(0, 200)}` };
    }

    const result = await res.json();
    if (result.error) return { error: result.error };

    revalidatePath(`/admin/institution/${institutionId}`);
    return { ok: true, feeCount: result.feeCount };
  } catch (e) {
    console.error("runExtract failed:", e);
    return { error: "Extraction failed: " + (e instanceof Error ? e.message : String(e)) };
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

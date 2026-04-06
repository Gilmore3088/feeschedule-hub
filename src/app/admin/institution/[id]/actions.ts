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

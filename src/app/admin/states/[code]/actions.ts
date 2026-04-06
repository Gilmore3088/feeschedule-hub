"use server";

import { requireAuth } from "@/lib/auth";
import { sql } from "@/lib/crawler-db/connection";
import { revalidatePath } from "next/cache";

export async function setFeeScheduleUrl(
  institutionId: number,
  url: string,
  stateCode: string
) {
  await requireAuth("view");

  if (!url.startsWith("http")) {
    return { error: "URL must start with http" };
  }

  await sql`
    UPDATE crawl_targets
    SET fee_schedule_url = ${url}
    WHERE id = ${institutionId}
  `;

  revalidatePath(`/admin/states/${stateCode}`);
  return { ok: true };
}

export async function markOffline(
  institutionId: number,
  stateCode: string
) {
  await requireAuth("view");

  // Clear the URL and set a flag in the document_type field
  await sql`
    UPDATE crawl_targets
    SET fee_schedule_url = NULL,
        document_type = 'offline'
    WHERE id = ${institutionId}
  `;

  revalidatePath(`/admin/states/${stateCode}`);
  return { ok: true };
}

export async function triggerExtract(
  institutionId: number,
  stateCode: string
) {
  await requireAuth("view");

  const modalUrl = process.env.MODAL_AGENT_URL;
  if (!modalUrl) {
    return { error: "MODAL_AGENT_URL not configured — run locally instead" };
  }

  // For single institution, we trigger the full state agent
  // but ideally we'd have a single-institution endpoint
  // For now, return instructions
  return {
    ok: true,
    message: `URL set. Run the agent for ${stateCode} from the Scout tab to extract fees.`,
  };
}

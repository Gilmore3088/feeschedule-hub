"use server";

import { requireAuth } from "@/lib/auth";
import {
  insertIntelligence,
  deleteIntelligence,
  type InsertIntelligenceParams,
} from "@/lib/crawler-db/intelligence";
import { revalidatePath } from "next/cache";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function addIntelligenceAction(
  formData: FormData
): Promise<ActionResult> {
  await requireAuth("edit");

  const source_name = (formData.get("source_name") as string | null)?.trim() ?? "";
  const source_date = (formData.get("source_date") as string | null)?.trim() ?? "";
  const category = (formData.get("category") as string | null)?.trim() ?? "";
  const tagsRaw = (formData.get("tags") as string | null)?.trim() ?? "";
  const content_text = (formData.get("content_text") as string | null)?.trim() ?? "";
  const source_url = (formData.get("source_url") as string | null)?.trim() || null;

  if (!source_name) return { ok: false, error: "Source name is required." };
  if (!source_date) return { ok: false, error: "Source date is required." };
  if (!category) return { ok: false, error: "Category is required." };
  if (!content_text) return { ok: false, error: "Content text is required." };

  const VALID_CATEGORIES = ["research", "survey", "regulation", "news", "analysis"] as const;
  if (!VALID_CATEGORIES.includes(category as typeof VALID_CATEGORIES[number])) {
    return { ok: false, error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(", ")}.` };
  }

  const tags = tagsRaw
    ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean)
    : [];

  const params: InsertIntelligenceParams = {
    source_name,
    source_date,
    category,
    tags,
    content_text,
    source_url,
  };

  try {
    await insertIntelligence(params);
    revalidatePath("/admin/national");
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: `Failed to save: ${message}` };
  }
}

export async function deleteIntelligenceAction(id: number): Promise<ActionResult> {
  await requireAuth("edit");

  try {
    const deleted = await deleteIntelligence(id);
    if (!deleted) return { ok: false, error: "Record not found." };
    revalidatePath("/admin/national");
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: `Failed to delete: ${message}` };
  }
}

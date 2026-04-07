"use server";

import { revalidatePath } from "next/cache";
import { createArticle, updateArticle, deleteArticle } from "@/lib/crawler-db/articles";

export async function saveArticle(data: {
  title: string;
  slug: string;
  subtitle?: string;
  content: string;
  category: string;
  tags?: string[];
}): Promise<{ success: boolean; id?: number; error?: string }> {
  if (!data.title || !data.slug || !data.content) {
    return { success: false, error: "Title, slug, and content are required" };
  }

  const slug = data.slug
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  try {
    const id = await createArticle({
      ...data,
      slug,
      generated_by: "content-writer",
    });
    revalidatePath("/admin/research/articles");
    return { success: true, id };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to save article";
    return { success: false, error: msg };
  }
}

export async function updateArticleAction(
  id: number,
  data: Partial<{
    title: string;
    subtitle: string | null;
    content: string;
    category: string;
    tags: string[];
    status: string;
  }>
): Promise<{ success: boolean; error?: string }> {
  try {
    const updated = await updateArticle(id, data);
    if (!updated) return { success: false, error: "Article not found" };
    revalidatePath("/admin/research/articles");
    revalidatePath("/research/articles");
    return { success: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to update article";
    return { success: false, error: msg };
  }
}

export async function deleteArticleAction(
  id: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const deleted = await deleteArticle(id);
    if (!deleted) return { success: false, error: "Article not found" };
    revalidatePath("/admin/research/articles");
    return { success: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to delete article";
    return { success: false, error: msg };
  }
}

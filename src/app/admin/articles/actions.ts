"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { getWriteDb } from "@/lib/crawler-db/connection";
import { canTransition, canSetStatus } from "@/lib/article-permissions";
import type { Role } from "@/lib/article-permissions";
import type { ArticleStatus } from "@/lib/crawler-db/types";

export async function updateArticleStatus(
  articleId: number,
  newStatus: ArticleStatus
): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };

  if (!canSetStatus(user.role as Role, newStatus)) {
    return {
      success: false,
      error: `Role '${user.role}' cannot set status to '${newStatus}'`,
    };
  }

  const db = getWriteDb();
  try {
    const article = db
      .prepare("SELECT id, status FROM articles WHERE id = ?")
      .get(articleId) as { id: number; status: ArticleStatus } | undefined;

    if (!article) return { success: false, error: "Article not found" };

    if (!canTransition(article.status, newStatus)) {
      return {
        success: false,
        error: `Cannot transition from '${article.status}' to '${newStatus}'`,
      };
    }

    const updates: Record<string, string | null> = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };

    if (newStatus === "approved" || newStatus === "rejected") {
      updates.reviewed_by = user.username;
      updates.reviewed_at = new Date().toISOString();
    }

    if (newStatus === "published") {
      updates.published_at = new Date().toISOString();
    }

    if (newStatus === "approved" && article.status === "published") {
      updates.published_at = null;
    }

    const setClauses = Object.keys(updates)
      .map((k) => `${k} = ?`)
      .join(", ");
    const values = Object.values(updates);

    db.prepare(`UPDATE articles SET ${setClauses} WHERE id = ?`).run(
      ...values,
      articleId
    );

    revalidatePath("/admin/articles");
    revalidatePath(`/admin/articles/${articleId}`);
    revalidatePath("/research");

    return { success: true };
  } finally {
    db.close();
  }
}

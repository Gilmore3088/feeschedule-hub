"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { getWriteDb } from "@/lib/crawler-db/connection";
import type { ArticleStatus } from "@/lib/crawler-db/types";

type Role = "viewer" | "analyst" | "admin";

const ALLOWED_TRANSITIONS: Record<ArticleStatus, readonly ArticleStatus[]> = {
  draft: ["review", "rejected"],
  review: ["approved", "rejected", "draft"],
  approved: ["published", "rejected"],
  published: ["approved"],
  rejected: ["draft"],
};

const PUBLISH_PERMISSIONS: Record<ArticleStatus, readonly Role[]> = {
  draft: ["analyst", "admin"],
  review: ["analyst", "admin"],
  approved: ["analyst", "admin"],
  rejected: ["analyst", "admin"],
  published: ["admin"],
};

export async function updateArticleStatus(
  articleId: number,
  newStatus: ArticleStatus
): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const requiredRoles = PUBLISH_PERMISSIONS[newStatus];
  if (!requiredRoles || !requiredRoles.includes(user.role as Role)) {
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

    const allowed = ALLOWED_TRANSITIONS[article.status];
    if (!allowed || !allowed.includes(newStatus)) {
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

"use server";

import Database from "better-sqlite3";
import { revalidatePath } from "next/cache";
import path from "path";
import { getCurrentUser } from "@/lib/auth";

const DB_PATH = path.join(process.cwd(), "data", "crawler.db");

function getWriteDb(): Database.Database {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.pragma("foreign_keys = ON");
  return db;
}

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  draft: ["review", "rejected"],
  review: ["approved", "rejected", "draft"],
  approved: ["published", "rejected"],
  published: ["approved"],  // unpublish
};

export async function updateArticleStatus(
  articleId: number,
  newStatus: string
): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const db = getWriteDb();
  try {
    const article = db
      .prepare("SELECT id, status FROM articles WHERE id = ?")
      .get(articleId) as { id: number; status: string } | undefined;

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
      // Unpublishing
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

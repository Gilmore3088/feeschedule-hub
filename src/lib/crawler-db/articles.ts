import { getDb } from "./connection";
import { getWriteDb } from "./connection";

export interface Article {
  id: number;
  slug: string;
  title: string;
  subtitle: string | null;
  content: string;
  category: string;
  tags: string | null;
  author: string;
  status: "draft" | "published" | "archived";
  generated_by: string | null;
  conversation_id: number | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  view_count: number;
}

export function getArticles(opts?: {
  status?: string;
  category?: string;
  limit?: number;
  offset?: number;
}): { articles: Article[]; total: number } {
  const db = getDb();
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (opts?.status) {
    conditions.push("status = ?");
    params.push(opts.status);
  }
  if (opts?.category) {
    conditions.push("category = ?");
    params.push(opts.category);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = opts?.limit || 50;
  const offset = opts?.offset || 0;

  const total = (db.prepare(`SELECT COUNT(*) as c FROM research_articles ${where}`).get(...params) as { c: number }).c;
  const articles = db.prepare(
    `SELECT * FROM research_articles ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`
  ).all(...params, limit, offset) as Article[];

  return { articles, total };
}

export function getArticleBySlug(slug: string): Article | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM research_articles WHERE slug = ?").get(slug) as Article | undefined;
  return row ?? null;
}

export function getArticleById(id: number): Article | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM research_articles WHERE id = ?").get(id) as Article | undefined;
  return row ?? null;
}

export function getPublishedArticles(limit = 20): Article[] {
  const db = getDb();
  return db.prepare(
    "SELECT * FROM research_articles WHERE status = 'published' ORDER BY published_at DESC LIMIT ?"
  ).all(limit) as Article[];
}

export function createArticle(data: {
  slug: string;
  title: string;
  subtitle?: string;
  content: string;
  category: string;
  tags?: string[];
  author?: string;
  generated_by?: string;
  conversation_id?: number;
}): number {
  const db = getWriteDb();
  try {
    const result = db.prepare(`
      INSERT INTO research_articles (slug, title, subtitle, content, category, tags, author, generated_by, conversation_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.slug,
      data.title,
      data.subtitle ?? null,
      data.content,
      data.category,
      data.tags ? JSON.stringify(data.tags) : null,
      data.author ?? "Fee Insight",
      data.generated_by ?? null,
      data.conversation_id ?? null,
    );
    return result.lastInsertRowid as number;
  } finally {
    db.close();
  }
}

export function updateArticle(id: number, data: Partial<{
  title: string;
  subtitle: string | null;
  content: string;
  category: string;
  tags: string[];
  author: string;
  status: string;
}>): boolean {
  const db = getWriteDb();
  try {
    const sets: string[] = ["updated_at = datetime('now')"];
    const params: (string | number | null)[] = [];

    if (data.title !== undefined) { sets.push("title = ?"); params.push(data.title); }
    if (data.subtitle !== undefined) { sets.push("subtitle = ?"); params.push(data.subtitle); }
    if (data.content !== undefined) { sets.push("content = ?"); params.push(data.content); }
    if (data.category !== undefined) { sets.push("category = ?"); params.push(data.category); }
    if (data.tags !== undefined) { sets.push("tags = ?"); params.push(JSON.stringify(data.tags)); }
    if (data.author !== undefined) { sets.push("author = ?"); params.push(data.author); }
    if (data.status !== undefined) {
      sets.push("status = ?");
      params.push(data.status);
      if (data.status === "published") {
        sets.push("published_at = COALESCE(published_at, datetime('now'))");
      }
    }

    params.push(id);
    const result = db.prepare(`UPDATE research_articles SET ${sets.join(", ")} WHERE id = ?`).run(...params);
    return result.changes > 0;
  } finally {
    db.close();
  }
}

export function deleteArticle(id: number): boolean {
  const db = getWriteDb();
  try {
    const result = db.prepare("DELETE FROM research_articles WHERE id = ?").run(id);
    return result.changes > 0;
  } finally {
    db.close();
  }
}

export function incrementViewCount(slug: string): void {
  const db = getWriteDb();
  try {
    db.prepare("UPDATE research_articles SET view_count = view_count + 1 WHERE slug = ? AND status = 'published'").run(slug);
  } finally {
    db.close();
  }
}

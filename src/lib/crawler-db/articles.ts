import { getDb } from "./connection";
import type { Article, ArticleSummary, ArticleStatus } from "./types";

function hasArticlesTable(db: ReturnType<typeof getDb>): boolean {
  const row = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='articles'"
    )
    .get() as { name: string } | undefined;
  return !!row;
}

export function getArticles(
  status?: ArticleStatus,
  limit = 50,
  offset = 0
): ArticleSummary[] {
  const db = getDb();
  try {
    if (!hasArticlesTable(db)) return [];
    const where = status ? "WHERE status = ?" : "";
    const params = status ? [status, limit, offset] : [limit, offset];
    return db
      .prepare(
        `SELECT id, slug, title, article_type, fee_category, fed_district,
                status, review_tier, summary, generated_at, published_at
         FROM articles ${where}
         ORDER BY generated_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(...params) as ArticleSummary[];
  } finally {
    db.close();
  }
}

export function getArticleById(id: number): Article | null {
  const db = getDb();
  try {
    if (!hasArticlesTable(db)) return null;
    return (
      (db.prepare("SELECT * FROM articles WHERE id = ?").get(id) as Article) ??
      null
    );
  } finally {
    db.close();
  }
}

export function getArticleBySlug(slug: string): Article | null {
  const db = getDb();
  try {
    if (!hasArticlesTable(db)) return null;
    return (
      (db
        .prepare("SELECT * FROM articles WHERE slug = ?")
        .get(slug) as Article) ?? null
    );
  } finally {
    db.close();
  }
}

export function getPublishedArticles(
  limit = 20,
  offset = 0
): ArticleSummary[] {
  const db = getDb();
  try {
    if (!hasArticlesTable(db)) return [];
    return db
      .prepare(
        `SELECT id, slug, title, article_type, fee_category, fed_district,
                status, review_tier, summary, generated_at, published_at
         FROM articles
         WHERE status = 'published'
         ORDER BY published_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(limit, offset) as ArticleSummary[];
  } finally {
    db.close();
  }
}

export function getPublishedArticlesByCategory(
  category: string,
  limit = 10
): ArticleSummary[] {
  const db = getDb();
  try {
    if (!hasArticlesTable(db)) return [];
    return db
      .prepare(
        `SELECT id, slug, title, article_type, fee_category, fed_district,
                status, review_tier, summary, generated_at, published_at
         FROM articles
         WHERE status = 'published' AND fee_category = ?
         ORDER BY published_at DESC
         LIMIT ?`
      )
      .all(category, limit) as ArticleSummary[];
  } finally {
    db.close();
  }
}

export function countArticlesByStatus(): Record<string, number> {
  const db = getDb();
  try {
    const defaults: Record<string, number> = {
      draft: 0,
      review: 0,
      approved: 0,
      published: 0,
      rejected: 0,
    };
    if (!hasArticlesTable(db)) return defaults;
    const rows = db
      .prepare(
        "SELECT status, COUNT(*) as count FROM articles GROUP BY status"
      )
      .all() as { status: string; count: number }[];
    for (const row of rows) {
      defaults[row.status] = row.count;
    }
    return defaults;
  } finally {
    db.close();
  }
}

export function getRecentPublishedSlugs(limit = 100): string[] {
  const db = getDb();
  try {
    if (!hasArticlesTable(db)) return [];
    const rows = db
      .prepare(
        "SELECT slug FROM articles WHERE status = 'published' ORDER BY published_at DESC LIMIT ?"
      )
      .all(limit) as { slug: string }[];
    return rows.map((r) => r.slug);
  } finally {
    db.close();
  }
}

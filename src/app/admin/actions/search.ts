"use server";

import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "crawler.db");

export interface SearchResult {
  institutions: {
    id: number;
    name: string;
    state: string | null;
    charter: string;
  }[];
  categories: {
    fee_category: string;
    count: number;
  }[];
  feeNames: {
    fee_name: string;
    count: number;
  }[];
  conversations: {
    id: number;
    agent_id: string;
    title: string;
    updated_at: string;
  }[];
}

export async function searchDashboard(query: string): Promise<SearchResult> {
  if (!query || query.length < 2) {
    return { institutions: [], categories: [], feeNames: [], conversations: [] };
  }

  const db = new Database(DB_PATH, { readonly: true });
  db.pragma("journal_mode = WAL");

  try {
    const pattern = `%${query}%`;

    const institutions = db
      .prepare(
        `SELECT id, institution_name as name, state_code as state, charter_type as charter
         FROM crawl_targets
         WHERE institution_name LIKE ?
         ORDER BY asset_size DESC NULLS LAST
         LIMIT 8`
      )
      .all(pattern) as SearchResult["institutions"];

    const categories = db
      .prepare(
        `SELECT fee_category, COUNT(DISTINCT crawl_target_id) as count
         FROM extracted_fees
         WHERE fee_category LIKE ?
         AND fee_category IS NOT NULL
         GROUP BY fee_category
         ORDER BY count DESC
         LIMIT 8`
      )
      .all(pattern) as SearchResult["categories"];

    const feeNames = db
      .prepare(
        `SELECT fee_name, COUNT(*) as count
         FROM extracted_fees
         WHERE fee_name LIKE ?
         GROUP BY fee_name
         ORDER BY count DESC
         LIMIT 8`
      )
      .all(pattern) as SearchResult["feeNames"];

    // Research conversations
    let conversations: SearchResult["conversations"] = [];
    try {
      conversations = db
        .prepare(
          `SELECT id, agent_id, title, updated_at
           FROM research_conversations
           WHERE title LIKE ?
           ORDER BY updated_at DESC
           LIMIT 5`
        )
        .all(pattern) as SearchResult["conversations"];
    } catch {
      // Table may not exist yet
    }

    return { institutions, categories, feeNames, conversations };
  } finally {
    db.close();
  }
}

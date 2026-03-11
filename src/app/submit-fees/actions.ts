"use server";

import { getWriteDb } from "@/lib/crawler-db/connection";
import { headers } from "next/headers";

const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 5; // max submissions per window per IP
const recentSubmissions = new Map<string, number[]>();

interface SubmitFeeInput {
  institution_name: string;
  source_url: string;
  fees: {
    fee_name: string;
    fee_category: string;
    amount: number | null;
    frequency: string;
  }[];
}

interface SubmitResult {
  success: boolean;
  message: string;
  count?: number;
}

function getClientIp(): string {
  // headers() is async in Next.js 16
  // We'll get IP from x-forwarded-for or fall back
  return "unknown";
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const timestamps = recentSubmissions.get(ip) || [];
  const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) {
    return false;
  }
  recent.push(now);
  recentSubmissions.set(ip, recent);
  return true;
}

export async function submitFees(input: SubmitFeeInput): Promise<SubmitResult> {
  // Validate
  if (!input.institution_name?.trim()) {
    return { success: false, message: "Institution name is required" };
  }
  if (!input.source_url?.trim()) {
    return { success: false, message: "Source URL is required" };
  }
  if (!input.fees || input.fees.length === 0) {
    return { success: false, message: "At least one fee is required" };
  }
  if (input.fees.length > 20) {
    return { success: false, message: "Maximum 20 fees per submission" };
  }

  // Basic URL validation
  try {
    new URL(input.source_url);
  } catch {
    return { success: false, message: "Invalid source URL" };
  }

  // Rate limit
  const headersList = await headers();
  const ip = headersList.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkRateLimit(ip)) {
    return { success: false, message: "Too many submissions. Please wait a minute." };
  }

  // Find matching institution (optional)
  const db = getWriteDb();
  try {
    // Ensure table exists (idempotent)
    db.exec(`
      CREATE TABLE IF NOT EXISTS community_submissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        crawl_target_id INTEGER REFERENCES crawl_targets(id),
        institution_name TEXT NOT NULL,
        fee_name TEXT NOT NULL,
        fee_category TEXT,
        amount REAL,
        frequency TEXT,
        source_url TEXT NOT NULL,
        submitter_ip TEXT,
        review_status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    const target = db.prepare(
      "SELECT id FROM crawl_targets WHERE institution_name = ? COLLATE NOCASE LIMIT 1"
    ).get(input.institution_name.trim()) as { id: number } | undefined;

    const targetId = target?.id ?? null;

    const stmt = db.prepare(`
      INSERT INTO community_submissions
        (crawl_target_id, institution_name, fee_name, fee_category, amount, frequency, source_url, submitter_ip)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = db.transaction((fees: typeof input.fees) => {
      for (const fee of fees) {
        if (!fee.fee_name?.trim()) continue;
        stmt.run(
          targetId,
          input.institution_name.trim(),
          fee.fee_name.trim(),
          fee.fee_category || null,
          fee.amount,
          fee.frequency || "per_occurrence",
          input.source_url.trim(),
          ip,
        );
      }
    });

    insertMany(input.fees);

    return {
      success: true,
      message: `Submitted ${input.fees.length} fee(s) for review. Thank you!`,
      count: input.fees.length,
    };
  } catch (e) {
    console.error("Fee submission error:", e);
    return { success: false, message: "An error occurred. Please try again." };
  } finally {
    db.close();
  }
}

export async function searchInstitutions(query: string): Promise<{ id: number; name: string; state: string | null }[]> {
  if (!query || query.length < 2) return [];

  const { getDb } = await import("@/lib/crawler-db/connection");
  const db = getDb();
  try {
    const rows = db.prepare(`
      SELECT id, institution_name as name, state_code as state
      FROM crawl_targets
      WHERE institution_name LIKE ?
      ORDER BY asset_size DESC NULLS LAST
      LIMIT 10
    `).all(`%${query}%`) as { id: number; name: string; state: string | null }[];
    return rows;
  } finally {
    db.close();
  }
}

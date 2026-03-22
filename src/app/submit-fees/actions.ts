"use server";

import { sql } from "@/lib/crawler-db/connection";
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

  try {
    new URL(input.source_url);
  } catch {
    return { success: false, message: "Invalid source URL" };
  }

  const headersList = await headers();
  const ip = headersList.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkRateLimit(ip)) {
    return { success: false, message: "Too many submissions. Please wait a minute." };
  }

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS community_submissions (
        id SERIAL PRIMARY KEY,
        crawl_target_id INTEGER REFERENCES crawl_targets(id),
        institution_name TEXT NOT NULL,
        fee_name TEXT NOT NULL,
        fee_category TEXT,
        amount REAL,
        frequency TEXT,
        source_url TEXT NOT NULL,
        submitter_ip TEXT,
        review_status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `;

    const [target] = await sql`
      SELECT id FROM crawl_targets
      WHERE LOWER(institution_name) = LOWER(${input.institution_name.trim()})
      LIMIT 1
    `;
    const targetId = target?.id ?? null;

    await sql.begin(async (tx: any) => {
      for (const fee of input.fees) {
        if (!fee.fee_name?.trim()) continue;
        await tx`
          INSERT INTO community_submissions
            (crawl_target_id, institution_name, fee_name, fee_category, amount, frequency, source_url, submitter_ip)
          VALUES (${targetId}, ${input.institution_name.trim()}, ${fee.fee_name.trim()},
                  ${fee.fee_category || null}, ${fee.amount}, ${fee.frequency || "per_occurrence"},
                  ${input.source_url.trim()}, ${ip})
        `;
      }
    });

    return {
      success: true,
      message: `Submitted ${input.fees.length} fee(s) for review. Thank you!`,
      count: input.fees.length,
    };
  } catch (e) {
    console.error("Fee submission error:", e);
    return { success: false, message: "An error occurred. Please try again." };
  }
}

export async function searchInstitutions(query: string): Promise<{ id: number; name: string; state: string | null }[]> {
  if (!query || query.length < 2) return [];

  const escaped = query.replace(/[%_]/g, "\\$&");
  const rows = await sql`
    SELECT id, institution_name as name, state_code as state
    FROM crawl_targets
    WHERE institution_name LIKE ${"%" + escaped + "%"}
    ORDER BY asset_size DESC NULLS LAST
    LIMIT 10
  ` as { id: number; name: string; state: string | null }[];
  return rows;
}

/**
 * GET /api/reports/catalog
 * Returns published reports where is_public=true.
 * Public endpoint — no authentication required.
 * Supports optional query params: ?type=national_index&from=YYYY-MM-DD
 */

import { NextResponse } from "next/server";
import { getSql } from "@/lib/crawler-db/connection";
import type { PublishedReport, ReportType } from "@/lib/report-engine/types";

export const dynamic = "force-dynamic";

const VALID_REPORT_TYPES: Set<string> = new Set<ReportType>([
  "national_index",
  "state_index",
  "peer_brief",
  "monthly_pulse",
]);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const typeFilter = searchParams.get("type");
    const fromFilter = searchParams.get("from");

    // Validate typeFilter against allowed values (T-16-03)
    const validatedType =
      typeFilter && VALID_REPORT_TYPES.has(typeFilter) ? typeFilter : null;

    // Validate fromFilter as a real date (T-16-03)
    let fromDate: Date | null = null;
    if (fromFilter) {
      const parsed = new Date(fromFilter);
      if (!isNaN(parsed.getTime())) {
        fromDate = parsed;
      }
    }

    const sql = getSql();
    const rows = await sql<PublishedReport[]>`
      SELECT id, report_type, slug, title, published_at
      FROM published_reports
      WHERE is_public = true
        ${validatedType ? sql` AND report_type = ${validatedType}` : sql``}
        ${fromDate ? sql` AND published_at >= ${fromDate.toISOString()}` : sql``}
      ORDER BY published_at DESC
      LIMIT 100
    `;

    return NextResponse.json({ reports: rows });
  } catch (err) {
    console.error("[/api/reports/catalog] error:", err);
    return NextResponse.json(
      { error: "Failed to fetch catalog" },
      { status: 500 }
    );
  }
}

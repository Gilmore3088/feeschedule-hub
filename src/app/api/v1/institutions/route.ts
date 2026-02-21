import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { searchInstitutions } from "@/lib/crawler-db/institutions";
import { getDb } from "@/lib/crawler-db/connection";

export async function GET(request: NextRequest) {
  const auth = authenticateApiKey(request);
  if (auth instanceof NextResponse) return auth;

  const query = request.nextUrl.searchParams.get("q") || "";
  const limit = Math.min(
    Number(request.nextUrl.searchParams.get("limit")) || 25,
    100
  );
  const offset = Number(request.nextUrl.searchParams.get("offset")) || 0;

  if (query) {
    const results = searchInstitutions(query, limit);
    return NextResponse.json({ data: results, count: results.length });
  }

  // List all institutions with pagination
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT ct.id, ct.institution_name, ct.city, ct.state_code,
              ct.charter_type, ct.asset_size_tier,
              COUNT(ef.id) as fee_count
       FROM crawl_targets ct
       LEFT JOIN extracted_fees ef ON ef.crawl_target_id = ct.id
         AND ef.review_status != 'rejected'
       GROUP BY ct.id
       ORDER BY ct.institution_name
       LIMIT ? OFFSET ?`
    )
    .all(limit, offset);

  const total = db
    .prepare("SELECT COUNT(*) as cnt FROM crawl_targets")
    .get() as { cnt: number };

  return NextResponse.json({
    data: rows,
    pagination: { limit, offset, total: total.cnt },
  });
}

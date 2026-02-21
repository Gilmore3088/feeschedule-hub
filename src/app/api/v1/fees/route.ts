import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { getDb } from "@/lib/crawler-db/connection";

export async function GET(request: NextRequest) {
  const auth = authenticateApiKey(request);
  if (auth instanceof NextResponse) return auth;

  const institutionId = request.nextUrl.searchParams.get("institution_id");
  const category = request.nextUrl.searchParams.get("category");
  const limit = Math.min(
    Number(request.nextUrl.searchParams.get("limit")) || 50,
    500
  );
  const offset = Number(request.nextUrl.searchParams.get("offset")) || 0;

  const db = getDb();
  const conditions: string[] = ["ef.review_status != 'rejected'"];
  const params: (string | number)[] = [];

  if (institutionId) {
    conditions.push("ef.crawl_target_id = ?");
    params.push(Number(institutionId));
  }
  if (category) {
    conditions.push("ef.fee_category = ?");
    params.push(category);
  }

  const where = conditions.join(" AND ");

  const rows = db
    .prepare(
      `SELECT ef.id, ef.fee_name, ef.fee_category, ef.amount, ef.frequency,
              ef.conditions, ef.review_status, ef.extraction_confidence,
              ct.institution_name, ct.state_code, ct.charter_type
       FROM extracted_fees ef
       JOIN crawl_targets ct ON ef.crawl_target_id = ct.id
       WHERE ${where}
       ORDER BY ef.fee_category, ct.institution_name
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset);

  const totalRow = db
    .prepare(
      `SELECT COUNT(*) as cnt FROM extracted_fees ef WHERE ${where}`
    )
    .get(...params) as { cnt: number };

  return NextResponse.json({
    data: rows,
    pagination: { limit, offset, total: totalRow.cnt },
  });
}

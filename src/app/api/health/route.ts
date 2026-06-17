import { NextResponse } from "next/server";
import { sql } from "@/lib/crawler-db/connection";

export async function GET() {
  try {
    // Live published count excludes soft-deleted rows (rollback contract).
    const [published] = await sql`
      SELECT COUNT(*)::int AS cnt FROM fees_published WHERE rolled_back_at IS NULL`;
    const [verified] = await sql`SELECT COUNT(*)::int AS cnt FROM fees_verified`;
    const [raw] = await sql`SELECT COUNT(*)::int AS cnt FROM fees_raw`;

    return NextResponse.json({
      status: "ok",
      tiers: {
        published: (published as { cnt: number }).cnt,
        verified: (verified as { cnt: number }).cnt,
        raw: (raw as { cnt: number }).cnt,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { status: "error", message: String(e) },
      { status: 503 }
    );
  }
}

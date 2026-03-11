import { NextResponse } from "next/server";
import { getDb } from "@/lib/crawler-db/connection";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getDb();
    const row = db.prepare("SELECT COUNT(*) as cnt FROM extracted_fees").get() as { cnt: number };

    return NextResponse.json({
      status: "ok",
      fee_count: row.cnt,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { status: "error", message: String(e) },
      { status: 503 }
    );
  }
}

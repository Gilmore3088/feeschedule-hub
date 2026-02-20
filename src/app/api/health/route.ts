import { NextResponse } from "next/server";
import { getDb } from "@/lib/crawler-db/connection";

export async function GET() {
  try {
    const db = getDb();
    const row = db
      .prepare("SELECT COUNT(*) as count FROM extracted_fees")
      .get() as { count: number };

    return NextResponse.json({
      status: "ok",
      fees: row.count,
      timestamp: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      { status: "error", timestamp: new Date().toISOString() },
      { status: 503 }
    );
  }
}

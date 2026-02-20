import { NextResponse } from "next/server";
import { getDb, getWriteDb } from "@/lib/crawler-db/connection";

function cleanExpiredSessions(): number {
  const db = getWriteDb();
  try {
    return db
      .prepare("DELETE FROM sessions WHERE expires_at < datetime('now')")
      .run().changes;
  } finally {
    db.close();
  }
}

export async function GET() {
  try {
    const db = getDb();
    const row = db
      .prepare("SELECT COUNT(*) as count FROM extracted_fees")
      .get() as { count: number };

    let expiredCleaned = 0;
    try {
      expiredCleaned = cleanExpiredSessions();
    } catch {
      // sessions table may not exist
    }

    return NextResponse.json({
      status: "ok",
      fees: row.count,
      expired_sessions_cleaned: expiredCleaned,
      timestamp: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      { status: "error", timestamp: new Date().toISOString() },
      { status: 503 }
    );
  }
}

import { NextResponse } from "next/server";
import { sql } from "@/lib/crawler-db/connection";

export async function GET() {
  try {
    const [row] = await sql`SELECT COUNT(*) as cnt FROM extracted_fees`;

    return NextResponse.json({
      status: "ok",
      fee_count: (row as { cnt: number }).cnt,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { status: "error", message: String(e) },
      { status: 503 }
    );
  }
}

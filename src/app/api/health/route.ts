import { withApiRoutePolicy } from "@/lib/api-hardening/route-wrapper";
import { NextResponse } from "next/server";
import { sql } from "@/lib/data-store/connection";

async function handleGET() {
  try {
    const [row] = await sql`SELECT COUNT(*) as cnt FROM published_fee_catalog`;

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

export const GET = withApiRoutePolicy("api.health", "GET", handleGET);

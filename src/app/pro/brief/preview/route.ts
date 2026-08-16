import { NextRequest, NextResponse } from "next/server";

const CONTEXT_PARAMS = ["instId", "peerSetId"] as const;

export async function GET(request: NextRequest) {
  const reportsUrl = request.nextUrl.clone();
  reportsUrl.pathname = "/pro/reports";
  reportsUrl.search = "";
  reportsUrl.searchParams.set("intent", "peer-brief");

  for (const key of CONTEXT_PARAMS) {
    const value = request.nextUrl.searchParams.get(key);
    if (value) reportsUrl.searchParams.set(key, value);
  }

  // Compatibility route only. Let the canonical Hamilton Reports surface own
  // auth/subscription handling so selected institution context survives.
  return new NextResponse(null, {
    status: 307,
    headers: { Location: `${reportsUrl.pathname}${reportsUrl.search}` },
  });
}

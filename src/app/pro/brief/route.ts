import { NextRequest } from "next/server";
import { NextResponse } from "next/server";

function buildHamiltonReportsPath(request: NextRequest): string {
  const target = request.nextUrl.clone();
  target.pathname = "/pro/reports";
  target.search = "";
  const params = target.searchParams;
  const sourceParams = request.nextUrl.searchParams;

  params.set("intent", "peer-brief");

  for (const key of ["instId", "peerSetId"]) {
    const value = sourceParams.get(key);
    if (value) params.set(key, value);
  }

  for (const key of ["charter", "tier", "district"]) {
    const value = sourceParams.get(key);
    if (value) {
      params.set(key, value);
      params.set("legacyPeerFilters", "1");
    }
  }

  return `${target.pathname}${target.search}`;
}

export async function GET(request: NextRequest) {
  // Compatibility route only. Let the canonical Hamilton Reports surface own
  // auth/subscription handling so selected institution context survives.
  return new NextResponse(null, {
    status: 307,
    headers: { Location: buildHamiltonReportsPath(request) },
  });
}

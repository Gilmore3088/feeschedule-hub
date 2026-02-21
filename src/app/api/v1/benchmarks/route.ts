import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { getNationalIndex, getPeerIndex } from "@/lib/crawler-db/fee-index";

export async function GET(request: NextRequest) {
  const auth = authenticateApiKey(request);
  if (auth instanceof NextResponse) return auth;

  const category = request.nextUrl.searchParams.get("category");
  const charter = request.nextUrl.searchParams.get("charter");
  const tiers = request.nextUrl.searchParams.get("tiers")?.split(",");
  const districts = request.nextUrl.searchParams
    .get("districts")
    ?.split(",")
    .map(Number)
    .filter(Boolean);

  const hasPeerFilters = charter || tiers?.length || districts?.length;

  let index;
  if (hasPeerFilters) {
    index = getPeerIndex({
      charter_type: charter || undefined,
      asset_tiers: tiers || undefined,
      fed_districts: districts || undefined,
    });
  } else {
    index = getNationalIndex();
  }

  if (category) {
    const entry = index.find((e) => e.fee_category === category);
    if (!entry) {
      return NextResponse.json(
        { error: `Category '${category}' not found` },
        { status: 404 }
      );
    }
    return NextResponse.json({ data: entry });
  }

  return NextResponse.json({ data: index, count: index.length });
}

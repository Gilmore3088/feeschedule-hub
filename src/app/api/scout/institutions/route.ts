import { withApiRoutePolicy } from "@/lib/api-hardening/route-wrapper";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { autocompleteInstitutions } from "@/lib/scout/db";

async function handleGET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user, "research")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) return NextResponse.json([]);

  try {
    const results = await autocompleteInstitutions(q);
    return NextResponse.json(results);
  } catch {
    return NextResponse.json(
      { error: "Search failed" },
      { status: 500 }
    );
  }
}

export const GET = withApiRoutePolicy("api.scout.institutions", "GET", handleGET);

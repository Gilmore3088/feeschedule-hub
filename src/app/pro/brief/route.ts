import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { canAccessPremium } from "@/lib/access";
import { getNationalIndex, getPeerIndex } from "@/lib/crawler-db";
import { generatePeerBrief } from "@/lib/brief-generator";
import { DISTRICT_NAMES, TIER_LABELS } from "@/lib/fed-districts";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canAccessPremium(user)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const charter = params.get("charter") || "";
  const tiers = params.get("tier")?.split(",").filter(Boolean) || [];
  const districts = params
    .get("district")
    ?.split(",")
    .map(Number)
    .filter((d) => d >= 1 && d <= 12) || [];

  const hasFilters = charter !== "" || tiers.length > 0 || districts.length > 0;

  const nationalIndex = await getNationalIndex();
  const peerIndex = hasFilters
    ? await getPeerIndex({
        charter_type: charter || undefined,
        asset_tiers: tiers.length > 0 ? tiers : undefined,
        fed_districts: districts.length > 0 ? districts : undefined,
      })
    : nationalIndex;

  // Build title
  const parts: string[] = [];
  if (charter === "bank") parts.push("Banks");
  else if (charter === "credit_union") parts.push("Credit Unions");
  if (tiers.length > 0) parts.push(tiers.map((t) => TIER_LABELS[t] || t).join(", "));
  if (districts.length > 0) parts.push(districts.map((d) => `District ${d} (${DISTRICT_NAMES[d]})`).join(", "));

  const segmentLabel = parts.length > 0 ? parts.join(" / ") : "All Institutions";

  const html = generatePeerBrief({
    title: "Peer Fee Benchmarking Brief",
    subtitle: segmentLabel,
    peerIndex,
    nationalIndex,
  });

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `inline; filename="fee-brief-${new Date().toISOString().split("T")[0]}.html"`,
    },
  });
}

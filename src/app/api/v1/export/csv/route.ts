import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { getNationalIndex, getPeerIndex } from "@/lib/crawler-db/fee-index";
import { trackUsage } from "@/lib/subscriber-db";
import { getDisplayName } from "@/lib/fee-taxonomy";

export async function GET(request: NextRequest) {
  const auth = authenticateApiKey(request);
  if (auth instanceof NextResponse) return auth;

  const charter = request.nextUrl.searchParams.get("charter");
  const tiers = request.nextUrl.searchParams.get("tiers")?.split(",");
  const districts = request.nextUrl.searchParams
    .get("districts")
    ?.split(",")
    .map(Number)
    .filter(Boolean);

  const hasPeerFilters = charter || tiers?.length || districts?.length;
  const index = hasPeerFilters
    ? getPeerIndex({
        charter_type: charter || undefined,
        asset_tiers: tiers || undefined,
        fed_districts: districts || undefined,
      })
    : getNationalIndex();

  // Build CSV
  const headers = [
    "Category",
    "Display Name",
    "Family",
    "Median",
    "P25",
    "P75",
    "Min",
    "Max",
    "Institution Count",
    "Maturity",
  ];

  const rows = index.map((entry) => [
    entry.fee_category,
    getDisplayName(entry.fee_category),
    entry.fee_family || "",
    entry.median_amount?.toFixed(2) ?? "",
    entry.p25_amount?.toFixed(2) ?? "",
    entry.p75_amount?.toFixed(2) ?? "",
    entry.min_amount?.toFixed(2) ?? "",
    entry.max_amount?.toFixed(2) ?? "",
    String(entry.institution_count),
    entry.maturity_tier,
  ]);

  const csv = [
    headers.join(","),
    ...rows.map((r) => r.map((v) => `"${v}"`).join(",")),
  ].join("\n");

  trackUsage({
    organization_id: auth.organizationId,
    event_type: "export",
    metadata: { format: "csv", rows: rows.length },
  });

  const filename = hasPeerFilters
    ? `peer-benchmarks-${new Date().toISOString().slice(0, 10)}.csv`
    : `national-benchmarks-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

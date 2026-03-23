import { NextRequest, NextResponse } from "next/server";
import { getNationalIndex, getPeerIndex } from "@/lib/crawler-db";
import { getDisplayName, getFeeFamily, getFeeTier } from "@/lib/fee-taxonomy";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const state = searchParams.get("state");
  const charter = searchParams.get("charter");
  const district = searchParams.get("district");
  const format = searchParams.get("format");

  const hasFilters = state || charter || district;

  const entries = hasFilters
    ? await getPeerIndex({
        state_code: state?.toUpperCase() ?? undefined,
        charter_type:
          charter === "bank" || charter === "credit_union"
            ? charter
            : undefined,
        fed_districts: district
          ? district
              .split(",")
              .map((d) => parseInt(d, 10))
              .filter((d) => d >= 1 && d <= 12)
          : undefined,
      })
    : await getNationalIndex();

  const data = entries.map((e) => ({
    category: e.fee_category,
    display_name: getDisplayName(e.fee_category),
    family: getFeeFamily(e.fee_category),
    tier: getFeeTier(e.fee_category),
    median: e.median_amount,
    p25: e.p25_amount,
    p75: e.p75_amount,
    min: e.min_amount,
    max: e.max_amount,
    institution_count: e.institution_count,
    bank_count: e.bank_count,
    cu_count: e.cu_count,
    maturity: e.maturity_tier,
  }));

  if (format === "csv") {
    const headers =
      "category,display_name,family,tier,median,p25,p75,min,max,institution_count,bank_count,cu_count,maturity";
    const rows = data.map((d) =>
      [
        d.category,
        `"${d.display_name}"`,
        d.family,
        d.tier,
        d.median,
        d.p25,
        d.p75,
        d.min,
        d.max,
        d.institution_count,
        d.bank_count,
        d.cu_count,
        d.maturity,
      ].join(",")
    );
    const csv = [headers, ...rows].join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=fee-index.csv",
      },
    });
  }

  return NextResponse.json({
    scope: hasFilters ? "filtered" : "national",
    filters: {
      state: state ?? null,
      charter: charter ?? null,
      district: district ?? null,
    },
    total: data.length,
    data,
  });
}

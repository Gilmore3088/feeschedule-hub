import { NextRequest, NextResponse } from "next/server";
import { getFeeCategorySummaries, getFeeCategoryDetail } from "@/lib/crawler-db";
import { getDisplayName, getFeeFamily, getFeeTier } from "@/lib/fee-taxonomy";
import { getCurrentUser } from "@/lib/auth";
import { canExportData } from "@/lib/access";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const category = searchParams.get("category");
  const format = searchParams.get("format");

  // Single category detail
  if (category) {
    const detail = await getFeeCategoryDetail(category);
    if (!detail || detail.fees.length === 0) {
      return NextResponse.json(
        { error: "Category not found", category },
        { status: 404 }
      );
    }

    const response = {
      category,
      display_name: getDisplayName(category),
      family: getFeeFamily(category),
      tier: getFeeTier(category),
      summary: {
        institution_count: new Set(detail.fees.map((f) => f.crawl_target_id)).size,
        observation_count: detail.fees.length,
      },
      by_charter_type: detail.by_charter_type,
      by_asset_tier: detail.by_asset_tier,
      by_fed_district: detail.by_fed_district,
      by_state: detail.by_state,
    };

    return NextResponse.json(response);
  }

  // All categories summary
  const summaries = await getFeeCategorySummaries();

  const data = summaries.map((s) => ({
    category: s.fee_category,
    display_name: getDisplayName(s.fee_category),
    family: getFeeFamily(s.fee_category),
    tier: getFeeTier(s.fee_category),
    median: s.median_amount,
    p25: s.p25_amount,
    p75: s.p75_amount,
    min: s.min_amount,
    max: s.max_amount,
    institution_count: s.institution_count,
  }));

  if (format === "csv") {
    const user = await getCurrentUser();
    if (!canExportData(user)) {
      return NextResponse.json(
        { error: "CSV export requires a Seat License", upgrade_url: "/subscribe" },
        { status: 403 }
      );
    }
    const headers = "category,display_name,family,tier,median,p25,p75,min,max,institution_count";
    const rows = data.map((d) =>
      [d.category, `"${d.display_name}"`, d.family, d.tier, d.median, d.p25, d.p75, d.min, d.max, d.institution_count].join(",")
    );
    const csv = [headers, ...rows].join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=fee-insight.csv",
      },
    });
  }

  return NextResponse.json({
    total: data.length,
    data,
  });
}

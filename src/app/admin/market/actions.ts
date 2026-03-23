"use server";

import { requireAuth } from "@/lib/auth";
import {
  getNationalIndex,
  getPeerIndex,
  buildMarketIndex,
} from "@/lib/crawler-db";
import { getDisplayName, getFeeFamily } from "@/lib/fee-taxonomy";

export async function exportMarketCsv(
  filters: {
    charter_type?: string;
    asset_tiers?: string[];
    fed_districts?: number[];
  },
  approvedOnly: boolean
): Promise<string> {
  await requireAuth("view");

  const national = await getNationalIndex(approvedOnly);
  const hasFilters = !!(
    filters.charter_type ||
    (filters.asset_tiers && filters.asset_tiers.length > 0) ||
    (filters.fed_districts && filters.fed_districts.length > 0)
  );
  const segment = hasFilters ? await getPeerIndex(filters, approvedOnly) : null;
  const entries = buildMarketIndex(national, segment);

  const headers = [
    "Family",
    "Category",
    "Segment Median",
    "National Median",
    "Delta %",
    "P25",
    "P75",
    "Min",
    "Max",
    "Institutions",
    "Observations",
    "Maturity",
  ];

  const rows = entries.map((e) =>
    [
      getFeeFamily(e.fee_category) ?? "Other",
      getDisplayName(e.fee_category),
      e.median_amount?.toFixed(2) ?? "",
      e.national_median?.toFixed(2) ?? "",
      e.delta_pct?.toFixed(1) ?? "",
      e.p25_amount?.toFixed(2) ?? "",
      e.p75_amount?.toFixed(2) ?? "",
      e.min_amount?.toFixed(2) ?? "",
      e.max_amount?.toFixed(2) ?? "",
      e.institution_count,
      e.observation_count,
      e.maturity_tier,
    ].join(",")
  );

  return [headers.join(","), ...rows].join("\n");
}

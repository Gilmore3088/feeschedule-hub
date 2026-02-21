import type { Metadata } from "next";
import { requireActiveSubscription } from "@/lib/subscriber-auth";
import { getNationalIndex, getPeerIndex } from "@/lib/crawler-db/fee-index";
import { getDisplayName, getFeeFamily, getFeeTier } from "@/lib/fee-taxonomy";
import { formatAmount } from "@/lib/format";
import { getSubscriberPeerGroups } from "@/lib/subscriber-db";

export const metadata: Metadata = {
  title: "Peer Benchmarks",
  description: "Full 49-category peer benchmarking for your institution",
};

export default async function BenchmarksPage(props: {
  searchParams: Promise<{
    charter?: string;
    tiers?: string;
    districts?: string;
    group?: string;
  }>;
}) {
  const session = await requireActiveSubscription();
  const searchParams = await props.searchParams;
  const savedGroups = getSubscriberPeerGroups(session.organizationId);

  // Apply saved group if selected
  let filters: {
    charter_type?: string;
    asset_tiers?: string[];
    fed_districts?: number[];
  } = {};

  if (searchParams.group) {
    const group = savedGroups.find(
      (g) => g.id === Number(searchParams.group)
    );
    if (group) {
      filters = {
        charter_type: group.charter_types || undefined,
        asset_tiers: group.asset_tiers?.split(",") || undefined,
        fed_districts: group.districts?.split(",").map(Number).filter(Boolean) || undefined,
      };
    }
  } else {
    filters = {
      charter_type: searchParams.charter || undefined,
      asset_tiers: searchParams.tiers?.split(",") || undefined,
      fed_districts: searchParams.districts
        ?.split(",")
        .map(Number)
        .filter(Boolean) || undefined,
    };
  }

  const hasPeerFilters =
    filters.charter_type || filters.asset_tiers?.length || filters.fed_districts?.length;

  const index = hasPeerFilters ? getPeerIndex(filters) : getNationalIndex();
  const national = hasPeerFilters ? getNationalIndex() : null;

  // Build lookup for national medians
  const nationalMedians = new Map<string, number | null>();
  if (national) {
    for (const entry of national) {
      nationalMedians.set(entry.fee_category, entry.median_amount);
    }
  }

  // Group by family
  const byFamily = new Map<string, typeof index>();
  for (const entry of index) {
    const family = entry.fee_family || "Other";
    const arr = byFamily.get(family) || [];
    arr.push(entry);
    byFamily.set(family, arr);
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {hasPeerFilters ? "Peer Benchmarks" : "National Benchmarks"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            All 49 fee categories
            {hasPeerFilters && " — filtered by your peer selection"}
          </p>
        </div>
        <a
          href={`/api/v1/export/csv?${new URLSearchParams(
            Object.fromEntries(
              Object.entries({
                charter: filters.charter_type,
                tiers: filters.asset_tiers?.join(","),
                districts: filters.fed_districts?.join(","),
              }).filter((entry): entry is [string, string] => !!entry[1])
            )
          )}`}
          className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          Export CSV
        </a>
      </div>

      {/* Filters */}
      <div className="mt-6 flex flex-wrap gap-3">
        <select
          defaultValue={filters.charter_type || ""}
          className="rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-600"
          onChange={(e) => {
            const url = new URL(window.location.href);
            if (e.target.value) url.searchParams.set("charter", e.target.value);
            else url.searchParams.delete("charter");
            window.location.href = url.toString();
          }}
        >
          <option value="">All Charters</option>
          <option value="bank">Banks</option>
          <option value="credit_union">Credit Unions</option>
        </select>

        {savedGroups.length > 0 && (
          <select
            defaultValue={searchParams.group || ""}
            className="rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-600"
            onChange={(e) => {
              const url = new URL(window.location.href);
              if (e.target.value)
                url.searchParams.set("group", e.target.value);
              else url.searchParams.delete("group");
              window.location.href = url.toString();
            }}
          >
            <option value="">Saved Peer Groups</option>
            {savedGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Results by family */}
      {Array.from(byFamily).map(([family, entries]) => (
        <div key={family} className="mt-8">
          <h2 className="text-sm font-bold text-slate-800">{family}</h2>
          <div className="mt-2 overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50/80">
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Category
                  </th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Median
                  </th>
                  {hasPeerFilters && (
                    <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Nat&apos;l
                    </th>
                  )}
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    P25
                  </th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    P75
                  </th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Count
                  </th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Tier
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entries.map((entry) => {
                  const natMedian = nationalMedians.get(entry.fee_category);
                  const delta =
                    hasPeerFilters &&
                    entry.median_amount != null &&
                    natMedian != null &&
                    natMedian !== 0
                      ? ((entry.median_amount - natMedian) / natMedian) * 100
                      : null;

                  return (
                    <tr key={entry.fee_category} className="hover:bg-slate-50/50">
                      <td className="px-4 py-2.5">
                        <span className="font-medium text-slate-900">
                          {getDisplayName(entry.fee_category)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                        {entry.median_amount != null
                          ? formatAmount(entry.median_amount)
                          : "--"}
                      </td>
                      {hasPeerFilters && (
                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-400">
                          {natMedian != null ? formatAmount(natMedian) : "--"}
                          {delta != null && (
                            <span
                              className={`ml-1 text-[10px] ${
                                delta < 0
                                  ? "text-emerald-600"
                                  : delta > 0
                                    ? "text-red-500"
                                    : "text-slate-400"
                              }`}
                            >
                              {delta > 0 ? "+" : ""}
                              {delta.toFixed(1)}%
                            </span>
                          )}
                        </td>
                      )}
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
                        {entry.p25_amount != null
                          ? formatAmount(entry.p25_amount)
                          : "--"}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
                        {entry.p75_amount != null
                          ? formatAmount(entry.p75_amount)
                          : "--"}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-400">
                        {entry.institution_count}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="text-[10px] uppercase tracking-wider text-slate-300">
                          {getFeeTier(entry.fee_category)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

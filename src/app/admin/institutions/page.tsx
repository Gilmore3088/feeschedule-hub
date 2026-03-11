import Link from "next/link";
import { Suspense } from "react";
import { requireAuth } from "@/lib/auth";
import { getAllInstitutions, getDistinctStates } from "@/lib/crawler-db";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { Pagination } from "@/components/pagination";
import { SortableHeader } from "@/components/sortable-header";
import { formatAssets } from "@/lib/format";

const PAGE_SIZE = 100;

const TIER_LABELS: Record<string, string> = {
  community_small: "Community (Small)",
  community_mid: "Community (Mid)",
  community_large: "Community (Large)",
  regional: "Regional",
  large_regional: "Large Regional",
  super_regional: "Super Regional",
};

const DISTRICT_LABELS: Record<string, string> = {
  "1": "1 - Boston",
  "2": "2 - New York",
  "3": "3 - Philadelphia",
  "4": "4 - Cleveland",
  "5": "5 - Richmond",
  "6": "6 - Atlanta",
  "7": "7 - Chicago",
  "8": "8 - St. Louis",
  "9": "9 - Minneapolis",
  "10": "10 - Kansas City",
  "11": "11 - Dallas",
  "12": "12 - San Francisco",
};

export default async function InstitutionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    q?: string;
    filter?: string;
    state?: string;
    district?: string;
    tier?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  await requireAuth("view");

  const params = await searchParams;
  const currentPage = Math.max(1, parseInt(params.page || "1", 10) || 1);
  const search = params.q || "";
  const filter = (params.filter || "all") as "all" | "with_fees" | "no_fees";
  const state = params.state || "";
  const district = params.district || "";
  const tier = params.tier || "";
  const sort = params.sort || "assets";
  const dir = (params.dir || "desc") as "asc" | "desc";

  const [{ institutions, total }, states] = await Promise.all([
    Promise.resolve(getAllInstitutions({
      limit: PAGE_SIZE,
      offset: (currentPage - 1) * PAGE_SIZE,
      search: search || undefined,
      filter,
      state: state || undefined,
      district: district || undefined,
      tier: tier || undefined,
      sort,
      dir,
    })),
    Promise.resolve(getDistinctStates()),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Build filter params for pagination links
  const filterParams: Record<string, string> = {};
  if (search) filterParams.q = search;
  if (filter !== "all") filterParams.filter = filter;
  if (state) filterParams.state = state;
  if (district) filterParams.district = district;
  if (tier) filterParams.tier = tier;
  if (sort !== "assets") filterParams.sort = sort;
  if (dir !== "desc") filterParams.dir = dir;

  return (
    <div className="admin-content space-y-4">
      <Breadcrumbs items={[{ label: "Admin", href: "/admin" }, { label: "Institutions" }]} />
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          Institutions
        </h1>
        <span className="text-sm text-gray-400 tabular-nums">{total.toLocaleString()} results</span>
      </div>

      {/* Filters */}
      <form className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Search</label>
          <input
            type="text"
            name="q"
            defaultValue={search}
            placeholder="Name or state code..."
            className="w-full rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10 dark:border-white/10 dark:bg-white/5 dark:text-gray-100 dark:placeholder:text-gray-500"
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">State</label>
          <select
            name="state"
            defaultValue={state}
            className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-300"
          >
            <option value="">All States</option>
            {states.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">District</label>
          <select
            name="district"
            defaultValue={district}
            className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-300"
          >
            <option value="">All Districts</option>
            {Object.entries(DISTRICT_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Asset Tier</label>
          <select
            name="tier"
            defaultValue={tier}
            className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-300"
          >
            <option value="">All Tiers</option>
            {Object.entries(TIER_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Fees</label>
          <select
            name="filter"
            defaultValue={filter}
            className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-300"
          >
            <option value="all">All</option>
            <option value="with_fees">With Fees</option>
            <option value="no_fees">No Fees</option>
          </select>
        </div>
        <button
          type="submit"
          className="rounded-md bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
        >
          Apply
        </button>
        {(search || state || district || tier || filter !== "all") && (
          <a
            href="/admin/institutions"
            className="rounded-md px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-white/5"
          >
            Clear
          </a>
        )}
      </form>

      {/* Table */}
      <Suspense>
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50/80 dark:bg-white/[0.04]">
                <SortableHeader column="name" label="Institution" />
                <SortableHeader column="state" label="State" />
                <SortableHeader column="type" label="Type" />
                <SortableHeader column="district" label="District" />
                <SortableHeader column="assets" label="Assets" className="text-right" />
                <SortableHeader column="fees" label="Fees" className="text-right" />
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Fee URL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/[0.06]">
              {institutions.map((inst) => (
                <tr key={inst.id} className="hover:bg-gray-50/50 transition-colors dark:hover:bg-white/[0.03]">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/admin/fees?id=${inst.id}`}
                      className="text-gray-900 hover:text-blue-600 transition-colors dark:text-gray-100 dark:hover:text-blue-400"
                    >
                      {inst.institution_name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400">{inst.state_code || "-"}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      inst.charter_type === "bank"
                        ? "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                        : "bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400"
                    }`}>
                      {inst.charter_type === "bank" ? "Bank" : "CU"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 tabular-nums dark:text-gray-400">
                    {inst.fed_district || "-"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-500 dark:text-gray-400">
                    {inst.asset_size ? formatAssets(inst.asset_size) : "-"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {inst.fee_count > 0 ? (
                      <Link
                        href={`/admin/fees?id=${inst.id}`}
                        className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                      >
                        {inst.fee_count}
                      </Link>
                    ) : (
                      <span className="text-gray-300 dark:text-gray-600">0</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 max-w-[180px] truncate text-xs text-gray-400">
                    {inst.fee_schedule_url ? (
                      <a
                        href={inst.fee_schedule_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-blue-600 dark:hover:text-blue-400"
                        title={inst.fee_schedule_url}
                      >
                        {inst.document_type === "pdf" ? "PDF" : "HTML"}
                      </a>
                    ) : (
                      <span className="text-gray-300 dark:text-gray-600">-</span>
                    )}
                  </td>
                </tr>
              ))}
              {institutions.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    No institutions found matching your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Suspense>

      <Pagination
        basePath="/admin/institutions"
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={total}
        pageSize={PAGE_SIZE}
        params={filterParams}
      />
    </div>
  );
}

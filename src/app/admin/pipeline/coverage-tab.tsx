import Link from "next/link";
import { CoverageTable, StateFilter } from "./coverage-table";
import { Pagination } from "@/components/pagination";
import { DiscoveryStats } from "./discovery-stats";
import type { CoverageGap, PipelineStats } from "@/lib/crawler-db/pipeline";

const STATUS_FILTERS = [
  { value: "", label: "All Gaps" },
  { value: "no_url", label: "No URL" },
  { value: "no_fees", label: "No Fees" },
  { value: "failing", label: "Failing" },
  { value: "stale", label: "Stale" },
] as const;

interface CoverageTabProps {
  institutions: CoverageGap[];
  total: number;
  totalPages: number;
  currentPage: number;
  activeStatus: string;
  activeCharter: string;
  activeState: string;
  searchQuery: string;
  sortColumn: string;
  sortDir: string;
  states: string[];
  tierCoverage?: { tier: string; total: number; with_fees: number; pct: number }[];
  districtCoverage?: { district: number; total: number; with_fees: number; pct: number }[];
}

function filterUrl(
  activeStatus: string, activeCharter: string, activeState: string,
  searchQuery: string, sortColumn: string, sortDir: string,
  overrides: Record<string, string>,
) {
  const p = new URLSearchParams();
  p.set("tab", "coverage");
  const merged = { status: activeStatus, charter: activeCharter, state: activeState, q: searchQuery, sort: sortColumn, dir: sortDir, ...overrides };
  for (const [k, v] of Object.entries(merged)) {
    if (v) p.set(k, v);
  }
  return `/admin/pipeline?${p.toString()}`;
}

export function CoverageTab({
  institutions, total, totalPages, currentPage,
  activeStatus, activeCharter, activeState, searchQuery,
  sortColumn, sortDir, states,
  tierCoverage, districtCoverage,
}: CoverageTabProps) {
  const url = (overrides: Record<string, string>) =>
    filterUrl(activeStatus, activeCharter, activeState, searchQuery, sortColumn, sortDir, overrides);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="admin-card overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-white/5 flex flex-wrap items-center gap-2">
          <div className="flex gap-0.5 rounded-lg bg-gray-100 dark:bg-white/[0.06] p-0.5">
            {STATUS_FILTERS.map((f) => (
              <Link
                key={f.value}
                href={url({ status: f.value, page: "" })}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  activeStatus === f.value
                    ? "bg-white text-gray-900 shadow-sm dark:bg-white/10 dark:text-gray-100"
                    : "text-gray-500 hover:text-gray-700 dark:text-gray-400"
                }`}
              >
                {f.label}
              </Link>
            ))}
          </div>

          <div className="flex gap-0.5">
            {[
              { value: "", label: "All" },
              { value: "bank", label: "Banks" },
              { value: "credit_union", label: "CUs" },
            ].map((f) => (
              <Link
                key={f.value}
                href={url({ charter: f.value, page: "" })}
                className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  activeCharter === f.value
                    ? "bg-gray-900 text-white dark:bg-white/10 dark:text-gray-100"
                    : "text-gray-500 hover:text-gray-700 border border-gray-200 dark:border-white/10 dark:text-gray-400"
                }`}
              >
                {f.label}
              </Link>
            ))}
          </div>

          <StateFilter
            states={states}
            activeState={activeState}
            activeStatus={activeStatus}
            activeCharter={activeCharter}
            searchQuery={searchQuery}
          />

          <form action="/admin/pipeline" method="get" className="flex items-center gap-1">
            <input type="hidden" name="tab" value="coverage" />
            {activeStatus && <input type="hidden" name="status" value={activeStatus} />}
            {activeCharter && <input type="hidden" name="charter" value={activeCharter} />}
            {activeState && <input type="hidden" name="state" value={activeState} />}
            <input
              type="text"
              name="q"
              defaultValue={searchQuery}
              placeholder="Search..."
              className="rounded border border-gray-200 px-2.5 py-1 text-[11px] w-40
                         dark:border-white/10 dark:bg-[oklch(0.18_0_0)] dark:text-gray-200
                         focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
            />
          </form>

          <span className="text-[11px] text-gray-400 ml-auto tabular-nums">{total.toLocaleString()} institutions</span>
        </div>

        <CoverageTable institutions={institutions} total={total} sortColumn={sortColumn} sortDir={sortDir} />

        <div className="px-4 pb-3">
          <Pagination
            basePath="/admin/pipeline"
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={total}
            pageSize={50}
            params={{
              tab: "coverage",
              ...(activeStatus ? { status: activeStatus } : {}),
              ...(activeCharter ? { charter: activeCharter } : {}),
              ...(activeState ? { state: activeState } : {}),
              ...(searchQuery ? { q: searchQuery } : {}),
              sort: sortColumn,
              dir: sortDir,
            }}
          />
        </div>
      </div>

      {/* Discovery Quality */}
      <DiscoveryStats />

      {/* Tier Coverage */}
      {tierCoverage && tierCoverage.length > 0 && (
        <details className="admin-card overflow-hidden">
          <summary className="px-4 py-3 cursor-pointer text-[11px] font-bold text-gray-500 uppercase tracking-wider hover:bg-gray-50/50 dark:hover:bg-white/[0.02]">
            Coverage by Asset Tier
          </summary>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="bg-gray-50/80 dark:bg-white/[0.03]">
                <th className="text-left px-4 py-2 font-semibold text-gray-400 uppercase tracking-wider">Tier</th>
                <th className="text-right px-4 py-2 font-semibold text-gray-400 uppercase tracking-wider">Total</th>
                <th className="text-right px-4 py-2 font-semibold text-gray-400 uppercase tracking-wider">With Fees</th>
                <th className="text-right px-4 py-2 font-semibold text-gray-400 uppercase tracking-wider">Coverage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/5">
              {tierCoverage.map((row) => (
                <tr key={row.tier} className="hover:bg-gray-50/50 dark:hover:bg-white/[0.02]">
                  <td className="px-4 py-2 text-gray-700 dark:text-gray-300 capitalize">{row.tier.replace(/_/g, " ")}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-600 dark:text-gray-400">{row.total.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-600 dark:text-gray-400">{row.with_fees.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right">
                    <span className={`tabular-nums font-medium ${row.pct >= 30 ? "text-emerald-600" : row.pct >= 15 ? "text-amber-600" : "text-red-600"}`}>
                      {row.pct}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      {/* District Coverage */}
      {districtCoverage && districtCoverage.length > 0 && (
        <details className="admin-card overflow-hidden">
          <summary className="px-4 py-3 cursor-pointer text-[11px] font-bold text-gray-500 uppercase tracking-wider hover:bg-gray-50/50 dark:hover:bg-white/[0.02]">
            Coverage by Fed District
          </summary>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="bg-gray-50/80 dark:bg-white/[0.03]">
                <th className="text-left px-4 py-2 font-semibold text-gray-400 uppercase tracking-wider">District</th>
                <th className="text-right px-4 py-2 font-semibold text-gray-400 uppercase tracking-wider">Total</th>
                <th className="text-right px-4 py-2 font-semibold text-gray-400 uppercase tracking-wider">With Fees</th>
                <th className="text-right px-4 py-2 font-semibold text-gray-400 uppercase tracking-wider">Coverage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/5">
              {districtCoverage.map((row) => (
                <tr key={row.district} className="hover:bg-gray-50/50 dark:hover:bg-white/[0.02]">
                  <td className="px-4 py-2 text-gray-700 dark:text-gray-300">District {row.district}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-600 dark:text-gray-400">{row.total.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-600 dark:text-gray-400">{row.with_fees.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right">
                    <span className={`tabular-nums font-medium ${row.pct >= 30 ? "text-emerald-600" : row.pct >= 15 ? "text-amber-600" : "text-red-600"}`}>
                      {row.pct}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}

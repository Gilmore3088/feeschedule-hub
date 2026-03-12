import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { Breadcrumbs } from "@/components/breadcrumbs";
import {
  getCoverageFunnel,
  getTopUncategorized,
  getStaleInstitutions,
  getRecentCrawlRuns,
  getDiscoveryMethodStats,
  getFailureReasons,
  getTierCoverage,
  getDistrictCoverage,
  getRevenueDiscrepancies,
} from "@/lib/crawler-db";
import { DISTRICT_NAMES, TIER_LABELS } from "@/lib/fed-districts";

export default async function QualityPage() {
  await requireAuth();

  const funnel = getCoverageFunnel();
  const uncategorized = getTopUncategorized(20);
  const stale = getStaleInstitutions(90, 15);
  const crawlRuns = getRecentCrawlRuns(10);
  const discoveryStats = getDiscoveryMethodStats();
  const failureReasons = getFailureReasons(10);
  const tierCoverage = getTierCoverage();
  const districtCoverage = getDistrictCoverage();
  const revenueDiscrepancies = getRevenueDiscrepancies(15);

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Admin", href: "/admin" },
          { label: "Data Quality" },
        ]}
      />

      <div>
        <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          Data Quality Dashboard
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Coverage funnel, categorization gaps, and crawl health metrics
        </p>
      </div>

      {/* Coverage Funnel */}
      <div className="admin-card p-5">
        <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-4">Coverage Funnel</h2>
        <div className="space-y-3">
          <FunnelBar
            label="Total Institutions"
            value={funnel.total_institutions}
            max={funnel.total_institutions}
            color="bg-gray-300"
          />
          <FunnelBar
            label="With Website URL"
            value={funnel.with_website}
            max={funnel.total_institutions}
            color="bg-blue-400"
          />
          <FunnelBar
            label="With Fee Schedule URL"
            value={funnel.with_fee_url}
            max={funnel.total_institutions}
            color="bg-amber-400"
          />
          <FunnelBar
            label="With Extracted Fees"
            value={funnel.with_fees}
            max={funnel.total_institutions}
            color="bg-emerald-400"
          />
          <FunnelBar
            label="With Approved Fees"
            value={funnel.with_approved}
            max={funnel.total_institutions}
            color="bg-emerald-600"
          />
        </div>
      </div>

      {/* Row 2: Tier + District coverage — CLICKABLE */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Tier Coverage */}
        <div className="admin-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200">Coverage by Asset Tier</h2>
            <span className="text-[10px] text-gray-400">Click row to explore</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50/80 dark:bg-white/[0.03]">
                <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-left">Tier</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">Total</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">With Fees</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">Gaps</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">Coverage</th>
                <th className="px-3 py-2 w-5"></th>
              </tr>
            </thead>
            <tbody>
              {tierCoverage.map((t) => {
                const gaps = t.total - t.with_fees;
                return (
                  <tr key={t.asset_size_tier} className="border-b last:border-0 group">
                    <td className="px-3 py-2" colSpan={6}>
                      <Link
                        href={`/admin/peers/explore?tier=${t.asset_size_tier}`}
                        className="flex items-center -mx-3 -my-2 px-3 py-2 rounded hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors"
                      >
                        <span className="flex-1 text-gray-700 dark:text-gray-300 font-medium">
                          {TIER_LABELS[t.asset_size_tier] ?? t.asset_size_tier}
                        </span>
                        <span className="w-16 text-right tabular-nums text-gray-600 dark:text-gray-400">{t.total.toLocaleString()}</span>
                        <span className="w-16 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{t.with_fees.toLocaleString()}</span>
                        <span className="w-16 text-right tabular-nums text-red-500 dark:text-red-400 font-medium">{gaps > 0 ? gaps.toLocaleString() : "-"}</span>
                        <span className="w-20 text-right">
                          <CoverageBadge pct={t.coverage_pct} />
                        </span>
                        <span className="w-5 text-right">
                          <svg className="w-3 h-3 text-gray-300 group-hover:text-blue-500 transition-colors inline-block" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </span>
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* District Coverage */}
        <div className="admin-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200">Coverage by Fed District</h2>
            <span className="text-[10px] text-gray-400">Click row to explore</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50/80 dark:bg-white/[0.03]">
                <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-left">District</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">Total</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">With Fees</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">Gaps</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">Coverage</th>
                <th className="px-3 py-2 w-5"></th>
              </tr>
            </thead>
            <tbody>
              {districtCoverage.map((d) => {
                const gaps = d.total - d.with_fees;
                return (
                  <tr key={d.fed_district} className="border-b last:border-0 group">
                    <td className="px-3 py-2" colSpan={6}>
                      <Link
                        href={`/admin/peers/explore?district=${d.fed_district}`}
                        className="flex items-center -mx-3 -my-2 px-3 py-2 rounded hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors"
                      >
                        <span className="flex-1 text-gray-700 dark:text-gray-300 font-medium">
                          {d.fed_district} - {DISTRICT_NAMES[d.fed_district] ?? "Unknown"}
                        </span>
                        <span className="w-16 text-right tabular-nums text-gray-600 dark:text-gray-400">{d.total.toLocaleString()}</span>
                        <span className="w-16 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{d.with_fees.toLocaleString()}</span>
                        <span className="w-16 text-right tabular-nums text-red-500 dark:text-red-400 font-medium">{gaps > 0 ? gaps.toLocaleString() : "-"}</span>
                        <span className="w-20 text-right">
                          <CoverageBadge pct={d.coverage_pct} />
                        </span>
                        <span className="w-5 text-right">
                          <svg className="w-3 h-3 text-gray-300 group-hover:text-blue-500 transition-colors inline-block" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </span>
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Row 3: Discovery method stats + Failure reasons */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Discovery Methods */}
        <div className="admin-card p-5">
          <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-3">Discovery Method Effectiveness</h2>
          {discoveryStats.length === 0 ? (
            <p className="text-sm text-gray-400">No discovery data yet</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50/80 dark:bg-white/[0.03]">
                  <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-left">Method</th>
                  <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">Attempts</th>
                  <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">Found</th>
                  <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">Rate</th>
                </tr>
              </thead>
              <tbody>
                {discoveryStats.map((s) => (
                  <tr key={s.discovery_method} className="border-b last:border-0 hover:bg-gray-50/50 transition-colors">
                    <td className="px-3 py-2 text-gray-700 dark:text-gray-300 font-medium">{s.discovery_method}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.total_attempts.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.found_count.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">
                      <CoverageBadge pct={s.success_rate} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Failure Reasons */}
        <div className="admin-card p-5">
          <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-3">Top Failure Reasons</h2>
          {failureReasons.length === 0 ? (
            <p className="text-sm text-gray-400">No failure data yet</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50/80 dark:bg-white/[0.03]">
                  <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-left">Reason</th>
                  <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">Count</th>
                </tr>
              </thead>
              <tbody>
                {failureReasons.map((r) => (
                  <tr key={r.failure_reason} className="border-b last:border-0 hover:bg-gray-50/50 transition-colors">
                    <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{r.failure_reason.replace(/_/g, " ")}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.count.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Revenue Cross-Validation */}
      <div className="admin-card p-5">
        <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-1">Revenue Cross-Validation</h2>
        <p className="text-[11px] text-gray-400 mb-3">
          Institutions where extracted fees diverge significantly from Call Report service charge income (ratio &gt;10x or &lt;0.1x)
        </p>
        {revenueDiscrepancies.length === 0 ? (
          <p className="text-sm text-gray-400">No discrepancies found (or no Call Report data ingested)</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50/80 dark:bg-white/[0.03]">
                  <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-left">Institution</th>
                  <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">Call Report ($K)</th>
                  <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">Extracted (Ann.)</th>
                  <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">Ratio</th>
                  <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">Fees</th>
                  <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-left">Signal</th>
                </tr>
              </thead>
              <tbody>
                {revenueDiscrepancies.map((d) => {
                  const signal = d.ratio > 10 ? "Likely incomplete" : "Possible over-extraction";
                  const signalColor = d.ratio > 10 ? "text-amber-600" : "text-blue-600";
                  return (
                    <tr key={d.id} className="border-b last:border-0 hover:bg-gray-50/50 transition-colors">
                      <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                        {d.institution_name.substring(0, 35)}
                        {d.state_code && <span className="text-gray-400 ml-1">({d.state_code})</span>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">${d.service_charge_income.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right tabular-nums">${Math.round(d.extracted_fee_total).toLocaleString()}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">
                        {d.ratio >= 999 ? "N/A" : `${d.ratio.toFixed(1)}x`}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{d.fee_count}</td>
                      <td className={`px-3 py-2 text-xs font-medium ${signalColor}`}>{signal}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Row 4: Uncategorized fees + Stale institutions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Uncategorized Fees */}
        <div className="admin-card p-5">
          <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-3">Top Uncategorized Fee Names</h2>
          {uncategorized.length === 0 ? (
            <p className="text-sm text-gray-400">All fees are categorized</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50/80 dark:bg-white/[0.03]">
                  <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-left">Fee Name</th>
                  <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">Count</th>
                </tr>
              </thead>
              <tbody>
                {uncategorized.map((u) => (
                  <tr key={u.fee_name} className="border-b last:border-0 hover:bg-gray-50/50 transition-colors">
                    <td className="px-3 py-2 text-gray-700 dark:text-gray-300 font-mono text-xs">{u.fee_name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{u.count.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Stale Institutions */}
        <div className="admin-card p-5">
          <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-3">Stale Data (90+ Days)</h2>
          {stale.length === 0 ? (
            <p className="text-sm text-gray-400">No stale institutions</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50/80 dark:bg-white/[0.03]">
                  <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-left">Institution</th>
                  <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">Days Stale</th>
                </tr>
              </thead>
              <tbody>
                {stale.map((s) => (
                  <tr key={s.id} className="border-b last:border-0 hover:bg-gray-50/50 transition-colors">
                    <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                      {s.institution_name.substring(0, 40)}
                      {s.state_code && <span className="text-gray-400 ml-1">({s.state_code})</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-amber-600 font-medium">{s.days_stale}d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Row 5: Recent Crawl Runs */}
      <div className="admin-card p-5">
        <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-3">Recent Crawl Runs</h2>
        {crawlRuns.length === 0 ? (
          <p className="text-sm text-gray-400">No crawl runs yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50/80 dark:bg-white/[0.03]">
                  <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-left">Run</th>
                  <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-left">Date</th>
                  <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">Crawled</th>
                  <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">Success</th>
                  <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">Failed</th>
                  <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">Unchanged</th>
                  <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">Fees</th>
                  <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">Rate</th>
                </tr>
              </thead>
              <tbody>
                {crawlRuns.map((r) => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-gray-50/50 transition-colors">
                    <td className="px-3 py-2 text-gray-500">#{r.id}</td>
                    <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{r.started_at?.substring(0, 16)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.targets_crawled.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-600">{r.targets_succeeded.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-red-500">{r.targets_failed.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-400">{r.targets_unchanged.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{r.fees_extracted.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">
                      <CoverageBadge pct={r.success_rate} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function FunnelBar({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-700 dark:text-gray-300">{label}</span>
        <span className="tabular-nums text-gray-900 dark:text-gray-100 font-medium">
          {value.toLocaleString()}
          <span className="text-gray-400 ml-1">({pct.toFixed(1)}%)</span>
        </span>
      </div>
      <div className="h-5 bg-gray-100 dark:bg-white/[0.06] rounded-sm overflow-hidden">
        <div
          className={`h-full ${color} rounded-sm transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function CoverageBadge({ pct }: { pct: number }) {
  const color =
    pct >= 50
      ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
      : pct >= 20
        ? "bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
        : "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400";
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-semibold tabular-nums ${color}`}>
      {pct.toFixed(1)}%
    </span>
  );
}

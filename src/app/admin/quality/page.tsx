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
} from "@/lib/crawler-db";
import { DISTRICT_NAMES } from "@/lib/fed-districts";

const TIER_LABELS: Record<string, string> = {
  super_regional: "Super Regional ($50B+)",
  large_regional: "Large Regional ($10-50B)",
  regional: "Regional ($1-10B)",
  community_large: "Community Large ($500M-1B)",
  community_mid: "Community Mid ($100-500M)",
  community_small: "Community Small (<$100M)",
  unknown: "Unknown",
};

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

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Admin", href: "/admin" },
          { label: "Data Quality" },
        ]}
      />

      <div>
        <h1 className="text-xl font-bold tracking-tight text-gray-900">
          Data Quality Dashboard
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Coverage funnel, categorization gaps, and crawl health metrics
        </p>
      </div>

      {/* Coverage Funnel */}
      <div className="admin-card p-5">
        <h2 className="text-sm font-bold text-gray-800 mb-4">Coverage Funnel</h2>
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

      {/* Row 2: Tier + District coverage */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Tier Coverage */}
        <div className="admin-card p-5">
          <h2 className="text-sm font-bold text-gray-800 mb-3">Coverage by Asset Tier</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50/80">
                <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-left">Tier</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">Total</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">With Fees</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">Coverage</th>
              </tr>
            </thead>
            <tbody>
              {tierCoverage.map((t) => (
                <tr key={t.asset_size_tier} className="border-b last:border-0 hover:bg-gray-50/50 transition-colors">
                  <td className="px-3 py-2 text-gray-700">{TIER_LABELS[t.asset_size_tier] ?? t.asset_size_tier}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{t.total.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{t.with_fees.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">
                    <CoverageBadge pct={t.coverage_pct} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* District Coverage */}
        <div className="admin-card p-5">
          <h2 className="text-sm font-bold text-gray-800 mb-3">Coverage by Fed District</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50/80">
                <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-left">District</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">Total</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">With Fees</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">Coverage</th>
              </tr>
            </thead>
            <tbody>
              {districtCoverage.map((d) => (
                <tr key={d.fed_district} className="border-b last:border-0 hover:bg-gray-50/50 transition-colors">
                  <td className="px-3 py-2 text-gray-700">
                    {d.fed_district} - {DISTRICT_NAMES[d.fed_district] ?? "Unknown"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{d.total.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{d.with_fees.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">
                    <CoverageBadge pct={d.coverage_pct} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Row 3: Discovery method stats + Failure reasons */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Discovery Methods */}
        <div className="admin-card p-5">
          <h2 className="text-sm font-bold text-gray-800 mb-3">Discovery Method Effectiveness</h2>
          {discoveryStats.length === 0 ? (
            <p className="text-sm text-gray-400">No discovery data yet</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50/80">
                  <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-left">Method</th>
                  <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">Attempts</th>
                  <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">Found</th>
                  <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">Rate</th>
                </tr>
              </thead>
              <tbody>
                {discoveryStats.map((s) => (
                  <tr key={s.discovery_method} className="border-b last:border-0 hover:bg-gray-50/50 transition-colors">
                    <td className="px-3 py-2 text-gray-700 font-medium">{s.discovery_method}</td>
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
          <h2 className="text-sm font-bold text-gray-800 mb-3">Top Failure Reasons</h2>
          {failureReasons.length === 0 ? (
            <p className="text-sm text-gray-400">No failure data yet</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50/80">
                  <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-left">Reason</th>
                  <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">Count</th>
                </tr>
              </thead>
              <tbody>
                {failureReasons.map((r) => (
                  <tr key={r.failure_reason} className="border-b last:border-0 hover:bg-gray-50/50 transition-colors">
                    <td className="px-3 py-2 text-gray-700">{r.failure_reason.replace(/_/g, " ")}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.count.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Row 4: Uncategorized fees + Stale institutions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Uncategorized Fees */}
        <div className="admin-card p-5">
          <h2 className="text-sm font-bold text-gray-800 mb-3">Top Uncategorized Fee Names</h2>
          {uncategorized.length === 0 ? (
            <p className="text-sm text-gray-400">All fees are categorized</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50/80">
                  <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-left">Fee Name</th>
                  <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">Count</th>
                </tr>
              </thead>
              <tbody>
                {uncategorized.map((u) => (
                  <tr key={u.fee_name} className="border-b last:border-0 hover:bg-gray-50/50 transition-colors">
                    <td className="px-3 py-2 text-gray-700 font-mono text-xs">{u.fee_name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{u.count.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Stale Institutions */}
        <div className="admin-card p-5">
          <h2 className="text-sm font-bold text-gray-800 mb-3">Stale Data (90+ Days)</h2>
          {stale.length === 0 ? (
            <p className="text-sm text-gray-400">No stale institutions</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50/80">
                  <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-left">Institution</th>
                  <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">Days Stale</th>
                </tr>
              </thead>
              <tbody>
                {stale.map((s) => (
                  <tr key={s.id} className="border-b last:border-0 hover:bg-gray-50/50 transition-colors">
                    <td className="px-3 py-2 text-gray-700">
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
        <h2 className="text-sm font-bold text-gray-800 mb-3">Recent Crawl Runs</h2>
        {crawlRuns.length === 0 ? (
          <p className="text-sm text-gray-400">No crawl runs yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50/80">
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
                    <td className="px-3 py-2 text-gray-700">{r.started_at?.substring(0, 16)}</td>
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
        <span className="text-gray-700">{label}</span>
        <span className="tabular-nums text-gray-900 font-medium">
          {value.toLocaleString()}
          <span className="text-gray-400 ml-1">({pct.toFixed(1)}%)</span>
        </span>
      </div>
      <div className="h-5 bg-gray-100 rounded-sm overflow-hidden">
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
      ? "bg-emerald-50 text-emerald-600"
      : pct >= 20
        ? "bg-amber-50 text-amber-600"
        : "bg-red-50 text-red-600";
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-semibold tabular-nums ${color}`}>
      {pct.toFixed(1)}%
    </span>
  );
}

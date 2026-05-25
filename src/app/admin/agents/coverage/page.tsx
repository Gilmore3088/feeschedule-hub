/**
 * /admin/agents/coverage — per-state coverage scorecard.
 *
 * Surfaces the Q-02 query from src/lib/crawler-db/coverage.ts. Each row
 * shows total institutions, % with a discovered fee URL, and % with a
 * recent (last 60d) live published fee. The latter is the real coverage
 * number — institutions without a recent publish are "the holes."
 */

import { requireAuth } from "@/lib/auth";
import {
  getCoverageByState,
  getCoverageSummary,
  type CoverageByStateRow,
  type CoverageSummary,
} from "@/lib/crawler-db/coverage";

export const dynamic = "force-dynamic";

function pctBadge(pct: number, threshold: number = 50): string {
  if (pct >= 90) return "bg-emerald-50 text-emerald-700";
  if (pct >= threshold) return "bg-amber-50 text-amber-700";
  return "bg-red-50 text-red-700";
}

function pctLabel(pct: number): string {
  return `${pct.toFixed(1)}%`;
}

function SummaryCard({ summary }: { summary: CoverageSummary }) {
  const tiles = [
    { label: "States tracked", value: summary.total_states.toString() },
    {
      label: "Full coverage (URL + recent publish ≥ 90%)",
      value: `${summary.states_with_full_coverage}/${summary.total_states}`,
    },
    {
      label: "URL gaps (URL coverage < 50%)",
      value: summary.states_with_url_gap.toString(),
    },
    {
      label: "Publish gaps (URL OK, publish < 50%)",
      value: summary.states_with_publish_gap.toString(),
    },
    { label: "Median URL %", value: pctLabel(summary.median_url_pct) },
    {
      label: "Median publish %",
      value: pctLabel(summary.median_publish_pct),
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {tiles.map((t) => (
        <div
          key={t.label}
          className="rounded-lg border border-stone-200 bg-white p-4"
        >
          <div className="text-[10px] uppercase tracking-wider text-stone-500">
            {t.label}
          </div>
          <div className="mt-1 text-xl font-semibold text-stone-900 tabular-nums">
            {t.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function CoverageTable({ rows }: { rows: CoverageByStateRow[] }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-stone-50 text-stone-600 text-[11px] uppercase tracking-wider">
          <tr>
            <th className="px-3 py-2 text-left">State</th>
            <th className="px-3 py-2 text-right">Institutions</th>
            <th className="px-3 py-2 text-right">With fee URL</th>
            <th className="px-3 py-2 text-right">URL %</th>
            <th className="px-3 py-2 text-right">With recent publish</th>
            <th className="px-3 py-2 text-right">Publish %</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={6}
                className="px-3 py-8 text-center text-stone-500 italic"
              >
                No state data — seed crawl_targets to populate.
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.state_code} className="border-t border-stone-100">
                <td className="px-3 py-2 font-mono text-stone-700">
                  {r.state_code}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.total_institutions.toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.with_fee_url.toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right">
                  <span
                    className={`inline-block rounded px-2 py-0.5 text-[11px] font-semibold tabular-nums ${pctBadge(
                      r.url_pct,
                    )}`}
                  >
                    {pctLabel(r.url_pct)}
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.with_recent_publish.toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right">
                  <span
                    className={`inline-block rounded px-2 py-0.5 text-[11px] font-semibold tabular-nums ${pctBadge(
                      r.publish_pct,
                    )}`}
                  >
                    {pctLabel(r.publish_pct)}
                  </span>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default async function CoveragePage() {
  await requireAuth("view");

  let rows: CoverageByStateRow[] = [];
  let summary: CoverageSummary = {
    total_states: 0,
    states_with_full_coverage: 0,
    states_with_url_gap: 0,
    states_with_publish_gap: 0,
    median_url_pct: 0,
    median_publish_pct: 0,
  };

  try {
    [rows, summary] = await Promise.all([
      getCoverageByState(),
      getCoverageSummary(),
    ]);
  } catch (e) {
    console.error("CoveragePage load failed", e);
  }

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold text-stone-900">
          Coverage by State
        </h1>
        <p className="text-sm text-stone-600 mt-1">
          Per-jurisdiction view of institution seed, URL discovery, and
          recent publish coverage. &quot;Recent publish&quot; = at least one
          live <code>fees_published</code> row in the last 60 days.
        </p>
      </header>

      <SummaryCard summary={summary} />

      <CoverageTable rows={rows} />
    </section>
  );
}

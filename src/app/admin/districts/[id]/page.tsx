export const dynamic = "force-dynamic";
import { Suspense } from "react";
import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import {
  getLatestBeigeBook,
  getBeigeBookEditions,
  getDistrictContent,
  getDistrictIndicators,
  getDistrictMetrics,
} from "@/lib/crawler-db";
import { getDistrictEconomicSummary, getBeigeBookThemes } from "@/lib/crawler-db/fed";
import { getDistrictFeeRevenue } from "@/lib/crawler-db/call-reports";
import { getDistrictComplaintSummary } from "@/lib/crawler-db/complaints";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { DISTRICT_NAMES } from "@/lib/fed-districts";
import { timeAgo, formatAmount } from "@/lib/format";

export default async function DistrictDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAuth("view");
  const { id } = await params;
  const districtId = parseInt(id, 10);

  if (isNaN(districtId) || districtId < 1 || districtId > 12) {
    return <p className="text-gray-500">Invalid district number.</p>;
  }

  return (
    <Suspense fallback={null}>
      <DistrictDetailContent districtId={districtId} />
    </Suspense>
  );
}

async function DistrictDetailContent({ districtId }: { districtId: number }) {
  const districtName = DISTRICT_NAMES[districtId] ?? `District ${districtId}`;
  const [beigeBook, editions, content, indicators, metrics, econSummary, feeRevenue, complaints, themes] = await Promise.all([
    getLatestBeigeBook(districtId),
    getBeigeBookEditions(8),
    getDistrictContent(districtId, 15),
    getDistrictIndicators(districtId),
    getDistrictMetrics(),
    getDistrictEconomicSummary(districtId).catch(() => null),
    getDistrictFeeRevenue(districtId).catch(() => null),
    getDistrictComplaintSummary(districtId).catch(() => null),
    getBeigeBookThemes().catch(() => []),
  ]);
  const districtMetric = metrics.find((m) => m.district === districtId);
  const districtThemes = themes.filter((t: { fed_district: number }) => t.fed_district === districtId);

  const summary = beigeBook.find(
    (s) => s.section_name === "Summary of Economic Activity"
  );
  const otherSections = beigeBook.filter(
    (s) => s.section_name !== "Summary of Economic Activity"
  );

  const indicatorsBySeries = new Map<
    string,
    { title: string; units: string; points: { date: string; value: number }[] }
  >();
  for (const ind of indicators) {
    if (!indicatorsBySeries.has(ind.series_id)) {
      indicatorsBySeries.set(ind.series_id, {
        title: ind.series_title ?? ind.series_id,
        units: ind.units ?? "",
        points: [],
      });
    }
    if (ind.value !== null) {
      indicatorsBySeries.get(ind.series_id)!.points.push({
        date: ind.observation_date,
        value: ind.value,
      });
    }
  }

  return (
    <>
      <div className="mb-6">
        <Breadcrumbs
          items={[
            { label: "Dashboard", href: "/admin" },
            { label: "Districts", href: "/admin/districts" },
            { label: `${districtId} - ${districtName}` },
          ]}
        />
        <h1 className="text-xl font-bold tracking-tight text-gray-900">
          District {districtId} &mdash; {districtName}
        </h1>
        {districtMetric && (
          <div className="flex items-center gap-4 mt-1 text-sm text-gray-500 tabular-nums">
            <span>
              {districtMetric.institution_count.toLocaleString()} institutions
            </span>
            <span>
              {(districtMetric.fee_url_pct * 100).toFixed(0)}% fee URL coverage
            </span>
            <span>
              {districtMetric.total_fees.toLocaleString()} fees extracted
            </span>
          </div>
        )}
      </div>

      <div className="space-y-6">
        {/* Beige Book */}
        {beigeBook.length > 0 ? (
          <div className="rounded-lg border bg-white">
            <div className="px-5 py-3 border-b bg-gray-50/80 flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-800">
                Beige Book
              </h2>
              {summary && (
                <span className="text-[11px] text-gray-400">
                  Published {timeAgo(summary.release_date)}
                </span>
              )}
            </div>
            <div className="p-5">
              {summary && (
                <div className="mb-4">
                  <h3 className="text-sm font-medium text-gray-900 mb-1">
                    Summary of Economic Activity
                  </h3>
                  <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">
                    {summary.content_text}
                  </p>
                </div>
              )}

              {otherSections.length > 0 && (
                <div className="space-y-3">
                  {otherSections.map((section) => (
                    <details key={section.id} className="group">
                      <summary className="flex items-center gap-2 cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900 py-1">
                        <svg
                          className="w-3.5 h-3.5 text-gray-400 transition-transform group-open:rotate-90"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M8.25 4.5l7.5 7.5-7.5 7.5"
                          />
                        </svg>
                        {section.section_name}
                      </summary>
                      <p className="text-sm text-gray-600 leading-relaxed pl-5.5 mt-1 whitespace-pre-line">
                        {section.content_text}
                      </p>
                    </details>
                  ))}
                </div>
              )}

              {summary && (
                <a
                  href={summary.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-gray-500 hover:text-blue-600 transition-colors mt-3 inline-block"
                >
                  View full report on federalreserve.gov
                </a>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border bg-white p-6 text-center text-gray-400 text-sm">
            No Beige Book data available. Run{" "}
            <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">
              python -m fee_crawler ingest-beige-book
            </code>{" "}
            to import.
          </div>
        )}

        {/* Recent Speeches & Research */}
        {content.length > 0 && (
          <div className="rounded-lg border bg-white">
            <div className="px-5 py-3 border-b bg-gray-50/80">
              <h2 className="text-sm font-bold text-gray-800">
                Recent Speeches &amp; Research
              </h2>
            </div>
            <div className="divide-y">
              {content.map((item) => (
                <div
                  key={item.id}
                  className="px-5 py-3 flex items-start justify-between gap-3 hover:bg-gray-50/50 transition-colors"
                >
                  <div className="min-w-0">
                    <a
                      href={item.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-gray-900 hover:text-blue-600 transition-colors font-medium line-clamp-1"
                    >
                      {item.title}
                    </a>
                    <div className="flex items-center gap-2 mt-0.5">
                      {item.speaker && (
                        <span className="text-xs text-gray-500">
                          {item.speaker}
                        </span>
                      )}
                      <span className="text-[11px] text-gray-400">
                        {timeAgo(item.published_at)}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`flex-shrink-0 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      item.content_type === "speech"
                        ? "bg-purple-50 text-purple-600"
                        : item.content_type === "testimony"
                          ? "bg-orange-50 text-orange-600"
                          : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {item.content_type}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Economic Indicators */}
        {indicatorsBySeries.size > 0 && (
          <div className="rounded-lg border bg-white">
            <div className="px-5 py-3 border-b bg-gray-50/80">
              <h2 className="text-sm font-bold text-gray-800">
                Economic Indicators (FRED)
              </h2>
            </div>
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              {Array.from(indicatorsBySeries.entries()).map(
                ([seriesId, data]) => {
                  const latest = data.points[0];
                  const previous = data.points[1];
                  const change =
                    latest && previous
                      ? latest.value - previous.value
                      : null;
                  return (
                    <div key={seriesId} className="rounded-lg border p-3">
                      <div className="text-[11px] text-gray-400 mb-1">
                        {data.title}
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-xl font-bold tabular-nums text-gray-900">
                          {latest?.value.toFixed(2) ?? "-"}
                        </span>
                        <span className="text-[11px] text-gray-400">
                          {data.units}
                        </span>
                        {change !== null && (
                          <span
                            className={`text-xs font-medium tabular-nums ${
                              change > 0
                                ? "text-red-600"
                                : change < 0
                                  ? "text-emerald-600"
                                  : "text-gray-400"
                            }`}
                          >
                            {change > 0 ? "+" : ""}
                            {change.toFixed(2)}
                          </span>
                        )}
                      </div>
                      {latest && (
                        <div className="text-[10px] text-gray-400 mt-0.5">
                          As of {latest.date}
                        </div>
                      )}
                    </div>
                  );
                }
              )}
            </div>
          </div>
        )}

        {/* District Economic Summary (Phase 23-24) */}
        {(econSummary || feeRevenue || complaints) && (
          <div className="rounded-lg border bg-white">
            <div className="px-5 py-3 border-b bg-gray-50/80">
              <h2 className="text-sm font-bold text-gray-800">
                District Intelligence
              </h2>
            </div>
            <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
              {econSummary && (
                <div className="rounded-lg border p-3">
                  <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Employment</div>
                  {econSummary.unemployment_rate && (
                    <div className="mb-2">
                      <span className="text-lg font-bold tabular-nums text-gray-900">{econSummary.unemployment_rate.current.toFixed(1)}%</span>
                      <span className="text-[11px] text-gray-400 ml-1">unemployment</span>
                    </div>
                  )}
                  {typeof econSummary.nonfarm_yoy_pct === "number" && (
                    <div>
                      <span className={`text-sm font-medium tabular-nums ${econSummary.nonfarm_yoy_pct > 0 ? "text-emerald-600" : "text-red-600"}`}>
                        {econSummary.nonfarm_yoy_pct > 0 ? "+" : ""}{econSummary.nonfarm_yoy_pct.toFixed(1)}%
                      </span>
                      <span className="text-[11px] text-gray-400 ml-1">nonfarm payroll YoY</span>
                    </div>
                  )}
                </div>
              )}
              {feeRevenue && (
                <div className="rounded-lg border p-3">
                  <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Fee Revenue</div>
                  <div className="mb-1">
                    <span className="text-lg font-bold tabular-nums text-gray-900">{formatAmount(feeRevenue.total_sc_income)}</span>
                  </div>
                  <div className="text-[11px] text-gray-400">
                    {feeRevenue.institution_count} institutions | avg {formatAmount(feeRevenue.avg_sc_income)}/inst
                  </div>
                </div>
              )}
              {complaints && (
                <div className="rounded-lg border p-3">
                  <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">CFPB Complaints</div>
                  <div className="mb-1">
                    <span className="text-lg font-bold tabular-nums text-gray-900">{typeof complaints === 'object' && 'total_complaints' in complaints ? (complaints as { total_complaints: number }).total_complaints.toLocaleString() : '—'}</span>
                    <span className="text-[11px] text-gray-400 ml-1">total</span>
                  </div>
                  {typeof complaints === 'object' && 'fee_related_pct' in complaints && (
                    <div className="text-[11px] text-gray-400">
                      {((complaints as { fee_related_pct: number }).fee_related_pct * 100).toFixed(0)}% fee-related
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Beige Book Themes (Phase 24) */}
        {districtThemes.length > 0 && (
          <div className="rounded-lg border bg-white">
            <div className="px-5 py-3 border-b bg-gray-50/80">
              <h2 className="text-sm font-bold text-gray-800">
                Beige Book Themes
              </h2>
            </div>
            <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-3">
              {districtThemes.map((theme: { theme_category: string; sentiment: string; summary: string }, i: number) => (
                <div key={i} className="rounded-lg border p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{theme.theme_category.replace('_', ' ')}</span>
                    <span className={`inline-block w-2 h-2 rounded-full ${
                      theme.sentiment === 'positive' ? 'bg-emerald-400' :
                      theme.sentiment === 'negative' ? 'bg-red-400' :
                      theme.sentiment === 'mixed' ? 'bg-amber-400' : 'bg-gray-300'
                    }`} />
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed line-clamp-3">{theme.summary}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick link to peer segmentation */}
        <div className="text-sm">
          <Link
            href={`/admin/peers?district=${districtId}`}
            className="text-gray-500 hover:text-blue-600 transition-colors"
          >
            View peer segmentation for District {districtId}
          </Link>
        </div>
      </div>
    </>
  );
}

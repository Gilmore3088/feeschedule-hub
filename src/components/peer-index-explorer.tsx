"use client";

import { useState, useTransition } from "react";
import { formatAmount } from "@/lib/format";
import {
  fetchPeerPreview,
  type PeerPreviewResult,
} from "@/app/actions/peer-preview";

const TIER_OPTIONS = [
  { value: "community_small", label: "< $300M" },
  { value: "community_mid", label: "$300M - $1B" },
  { value: "community_large", label: "$1B - $10B" },
  { value: "regional", label: "$10B - $50B" },
  { value: "large_regional", label: "$50B - $250B" },
  { value: "super_regional", label: "$250B+" },
] as const;

const DISTRICT_OPTIONS = [
  { value: 1, label: "Boston" },
  { value: 2, label: "New York" },
  { value: 3, label: "Philadelphia" },
  { value: 4, label: "Cleveland" },
  { value: 5, label: "Richmond" },
  { value: 6, label: "Atlanta" },
  { value: 7, label: "Chicago" },
  { value: 8, label: "St. Louis" },
  { value: 9, label: "Minneapolis" },
  { value: 10, label: "Kansas City" },
  { value: 11, label: "Dallas" },
  { value: 12, label: "San Francisco" },
] as const;

const CHARTER_OPTIONS = [
  { value: "bank", label: "Banks" },
  { value: "credit_union", label: "Credit Unions" },
] as const;

export function PeerIndexExplorer() {
  const [selectedTiers, setSelectedTiers] = useState<string[]>([]);
  const [selectedDistricts, setSelectedDistricts] = useState<number[]>([]);
  const [selectedCharter, setSelectedCharter] = useState<string | null>(null);
  const [result, setResult] = useState<PeerPreviewResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const hasSelection =
    selectedTiers.length > 0 ||
    selectedDistricts.length > 0 ||
    selectedCharter !== null;

  function toggleTier(tier: string) {
    const next = selectedTiers.includes(tier)
      ? selectedTiers.filter((t) => t !== tier)
      : [...selectedTiers, tier];
    setSelectedTiers(next);
    fetchData(next, selectedDistricts, selectedCharter);
  }

  function toggleDistrict(district: number) {
    const next = selectedDistricts.includes(district)
      ? selectedDistricts.filter((d) => d !== district)
      : [...selectedDistricts, district];
    setSelectedDistricts(next);
    fetchData(selectedTiers, next, selectedCharter);
  }

  function toggleCharter(charter: string) {
    const next = selectedCharter === charter ? null : charter;
    setSelectedCharter(next);
    fetchData(selectedTiers, selectedDistricts, next);
  }

  function clearAll() {
    setSelectedTiers([]);
    setSelectedDistricts([]);
    setSelectedCharter(null);
    setResult(null);
  }

  function fetchData(
    tiers: string[],
    districts: number[],
    charter: string | null
  ) {
    const hasAny = tiers.length > 0 || districts.length > 0 || charter !== null;
    if (!hasAny) {
      setResult(null);
      return;
    }
    startTransition(async () => {
      const data = await fetchPeerPreview({
        charter_type: charter ?? undefined,
        asset_tiers: tiers.length > 0 ? tiers : undefined,
        fed_districts: districts.length > 0 ? districts : undefined,
      });
      setResult(data);
    });
  }

  return (
    <section id="peer-index" className="bg-white py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid grid-cols-1 gap-16 lg:grid-cols-2 items-start">
          {/* Left: filters */}
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">
              Peer Index Segmentation
            </h2>
            <p className="mt-5 text-[15px] leading-relaxed text-slate-600">
              Select filters to generate a tailored benchmark. Compare your
              peer segment against the national median across spotlight fee
              categories.
            </p>

            <div className="mt-8 space-y-4">
              {/* Asset Tier */}
              <div className="rounded-lg border border-slate-200 p-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2.5">
                  Asset Tier
                </p>
                <div className="flex flex-wrap gap-2">
                  {TIER_OPTIONS.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => toggleTier(t.value)}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                        selectedTiers.includes(t.value)
                          ? "bg-slate-900 text-white shadow-sm"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Federal Reserve District */}
              <div className="rounded-lg border border-slate-200 p-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2.5">
                  Federal Reserve District
                </p>
                <div className="flex flex-wrap gap-2">
                  {DISTRICT_OPTIONS.map((d) => (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => toggleDistrict(d.value)}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                        selectedDistricts.includes(d.value)
                          ? "bg-slate-900 text-white shadow-sm"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Charter Type */}
              <div className="rounded-lg border border-slate-200 p-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2.5">
                  Charter Type
                </p>
                <div className="flex gap-2">
                  {CHARTER_OPTIONS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => toggleCharter(c.value)}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                        selectedCharter === c.value
                          ? c.value === "bank"
                            ? "bg-blue-600 text-white shadow-sm"
                            : "bg-emerald-600 text-white shadow-sm"
                          : c.value === "bank"
                            ? "bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100"
                            : "bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {hasSelection && (
              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
                >
                  Clear all filters
                </button>
              </div>
            )}

            <div className="mt-8">
              <a
                href="#request-access"
                className="inline-flex items-center rounded-lg bg-[#0f172a] px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-slate-800 transition-colors"
              >
                Benchmark Your Institution
              </a>
            </div>
          </div>

          {/* Right: results table */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 overflow-hidden">
            {!hasSelection ? (
              <EmptyState />
            ) : isPending ? (
              <LoadingState />
            ) : result && result.rows.length > 0 ? (
              <ResultsTable result={result} />
            ) : (
              <NoDataState />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <div className="px-6 py-16 text-center">
      <div className="mx-auto w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center mb-4">
        <svg
          className="w-5 h-5 text-slate-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
          />
        </svg>
      </div>
      <p className="text-sm font-medium text-slate-700">
        Select filters to explore
      </p>
      <p className="text-xs text-slate-400 mt-1">
        Choose a tier, district, or charter type to see peer medians
      </p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="px-5 py-3 border-b border-slate-200 bg-white">
      <div className="h-4 w-40 bg-slate-200 rounded animate-pulse mb-1.5" />
      <div className="h-3 w-56 bg-slate-100 rounded animate-pulse" />
    </div>
  );
}

function NoDataState() {
  return (
    <div className="px-6 py-16 text-center">
      <p className="text-sm text-slate-500">
        No fee data available for this segment.
      </p>
      <p className="text-xs text-slate-400 mt-1">
        Try broadening your filters.
      </p>
    </div>
  );
}

function ResultsTable({ result }: { result: PeerPreviewResult }) {
  const activeRows = result.rows.filter(
    (r) => r.peer_median !== null || r.national_median !== null
  );

  return (
    <>
      <div className="px-5 py-3 border-b border-slate-200 bg-white">
        <p className="text-[13px] font-semibold text-slate-900">
          Peer Comparison
        </p>
        <p className="text-[11px] text-slate-500">
          {result.filter_description}
          {result.peer_institution_count > 0 && (
            <span className="ml-1.5 text-slate-400">
              ({result.peer_institution_count} institutions)
            </span>
          )}
        </p>
      </div>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-slate-200 text-left">
            <th className="px-5 py-2.5 text-xs font-medium text-slate-500">
              Category
            </th>
            <th className="px-4 py-2.5 text-xs font-medium text-slate-500 text-right">
              Peer Median
            </th>
            <th className="px-4 py-2.5 text-xs font-medium text-slate-500 text-right">
              National
            </th>
            <th className="px-5 py-2.5 text-xs font-medium text-slate-500 text-right">
              Delta
            </th>
          </tr>
        </thead>
        <tbody className="bg-white">
          {activeRows.map((row, i) => (
            <tr
              key={row.fee_category}
              className={
                i < activeRows.length - 1 ? "border-b border-slate-100" : ""
              }
            >
              <td className="px-5 py-2.5 text-slate-700">
                {row.display_name}
              </td>
              <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-slate-900">
                {row.peer_median !== null ? formatAmount(row.peer_median) : "-"}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
                {row.national_median !== null
                  ? formatAmount(row.national_median)
                  : "-"}
              </td>
              <td className="px-5 py-2.5 text-right">
                <DeltaBadge delta={row.delta_pct} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-5 py-2.5 border-t border-slate-200 bg-slate-50">
        <p className="text-[11px] text-slate-400">
          Medians computed from {result.peer_institution_count} peer
          institutions vs. national benchmark.
        </p>
      </div>
    </>
  );
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) return <span className="text-slate-300">-</span>;

  const isNegative = delta < 0;
  const isNeutral = Math.abs(delta) < 1;

  if (isNeutral) {
    return (
      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium tabular-nums text-slate-500">
        {delta > 0 ? "+" : ""}
        {delta.toFixed(1)}%
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums ${
        isNegative
          ? "bg-emerald-50 text-emerald-700"
          : "bg-red-50 text-red-700"
      }`}
    >
      {delta > 0 ? "+" : ""}
      {delta.toFixed(1)}%
    </span>
  );
}

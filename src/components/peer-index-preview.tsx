"use client";

import { useState, useTransition, useEffect } from "react";
import { getPeerPreview, type PeerPreviewResult } from "@/app/actions/peer-index";

const TIERS = [
  { value: "Under $300M", label: "< $300M" },
  { value: "$300M-$1B", label: "$300M-$1B" },
  { value: "$1B-$10B", label: "$1B-$10B" },
  { value: "Over $10B", label: "$10B+" },
];

const DISTRICTS = [
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
];

const CHARTERS = [
  { value: "Bank", label: "Banks" },
  { value: "Credit Union", label: "Credit Unions" },
];

function formatAmount(amount: number | null): string {
  if (amount === null) return "-";
  return `$${amount.toFixed(2)}`;
}

interface Props {
  initialData: PeerPreviewResult;
}

export function PeerIndexPreview({ initialData }: Props) {
  const [charter, setCharter] = useState<string | null>(null);
  const [tier, setTier] = useState<string | null>(null);
  const [district, setDistrict] = useState<number | null>(null);
  const [data, setData] = useState<PeerPreviewResult>(initialData);
  const [isPending, startTransition] = useTransition();

  const hasFilters = charter || tier || district;

  useEffect(() => {
    if (!hasFilters) {
      setData(initialData);
      return;
    }

    startTransition(async () => {
      const result = await getPeerPreview({
        charter: charter || undefined,
        tier: tier || undefined,
        district: district || undefined,
      });
      setData(result);
    });
  }, [charter, tier, district, hasFilters, initialData]);

  function toggleFilter<T>(current: T | null, value: T): T | null {
    return current === value ? null : value;
  }

  return (
    <div className="grid grid-cols-1 gap-16 lg:grid-cols-2 items-center">
      {/* Left: Filters */}
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">
          Peer Index Segmentation
        </h2>
        <p className="mt-5 text-[15px] leading-relaxed text-slate-600">
          Select filters to generate a tailored benchmark reflecting your
          institution&apos;s competitive footprint.
        </p>
        <div className="mt-8 space-y-4">
          {/* Asset Tier */}
          <div className="rounded border border-slate-200 p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Asset Tier
            </p>
            <div className="flex flex-wrap gap-2">
              {TIERS.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setTier(toggleFilter(tier, t.value))}
                  className={`rounded px-2.5 py-1 text-xs transition-colors ${
                    tier === t.value
                      ? "bg-[#0f172a] text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Fed District */}
          <div className="rounded border border-slate-200 p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Federal Reserve District
            </p>
            <div className="flex flex-wrap gap-2">
              {DISTRICTS.map((d) => (
                <button
                  key={d.value}
                  onClick={() => setDistrict(toggleFilter(district, d.value))}
                  className={`rounded px-2.5 py-1 text-xs transition-colors ${
                    district === d.value
                      ? "bg-[#0f172a] text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Charter Type */}
          <div className="rounded border border-slate-200 p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Charter Type
            </p>
            <div className="flex gap-2">
              {CHARTERS.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setCharter(toggleFilter(charter, c.value))}
                  className={`rounded border px-2.5 py-1 text-xs font-medium transition-colors ${
                    charter === c.value
                      ? c.value === "Bank"
                        ? "bg-blue-600 border-blue-600 text-white"
                        : "bg-green-600 border-green-600 text-white"
                      : c.value === "Bank"
                        ? "bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100"
                        : "bg-green-50 border-green-200 text-green-700 hover:bg-green-100"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-8 flex items-center gap-4">
          <a
            href="#request-access"
            className="inline-flex items-center rounded bg-[#0f172a] px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-slate-800 transition-colors"
          >
            Benchmark Your Institution
          </a>
          {hasFilters && (
            <button
              onClick={() => { setCharter(null); setTier(null); setDistrict(null); }}
              className="text-[13px] text-slate-400 hover:text-slate-600 transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Right: Live comparison table */}
      <div className={`rounded-lg border border-slate-200 bg-slate-50 overflow-hidden transition-opacity ${isPending ? "opacity-60" : ""}`}>
        <div className="px-5 py-3 border-b border-slate-200 bg-white">
          <p className="text-[13px] font-semibold text-slate-900">
            {hasFilters ? "Peer Comparison" : "National Index"}
          </p>
          <p className="text-[11px] text-slate-500">
            {data.label}
          </p>
        </div>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-slate-200 text-left">
              <th className="px-5 py-2.5 text-xs font-medium text-slate-500">
                Category
              </th>
              {hasFilters && (
                <th className="px-4 py-2.5 text-xs font-medium text-slate-500 text-right">
                  Peer Median
                </th>
              )}
              <th className="px-5 py-2.5 text-xs font-medium text-slate-500 text-right">
                National
              </th>
            </tr>
          </thead>
          <tbody className="bg-white">
            {data.entries.map((entry, i) => (
              <tr
                key={entry.category}
                className={i < data.entries.length - 1 ? "border-b border-slate-100" : ""}
              >
                <td className="px-5 py-2.5 text-slate-700">
                  {entry.displayName}
                </td>
                {hasFilters && (
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-slate-900">
                    {formatAmount(entry.peerMedian)}
                  </td>
                )}
                <td className="px-5 py-2.5 text-right tabular-nums text-slate-500">
                  {formatAmount(entry.nationalMedian)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-5 py-2.5 border-t border-slate-200 bg-slate-50">
          <p className="text-[11px] text-slate-400">
            {hasFilters
              ? "Live data from validated fee schedules."
              : "Select filters to see peer comparison."}
          </p>
        </div>
      </div>
    </div>
  );
}

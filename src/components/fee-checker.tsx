"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { STATE_NAMES, STATE_TO_DISTRICT } from "@/lib/fed-districts";
import { FAMILY_COLORS, getFeeFamily } from "@/lib/fee-taxonomy";
import { checkFeesForState, type FeeCheckResult } from "@/app/actions/fee-check";
import { formatAmount } from "@/lib/format";

const STATES = Object.entries(STATE_NAMES)
  .filter(([code]) => code.length === 2 && STATE_TO_DISTRICT[code])
  .sort(([, a], [, b]) => a.localeCompare(b));

export function FeeChecker() {
  const [state, setState] = useState("");
  const [result, setResult] = useState<FeeCheckResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const [hasSearched, setHasSearched] = useState(false);

  function handleCheck() {
    if (!state) return;
    startTransition(async () => {
      const data = await checkFeesForState(state);
      setResult(data);
      setHasSearched(true);
    });
  }

  return (
    <div>
      {/* State selector */}
      <div className="mb-8">
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Select your state
        </label>
        <div className="flex gap-3">
          <select
            value={state}
            onChange={(e) => {
              setState(e.target.value);
              setResult(null);
              setHasSearched(false);
            }}
            className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400"
          >
            <option value="">Choose a state...</option>
            {STATES.map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
          <button
            onClick={handleCheck}
            disabled={!state || isPending}
            className="rounded-lg bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isPending ? "Checking..." : "Check Fees"}
          </button>
        </div>
      </div>

      {/* Loading state */}
      {isPending && (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="animate-pulse flex items-center gap-4 rounded-lg border border-slate-100 px-4 py-4">
              <div className="h-4 w-32 rounded bg-slate-100" />
              <div className="ml-auto h-4 w-16 rounded bg-slate-100" />
              <div className="h-4 w-16 rounded bg-slate-100" />
              <div className="h-5 w-14 rounded-full bg-slate-100" />
            </div>
          ))}
        </div>
      )}

      {/* Results */}
      {!isPending && result && (
        <div>
          {/* Summary header */}
          <div className="mb-6 rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Fee Report for
                </p>
                <h3 className="mt-1 text-xl font-bold tracking-tight text-slate-900">
                  {STATE_NAMES[result.state_code]} (Fed District {result.district} &mdash; {result.district_name})
                </h3>
                <p className="mt-1 text-[13px] text-slate-500">
                  Based on {result.total_local_institutions.toLocaleString()} local institutions vs {result.total_national_institutions.toLocaleString()} nationally
                </p>
              </div>
              <ScoreRing delta={result.avg_delta_pct} />
            </div>

            {/* Quick stats */}
            <div className="mt-5 grid grid-cols-3 gap-4">
              <QuickStat
                label="Fees Below Avg"
                value={String(result.below_count)}
                accent="emerald"
              />
              <QuickStat
                label="Fees Above Avg"
                value={String(result.above_count)}
                accent="red"
              />
              <QuickStat
                label="Avg Deviation"
                value={
                  result.avg_delta_pct != null
                    ? `${result.avg_delta_pct > 0 ? "+" : ""}${result.avg_delta_pct.toFixed(1)}%`
                    : "N/A"
                }
                accent={
                  result.avg_delta_pct != null && result.avg_delta_pct < 0
                    ? "emerald"
                    : result.avg_delta_pct != null && result.avg_delta_pct > 0
                      ? "red"
                      : "slate"
                }
              />
            </div>
          </div>

          {/* Fee comparison table */}
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50/80">
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Fee Category
                  </th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Your Area
                  </th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    National
                  </th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Difference
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {result.rows.map((row) => {
                  const family = getFeeFamily(row.category);
                  const colors = family ? FAMILY_COLORS[family] : null;
                  return (
                    <tr
                      key={row.category}
                      className="hover:bg-slate-50/50 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {colors && (
                            <span
                              className={`inline-block h-2 w-2 rounded-full ${colors.border.replace("border-l-", "bg-")}`}
                            />
                          )}
                          <Link
                            href={`/fees/${row.category}`}
                            className="text-sm font-medium text-slate-900 hover:text-blue-600 transition-colors"
                          >
                            {row.display_name}
                          </Link>
                        </div>
                        <p className="mt-0.5 pl-4 text-[11px] text-slate-400">
                          {row.local_count} local institutions
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-semibold tabular-nums text-slate-900">
                          {formatAmount(row.local_median)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm tabular-nums text-slate-500">
                          {formatAmount(row.national_median)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {row.delta_pct != null ? (
                          <DeltaPill delta={row.delta_pct} />
                        ) : (
                          <span className="text-[11px] text-slate-300">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* CTA */}
          <div className="mt-8 rounded-xl border border-slate-200 bg-gradient-to-br from-slate-900 to-slate-800 p-8 text-center">
            <h3 className="text-lg font-bold text-white">
              Want the full picture?
            </h3>
            <p className="mt-2 text-[14px] text-slate-400 max-w-md mx-auto">
              Access all 49 fee categories, peer group comparisons by asset size,
              and district-level analytics with a professional account.
            </p>
            <div className="mt-5 flex items-center justify-center gap-3">
              <Link
                href="/fees"
                className="rounded-lg border border-slate-600 px-5 py-2.5 text-[13px] font-medium text-slate-300 hover:bg-slate-700 transition-colors"
              >
                Browse Fee Index
              </Link>
              <Link
                href="/#request-access"
                className="rounded-lg bg-amber-400 px-5 py-2.5 text-[13px] font-semibold text-slate-900 hover:bg-amber-300 transition-colors"
              >
                Request Access
              </Link>
            </div>
          </div>

          {/* Methodology note */}
          <p className="mt-6 text-[11px] text-slate-400 text-center max-w-lg mx-auto">
            Comparison based on the 6 most commonly tracked banking fees.
            Local data reflects institutions in Fed District {result.district} ({result.district_name}).
            National medians computed from {result.total_national_institutions.toLocaleString()} institutions.
          </p>
        </div>
      )}

      {/* Empty state after search */}
      {!isPending && hasSearched && !result && (
        <div className="rounded-xl border border-slate-200 bg-slate-50/50 px-8 py-12 text-center">
          <p className="text-sm text-slate-500">
            No fee data available for this state yet.
          </p>
          <Link
            href="/fees"
            className="mt-3 inline-block text-sm text-blue-600 hover:underline"
          >
            Browse all fee categories
          </Link>
        </div>
      )}

      {/* Initial state prompt */}
      {!isPending && !hasSearched && (
        <div className="rounded-xl border border-dashed border-slate-200 px-8 py-16 text-center">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className="mx-auto h-10 w-10 text-slate-300"
            stroke="currentColor"
            strokeWidth="1"
          >
            <path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l5.447 2.724A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
          <p className="mt-4 text-sm font-medium text-slate-600">
            Select your state to see how local banking fees compare
          </p>
          <p className="mt-1 text-[12px] text-slate-400">
            Instant comparison across the 6 most-tracked fee categories
          </p>
        </div>
      )}
    </div>
  );
}

function ScoreRing({ delta }: { delta: number | null }) {
  if (delta == null) return null;

  const isGood = delta <= 0;
  const ringColor = isGood ? "text-emerald-500" : "text-red-400";
  const label = isGood ? "Below Avg" : "Above Avg";
  const pct = Math.min(Math.abs(delta), 30);
  const dashOffset = 100 - (pct / 30) * 100;

  return (
    <div className="flex flex-col items-center">
      <div className="relative h-16 w-16">
        <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
          <circle
            cx="18" cy="18" r="15.9"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            className="text-slate-100"
          />
          <circle
            cx="18" cy="18" r="15.9"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeDasharray="100"
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            className={ringColor}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-xs font-bold tabular-nums text-slate-900">
          {Math.abs(delta).toFixed(0)}%
        </span>
      </div>
      <span className={`mt-1 text-[10px] font-semibold ${isGood ? "text-emerald-600" : "text-red-500"}`}>
        {label}
      </span>
    </div>
  );
}

function QuickStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: "emerald" | "red" | "slate";
}) {
  const colorMap = {
    emerald: "text-emerald-600",
    red: "text-red-600",
    slate: "text-slate-600",
  };
  return (
    <div className="rounded-lg bg-white border border-slate-100 px-3 py-2.5 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p className={`mt-0.5 text-lg font-bold tabular-nums ${colorMap[accent]}`}>
        {value}
      </p>
    </div>
  );
}

function DeltaPill({ delta }: { delta: number }) {
  const isBelow = delta < -2;
  const isAbove = delta > 2;
  const colorClass = isBelow
    ? "bg-emerald-50 text-emerald-600"
    : isAbove
      ? "bg-red-50 text-red-600"
      : "bg-slate-100 text-slate-500";
  const arrow = isBelow ? "\u2193" : isAbove ? "\u2191" : "";
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tabular-nums ${colorClass}`}
    >
      {arrow}
      {delta > 0 ? "+" : ""}
      {delta.toFixed(1)}%
    </span>
  );
}

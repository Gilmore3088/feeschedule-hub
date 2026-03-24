export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireAuth, hasPermission } from "@/lib/auth";
import {
  getIntegrityChecks,
  getCoverageFunnelData,
  getUncategorizedTopFees,
} from "@/lib/admin-queries";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { QuickActions } from "./quick-actions";

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

function statusLabel(status: "pass" | "fail" | "warn"): string {
  if (status === "pass") return "PASS";
  if (status === "warn") return "WARN";
  return "FAIL";
}

function statusColor(status: "pass" | "fail" | "warn"): string {
  if (status === "pass")
    return "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
  if (status === "warn")
    return "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
  return "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400";
}

function scoreColor(score: number): string {
  if (score >= 90) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 70) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function scoreBg(score: number): string {
  if (score >= 90) return "bg-emerald-50 dark:bg-emerald-900/20";
  if (score >= 70) return "bg-amber-50 dark:bg-amber-900/20";
  return "bg-red-50 dark:bg-red-900/20";
}

function computeScore(
  checks: { status: "pass" | "fail" | "warn" }[],
): number {
  if (checks.length === 0) return 100;
  const weights = { pass: 1, warn: 0.5, fail: 0 };
  const total = checks.reduce((sum, c) => sum + weights[c.status], 0);
  return Math.round((total / checks.length) * 100);
}

export default async function DataQualityPage() {
  const user = await requireAuth("view");
  const canTrigger = hasPermission(user, "trigger_jobs");

  let checks: Awaited<ReturnType<typeof getIntegrityChecks>> = [];
  let funnel = {
    total_institutions: 0,
    with_website: 0,
    with_fee_url: 0,
    with_fees: 0,
    with_approved: 0,
  };
  let uncategorized: Awaited<ReturnType<typeof getUncategorizedTopFees>> = [];

  try {
    [checks, funnel, uncategorized] = await Promise.all([
      getIntegrityChecks(),
      getCoverageFunnelData(),
      getUncategorizedTopFees(20),
    ]);
  } catch (e) {
    console.error("Data quality load failed:", e);
  }

  const score = computeScore(checks);
  const passCount = checks.filter((c) => c.status === "pass").length;
  const warnCount = checks.filter((c) => c.status === "warn").length;
  const failCount = checks.filter((c) => c.status === "fail").length;

  const funnelSteps = [
    { label: "Institutions", value: funnel.total_institutions, pct: 100 },
    {
      label: "With Website",
      value: funnel.with_website,
      pct: funnel.total_institutions > 0
        ? Math.round((funnel.with_website / funnel.total_institutions) * 100)
        : 0,
    },
    {
      label: "With Fee URL",
      value: funnel.with_fee_url,
      pct: funnel.total_institutions > 0
        ? Math.round((funnel.with_fee_url / funnel.total_institutions) * 100)
        : 0,
    },
    {
      label: "With Fees",
      value: funnel.with_fees,
      pct: funnel.total_institutions > 0
        ? Math.round((funnel.with_fees / funnel.total_institutions) * 100)
        : 0,
    },
    {
      label: "With Approved",
      value: funnel.with_approved,
      pct: funnel.total_institutions > 0
        ? Math.round((funnel.with_approved / funnel.total_institutions) * 100)
        : 0,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Breadcrumbs
          items={[{ label: "Admin", href: "/admin" }, { label: "Data Quality" }]}
        />
        <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          Data Quality Dashboard
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Integrity checks, coverage analysis, and data hygiene
        </p>
      </div>

      {/* Row 1: Score + Checks */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        {/* Score Card */}
        <div
          className={`admin-card flex flex-col items-center justify-center rounded-lg p-6 ${scoreBg(score)}`}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            Integrity Score
          </p>
          <p className={`mt-1 text-5xl font-bold tabular-nums ${scoreColor(score)}`}>
            {score}
          </p>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            {passCount} pass / {warnCount} warn / {failCount} fail
          </p>
        </div>

        {/* Check Results */}
        <div className="admin-card col-span-1 overflow-hidden rounded-lg lg:col-span-3">
          <div className="bg-gray-50/80 px-4 py-2.5 dark:bg-white/[0.04]">
            <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200">
              Integrity Checks
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/80 dark:border-white/[0.06] dark:bg-white/[0.02]">
                  <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    Status
                  </th>
                  <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    Check
                  </th>
                  <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    Detail
                  </th>
                  <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    Count
                  </th>
                </tr>
              </thead>
              <tbody>
                {checks.map((check, i) => (
                  <tr
                    key={i}
                    className="border-b border-gray-50 transition-colors hover:bg-gray-50/50 dark:border-white/[0.04] dark:hover:bg-white/[0.04]"
                  >
                    <td className="px-4 py-2">
                      <span
                        className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${statusColor(check.status)}`}
                      >
                        {statusLabel(check.status)}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-medium text-gray-900 dark:text-gray-100">
                      {check.name}
                    </td>
                    <td className="px-4 py-2 text-gray-500 dark:text-gray-400">
                      {check.detail}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-600 dark:text-gray-300">
                      {check.count >= 0 ? formatNumber(check.count) : "-"}
                    </td>
                  </tr>
                ))}
                {checks.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-400">
                      Data unavailable
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Row 2: Funnel + Uncategorized */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Coverage Funnel */}
        <div className="admin-card overflow-hidden rounded-lg">
          <div className="bg-gray-50/80 px-4 py-2.5 dark:bg-white/[0.04]">
            <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200">
              Coverage Funnel
            </h2>
          </div>
          <div className="space-y-3 p-4">
            {funnelSteps.map((step, i) => (
              <div key={step.label}>
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                    {step.label}
                  </span>
                  <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400">
                    {formatNumber(step.value)}{" "}
                    <span className="text-[10px] text-gray-400">({step.pct}%)</span>
                  </span>
                </div>
                <div className="h-5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-white/[0.06]">
                  <div
                    className={`h-full rounded-full transition-all ${
                      i === 0
                        ? "bg-gray-400 dark:bg-gray-500"
                        : i === funnelSteps.length - 1
                          ? "bg-emerald-500 dark:bg-emerald-600"
                          : "bg-blue-400 dark:bg-blue-500"
                    }`}
                    style={{ width: `${step.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Uncategorized Fees */}
        <div className="admin-card overflow-hidden rounded-lg">
          <div className="bg-gray-50/80 px-4 py-2.5 dark:bg-white/[0.04]">
            <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200">
              Top Uncategorized Fees
            </h2>
          </div>
          {uncategorized.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-gray-400">
              All fees are categorized
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/80 dark:border-white/[0.06] dark:bg-white/[0.02]">
                  <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    Fee Name
                  </th>
                  <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    Count
                  </th>
                </tr>
              </thead>
              <tbody>
                {uncategorized.map((fee) => (
                  <tr
                    key={fee.fee_name}
                    className="border-b border-gray-50 transition-colors hover:bg-gray-50/50 dark:border-white/[0.04] dark:hover:bg-white/[0.04]"
                  >
                    <td className="max-w-[280px] truncate px-4 py-2 text-gray-900 dark:text-gray-100">
                      {fee.fee_name}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-600 dark:text-gray-300">
                      {formatNumber(fee.count)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Row 3: Quick Actions */}
      <div className="admin-card overflow-hidden rounded-lg">
        <div className="bg-gray-50/80 px-4 py-2.5 dark:bg-white/[0.04]">
          <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200">
            Quick Actions
          </h2>
        </div>
        <div className="p-4">
          <QuickActions canTrigger={canTrigger} />
        </div>
      </div>
    </div>
  );
}

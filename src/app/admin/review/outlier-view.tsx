"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { editAndApproveFee, rejectFee } from "@/lib/fee-actions";
import { formatAmount } from "@/lib/format";
import { InlineAmountEditor } from "./inline-amount-editor";
import type { ReviewableFee } from "@/lib/crawler-db/types";
import type { CategoryMedian } from "@/lib/crawler-db/core";

interface ValidationFlag {
  rule: string;
  severity: string;
  message: string;
}

function parseFlags(flags: string | null): ValidationFlag[] {
  if (!flags) return [];
  try {
    return JSON.parse(flags);
  } catch {
    return [];
  }
}

const OUTLIER_RULES = new Set([
  "statistical_outlier",
  "decimal_error",
  "percentage_confusion",
]);

function getOutlierFlags(flags: ValidationFlag[]): ValidationFlag[] {
  return flags.filter((f) => OUTLIER_RULES.has(f.rule));
}

interface SuggestedFix {
  label: string;
  value: number;
}

function computeSuggestedFixes(
  amount: number | null,
  flags: ValidationFlag[],
  median: CategoryMedian | undefined,
): SuggestedFix[] {
  if (amount === null || amount <= 0) return [];
  const fixes: SuggestedFix[] = [];

  for (const flag of flags) {
    if (flag.rule === "decimal_error") {
      if (flag.message.includes("10x") || amount > (median?.median ?? Infinity) * 5) {
        fixes.push({ label: "\u00f710", value: Math.round(amount / 10 * 100) / 100 });
        fixes.push({ label: "\u00f7100", value: Math.round(amount / 100 * 100) / 100 });
      }
      if (flag.message.includes("0.1x") || amount < (median?.median ?? 0) * 0.2) {
        fixes.push({ label: "\u00d710", value: Math.round(amount * 10 * 100) / 100 });
        fixes.push({ label: "\u00d7100", value: Math.round(amount * 100 * 100) / 100 });
      }
    }
    if (flag.rule === "percentage_confusion" && amount < 1) {
      fixes.push({ label: "Convert %", value: Math.round(amount * 100 * 100) / 100 });
    }
  }

  if (median && !fixes.some((f) => f.value === median.median)) {
    fixes.push({ label: `Median (${formatAmount(median.median)})`, value: median.median });
  }

  return fixes;
}

const FLAG_STYLES: Record<string, string> = {
  statistical_outlier: "bg-red-50 text-red-600 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800",
  decimal_error: "bg-orange-50 text-orange-600 border-orange-200 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800",
  percentage_confusion: "bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800",
};

const FLAG_LABELS: Record<string, string> = {
  statistical_outlier: "Outlier",
  decimal_error: "Decimal Error",
  percentage_confusion: "% Confusion",
};

interface OutlierViewProps {
  fees: ReviewableFee[];
  total: number;
  medians: Record<string, CategoryMedian>;
  categories: string[];
}

export function OutlierView({ fees, total, medians, categories }: OutlierViewProps) {
  const [filterCategory, setFilterCategory] = useState("");
  const [resolvedIds, setResolvedIds] = useState<Set<number>>(new Set());

  const displayed = fees.filter((f) => {
    if (resolvedIds.has(f.id)) return false;
    if (filterCategory && f.fee_category !== filterCategory) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm
                     dark:bg-[oklch(0.18_0_0)] dark:border-white/[0.12] dark:text-gray-100"
        >
          <option value="">All categories ({total})</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <span className="text-xs text-gray-400">
          {displayed.length} remaining
        </span>
      </div>

      {displayed.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          {total === 0
            ? "No outlier-flagged fees found. Run outlier-detect to scan for issues."
            : "All outliers in this category have been resolved."}
        </div>
      ) : (
        <div className="admin-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50/80 text-left">
                  <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                    Institution
                  </th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                    Fee
                  </th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">
                    Amount
                  </th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                    Issue
                  </th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">
                    Category Median
                  </th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayed.map((fee) => (
                  <OutlierRow
                    key={fee.id}
                    fee={fee}
                    median={fee.fee_category ? medians[fee.fee_category] : undefined}
                    onResolved={() => setResolvedIds((prev) => new Set(prev).add(fee.id))}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function OutlierRow({
  fee,
  median,
  onResolved,
}: {
  fee: ReviewableFee;
  median: CategoryMedian | undefined;
  onResolved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const flags = getOutlierFlags(parseFlags(fee.validation_flags));
  const suggestedFixes = computeSuggestedFixes(fee.amount, flags, median);

  function handleFixAndApprove(newAmount: number) {
    startTransition(async () => {
      const notes = `Outlier fix: ${formatAmount(fee.amount)} -> ${formatAmount(newAmount)} (${flags.map((f) => f.rule).join(", ")})`;
      const result = await editAndApproveFee(fee.id, { amount: newAmount }, notes);
      if (result.success) {
        onResolved();
      } else {
        alert(result.error || "Failed to fix and approve");
      }
    });
  }

  function handleReject() {
    startTransition(async () => {
      const result = await rejectFee(fee.id, `Rejected: ${flags.map((f) => f.rule).join(", ")}`);
      if (result.success) {
        onResolved();
      } else {
        alert(result.error || "Failed to reject");
      }
    });
  }

  return (
    <tr
      data-fee-row
      className={`border-b last:border-0 hover:bg-gray-50/50 transition-colors ${
        pending ? "opacity-40" : ""
      }`}
    >
      <td className="px-4 py-2.5">
        <Link
          href={`/admin/peers/${fee.crawl_target_id}`}
          className="font-medium text-gray-900 hover:text-blue-600 transition-colors text-xs dark:text-gray-100"
        >
          {fee.institution_name}
        </Link>
        <div className="text-[11px] text-gray-400">
          {fee.state_code} | {fee.charter_type === "bank" ? "Bank" : "CU"}
        </div>
      </td>
      <td className="px-4 py-2.5">
        <Link
          href={`/admin/review/${fee.id}`}
          className="text-gray-900 hover:text-blue-600 transition-colors font-medium text-xs dark:text-gray-100"
        >
          {fee.fee_name}
        </Link>
        {fee.fee_category && (
          <div className="text-[10px] text-gray-400 mt-0.5">
            {fee.fee_category.replace(/_/g, " ")}
          </div>
        )}
      </td>
      <td className="px-4 py-2.5 text-right">
        <InlineAmountEditor
          currentAmount={fee.amount}
          suggestedFixes={suggestedFixes}
          onSave={handleFixAndApprove}
          disabled={pending}
        />
      </td>
      <td className="px-4 py-2.5">
        <div className="space-y-1">
          {flags.map((flag, i) => (
            <div key={i}>
              <span
                className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold border ${
                  FLAG_STYLES[flag.rule] || "bg-gray-100 text-gray-500"
                }`}
              >
                {FLAG_LABELS[flag.rule] || flag.rule}
              </span>
              <p className="text-[10px] text-gray-400 mt-0.5 max-w-[200px] leading-snug">
                {flag.message}
              </p>
            </div>
          ))}
        </div>
      </td>
      <td className="px-4 py-2.5 text-right">
        {median ? (
          <div className="tabular-nums">
            <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
              {formatAmount(median.median)}
            </div>
            <div className="text-[10px] text-gray-400">
              P25: {formatAmount(median.p25)} | P75: {formatAmount(median.p75)}
            </div>
            <div className="text-[10px] text-gray-400">
              {median.count} obs
            </div>
          </div>
        ) : (
          <span className="text-xs text-gray-400">-</span>
        )}
      </td>
      <td className="px-4 py-2.5 text-right">
        <button
          disabled={pending}
          onClick={handleReject}
          className="rounded px-2 py-1 text-xs font-medium bg-red-50 text-red-700
                     hover:bg-red-100 disabled:opacity-50 dark:bg-red-900/20 dark:text-red-400 transition-colors"
        >
          Reject
        </button>
      </td>
    </tr>
  );
}

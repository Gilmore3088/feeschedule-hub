"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { bulkApproveFees, bulkRejectFees } from "@/lib/fee-actions";
import { ApproveButton, RejectButton, UnstageButton } from "./review-actions";
import { CategorySelect } from "./category-select";
import { formatAmount } from "@/lib/format";
import { safeJsonb } from "@/lib/pg-helpers";
import type { ReviewableFee } from "@/lib/crawler-db/types";

interface ValidationFlag {
  rule: string;
  severity: string;
  message: string;
}

function parseFlags(flags: unknown): ValidationFlag[] {
  return safeJsonb<ValidationFlag[]>(flags) ?? [];
}

function confidenceBadge(conf: number) {
  const cls =
    conf >= 0.9
      ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
      : conf >= 0.7
        ? "bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
        : "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400";
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${cls}`}
    >
      {(conf * 100).toFixed(0)}%
    </span>
  );
}

function FlagsBadges({ flags }: { flags: ValidationFlag[] }) {
  if (flags.length === 0) return <span className="text-gray-400 dark:text-gray-600">-</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {flags.map((f, i) => {
        const cls =
          f.severity === "error"
            ? "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400"
            : f.severity === "warning"
              ? "bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400"
              : "bg-gray-100 text-gray-500 dark:bg-white/[0.08] dark:text-gray-400";
        return (
          <span
            key={i}
            className={`inline-block rounded px-1.5 py-0.5 text-xs ${cls}`}
            title={f.message}
          >
            {f.rule.replace(/_/g, " ")}
          </span>
        );
      })}
    </div>
  );
}

function SortHeader({
  column,
  label,
  currentSort,
  currentDir,
  className,
}: {
  column: string;
  label: string;
  currentSort?: string;
  currentDir?: string;
  className?: string;
}) {
  const searchParams = useSearchParams();
  const isActive = currentSort === column;
  const nextDir = isActive && currentDir === "asc" ? "desc" : "asc";

  const params = new URLSearchParams(searchParams.toString());
  params.set("sort", column);
  params.set("dir", nextDir);
  params.delete("page");

  const arrow = isActive ? (currentDir === "asc" ? " \u2191" : " \u2193") : "";

  return (
    <th className={`px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider ${className || ""}`}>
      <Link
        href={`/admin/review?${params.toString()}`}
        className={`inline-flex items-center gap-0.5 transition-colors ${
          isActive
            ? "text-gray-900 dark:text-gray-100"
            : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        }`}
      >
        {label}{arrow}
      </Link>
    </th>
  );
}

interface ReviewTableProps {
  fees: ReviewableFee[];
  canApprove: boolean;
  activeStatus: string;
  sortColumn?: string;
  sortDir?: string;
}

export function ReviewTable({ fees, canApprove, activeStatus, sortColumn, sortDir }: ReviewTableProps) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkPending, startBulkTransition] = useTransition();

  const showActions =
    canApprove &&
    (activeStatus === "staged" || activeStatus === "flagged" || activeStatus === "pending");

  const allSelected = fees.length > 0 && fees.every((f) => selectedIds.has(f.id));
  const someSelected = selectedIds.size > 0;

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(fees.map((f) => f.id)));
    }
  }

  function toggleOne(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleBulkApprove() {
    const ids = Array.from(selectedIds);
    if (!confirm(`Approve ${ids.length} selected fees?`)) return;
    startBulkTransition(async () => {
      const result = await bulkApproveFees(ids);
      if (result.success) {
        setSelectedIds(new Set());
      } else {
        alert(result.error || "Bulk approve failed");
      }
    });
  }

  function handleBulkReject() {
    const ids = Array.from(selectedIds);
    const notes = prompt(`Reject ${ids.length} selected fees? Enter optional notes:`);
    if (notes === null) return;
    startBulkTransition(async () => {
      const result = await bulkRejectFees(ids, notes || undefined);
      if (result.success) {
        setSelectedIds(new Set());
      } else {
        alert(result.error || "Bulk reject failed");
      }
    });
  }

  return (
    <div>
      {someSelected && showActions && (
        <div
          className={`flex items-center gap-3 rounded-lg border
                      border-blue-200 bg-blue-50 px-4 py-2.5 mb-3
                      dark:bg-blue-900/20 dark:border-blue-800 ${bulkPending ? "opacity-50" : ""}`}
        >
          <span className="text-sm font-medium text-blue-800 dark:text-blue-300">
            {selectedIds.size} selected
          </span>
          <div className="h-4 w-px bg-blue-200 dark:bg-blue-700" />
          <button
            disabled={bulkPending}
            onClick={handleBulkApprove}
            className="rounded px-2.5 py-1 text-xs font-medium bg-emerald-50 text-emerald-700
                       hover:bg-emerald-100 disabled:opacity-50 dark:bg-emerald-900/20 dark:text-emerald-400 transition-colors"
          >
            Approve All
          </button>
          <button
            disabled={bulkPending}
            onClick={handleBulkReject}
            className="rounded px-2.5 py-1 text-xs font-medium bg-red-50 text-red-700
                       hover:bg-red-100 disabled:opacity-50 dark:bg-red-900/20 dark:text-red-400 transition-colors"
          >
            Reject All
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="ml-auto text-xs text-blue-500 hover:text-blue-700 dark:text-blue-400 transition-colors"
          >
            Clear
          </button>
        </div>
      )}

      <div className="admin-card overflow-hidden">
      <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-gray-50/80 text-left">
            {showActions && (
              <th className="px-3 py-2.5 w-8">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500
                             dark:border-white/20 dark:bg-[oklch(0.18_0_0)]"
                />
              </th>
            )}
            <SortHeader column="institution" label="Institution" currentSort={sortColumn} currentDir={sortDir} />
            <SortHeader column="fee_name" label="Fee Name" currentSort={sortColumn} currentDir={sortDir} />
            <SortHeader column="amount" label="Amount" currentSort={sortColumn} currentDir={sortDir} className="text-right" />
            <SortHeader column="frequency" label="Frequency" currentSort={sortColumn} currentDir={sortDir} />
            <SortHeader column="confidence" label="Confidence" currentSort={sortColumn} currentDir={sortDir} className="text-center" />
            <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Category</th>
            <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Flags</th>
            {canApprove && (
              <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">
                Actions
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {fees.map((fee) => {
            const flags = parseFlags(fee.validation_flags);
            const selected = selectedIds.has(fee.id);
            return (
              <tr
                key={fee.id}
                data-fee-row
                className={`border-b last:border-0 hover:bg-gray-50/50 transition-colors ${
                  selected ? "bg-blue-50/40 dark:bg-blue-900/10" : ""
                }`}
              >
                {showActions && (
                  <td className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleOne(fee.id)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500
                                 dark:border-white/20 dark:bg-[oklch(0.18_0_0)]"
                    />
                  </td>
                )}
                <td className="px-4 py-2.5">
                  <Link
                    href={`/admin/peers/${fee.crawl_target_id}`}
                    className="font-medium text-gray-900 hover:text-blue-600 transition-colors text-xs"
                  >
                    {fee.institution_name}
                  </Link>
                  <div className="text-[11px] text-gray-400">
                    {fee.state_code} | {fee.charter_type === "bank" ? "Bank" : "CU"}
                    {(fee.document_url || fee.fee_schedule_url) && (
                      <>
                        {" | "}
                        <a
                          href={fee.document_url || fee.fee_schedule_url || ""}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:text-blue-600 transition-colors"
                          title={fee.document_url || fee.fee_schedule_url || ""}
                        >
                          View Source
                        </a>
                      </>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <Link
                    data-detail-link
                    href={`/admin/review/${fee.id}`}
                    className="text-gray-900 hover:text-blue-600 transition-colors font-medium"
                  >
                    {fee.fee_name}
                  </Link>
                  {fee.conditions && (
                    <div className="text-[11px] text-gray-400 mt-0.5 max-w-xs truncate">
                      {fee.conditions}
                    </div>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-900">
                  {formatAmount(fee.amount)}
                </td>
                <td className="px-4 py-2.5 text-gray-600 text-xs">
                  {fee.frequency || "-"}
                </td>
                <td className="px-4 py-2.5 text-center">
                  {confidenceBadge(fee.extraction_confidence)}
                </td>
                <td className="px-4 py-2.5">
                  <CategorySelect feeId={fee.id} currentCategory={fee.fee_category} />
                </td>
                <td className="px-4 py-2.5">
                  <FlagsBadges flags={flags} />
                </td>
                {canApprove && (
                  <td className="px-4 py-2.5 text-right">
                    {showActions ? (
                      <div className="flex gap-1 justify-end">
                        <ApproveButton feeId={fee.id} />
                        <RejectButton feeId={fee.id} />
                      </div>
                    ) : (fee.review_status === "approved" || fee.review_status === "rejected") ? (
                      <div className="flex gap-1 justify-end items-center">
                        <span className="text-xs text-gray-400">{fee.review_status}</span>
                        <UnstageButton feeId={fee.id} />
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">{fee.review_status}</span>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      </div>
    </div>
  );
}

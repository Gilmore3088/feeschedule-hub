"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  bulkApproveFees,
  bulkRejectFees,
  bulkUpdateFeeCategory,
} from "@/lib/fee-actions";
import { formatAmount } from "@/lib/format";
import { getDisplayName, DISPLAY_NAMES } from "@/lib/fee-taxonomy";

interface Fee {
  id: number;
  crawl_target_id: number;
  institution_name: string;
  fee_name: string;
  amount: number | null;
  frequency: string | null;
  extraction_confidence: number | null;
  review_status: string;
  validation_flags: string | null;
  fee_category: string | null;
}

interface Props {
  category: string;
  readyFees: Fee[];
  needsReviewFees: Fee[];
  approvedFees: Fee[];
  medianAmount: number | null;
}

function ConfidenceBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="text-gray-300">--</span>;
  const pct = Math.round(value * 100);
  const color =
    pct >= 90
      ? "text-emerald-600 bg-emerald-50"
      : pct >= 70
        ? "text-amber-600 bg-amber-50"
        : "text-red-600 bg-red-50";
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${color}`}
    >
      {pct}%
    </span>
  );
}

function FlagBadges({ flags }: { flags: string | null }) {
  if (!flags || flags === "[]") return null;
  try {
    const parsed = JSON.parse(flags) as {
      rule: string;
      severity: string;
      message: string;
    }[];
    if (parsed.length === 0) return null;
    return (
      <div className="flex flex-wrap gap-1">
        {parsed.map((f, i) => (
          <span
            key={i}
            className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${
              f.severity === "error"
                ? "bg-red-50 text-red-600"
                : "bg-amber-50 text-amber-600"
            }`}
            title={f.message}
          >
            {f.rule.replace(/_/g, " ")}
          </span>
        ))}
      </div>
    );
  } catch {
    return null;
  }
}

function FeeTable({
  fees,
  selected,
  onToggle,
  onToggleAll,
  medianAmount,
}: {
  fees: Fee[];
  selected: Set<number>;
  onToggle: (id: number) => void;
  onToggleAll: () => void;
  medianAmount: number | null;
}) {
  const allSelected = fees.length > 0 && fees.every((f) => selected.has(f.id));

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="bg-gray-50/80">
            <th className="w-8 px-3 py-2">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onToggleAll}
                className="rounded border-gray-300"
              />
            </th>
            <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              Institution
            </th>
            <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              Amount
            </th>
            {medianAmount !== null && (
              <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                vs Median
              </th>
            )}
            <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              Freq
            </th>
            <th className="px-3 py-2 text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              Conf
            </th>
            <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              Flags
            </th>
            <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              Status
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {fees.map((fee) => {
            const delta =
              medianAmount && fee.amount
                ? ((fee.amount - medianAmount) / medianAmount) * 100
                : null;

            return (
              <tr
                key={fee.id}
                className={`hover:bg-gray-50/50 transition-colors ${
                  selected.has(fee.id) ? "bg-blue-50/30" : ""
                }`}
              >
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selected.has(fee.id)}
                    onChange={() => onToggle(fee.id)}
                    className="rounded border-gray-300"
                  />
                </td>
                <td className="px-3 py-2">
                  <Link
                    href={`/admin/review/${fee.id}`}
                    className="text-gray-900 hover:text-blue-600 transition-colors font-medium"
                  >
                    {fee.institution_name}
                  </Link>
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-900">
                  {formatAmount(fee.amount)}
                </td>
                {medianAmount !== null && (
                  <td className="px-3 py-2 text-right tabular-nums">
                    {delta !== null ? (
                      <span
                        className={`text-[10px] font-semibold ${
                          Math.abs(delta) < 1
                            ? "text-gray-400"
                            : delta < 0
                              ? "text-emerald-600"
                              : "text-red-600"
                        }`}
                      >
                        {delta > 0 ? "+" : ""}
                        {delta.toFixed(0)}%
                      </span>
                    ) : (
                      <span className="text-gray-300">--</span>
                    )}
                  </td>
                )}
                <td className="px-3 py-2 text-gray-500">
                  {fee.frequency ?? "--"}
                </td>
                <td className="px-3 py-2 text-center">
                  <ConfidenceBadge value={fee.extraction_confidence} />
                </td>
                <td className="px-3 py-2">
                  <FlagBadges flags={fee.validation_flags} />
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase ${
                      fee.review_status === "approved"
                        ? "bg-emerald-50 text-emerald-600"
                        : fee.review_status === "flagged"
                          ? "bg-red-50 text-red-600"
                          : fee.review_status === "staged"
                            ? "bg-amber-50 text-amber-600"
                            : "bg-gray-50 text-gray-500"
                    }`}
                  >
                    {fee.review_status}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function CategoryReviewClient({
  category,
  readyFees,
  needsReviewFees,
  approvedFees,
  medianAmount,
}: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [acting, startAction] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const [recatTarget, setRecatTarget] = useState("");

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllReady() {
    const allIds = readyFees.map((f) => f.id);
    const allSelected = allIds.every((id) => selected.has(id));
    if (allSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        allIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelected((prev) => new Set([...prev, ...allIds]));
    }
  }

  function toggleAllNeedsReview() {
    const allIds = needsReviewFees.map((f) => f.id);
    const allSelected = allIds.every((id) => selected.has(id));
    if (allSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        allIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelected((prev) => new Set([...prev, ...allIds]));
    }
  }

  function handleBulkApprove() {
    const ids = [...selected];
    if (ids.length === 0) return;
    startAction(async () => {
      const res = await bulkApproveFees(ids, `Category review: approved ${ids.length} ${getDisplayName(category)} fees`);
      setResult(res.success ? `Approved ${res.count} fees` : (res.error ?? "Error"));
      setSelected(new Set());
      router.refresh();
      setTimeout(() => setResult(null), 3000);
    });
  }

  function handleBulkReject() {
    const ids = [...selected];
    if (ids.length === 0) return;
    startAction(async () => {
      const res = await bulkRejectFees(ids, `Category review: rejected ${ids.length} ${getDisplayName(category)} fees`);
      setResult(res.success ? `Rejected ${res.count} fees` : (res.error ?? "Error"));
      setSelected(new Set());
      router.refresh();
      setTimeout(() => setResult(null), 3000);
    });
  }

  function handleBulkRecategorize() {
    if (!recatTarget || recatTarget === category) return;
    const ids = [...selected];
    if (ids.length === 0) return;
    startAction(async () => {
      const res = await bulkUpdateFeeCategory(ids, recatTarget);
      setResult(res.success ? `Moved ${res.count} fees to ${getDisplayName(recatTarget)}` : (res.error ?? "Error"));
      setSelected(new Set());
      setRecatTarget("");
      router.refresh();
      setTimeout(() => setResult(null), 3000);
    });
  }

  function handleApproveAllReady() {
    const ids = readyFees.map((f) => f.id);
    if (ids.length === 0) return;
    startAction(async () => {
      const res = await bulkApproveFees(ids, `Category review: batch approved ${ids.length} ready ${getDisplayName(category)} fees`);
      setResult(res.success ? `Approved ${res.count} fees` : (res.error ?? "Error"));
      router.refresh();
      setTimeout(() => setResult(null), 3000);
    });
  }

  const selectedCount = selected.size;

  return (
    <div className="space-y-6">
      {/* Bulk action bar */}
      {(selectedCount > 0 || result) && (
        <div className="sticky top-[57px] z-20 flex items-center gap-3 rounded-lg border border-gray-200 bg-white/95 backdrop-blur-sm px-4 py-2.5 shadow-sm">
          {selectedCount > 0 && (
            <>
              <span className="text-[12px] font-semibold text-gray-600 tabular-nums">
                {selectedCount} selected
              </span>
              <button
                onClick={handleBulkApprove}
                disabled={acting}
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                Approve
              </button>
              <button
                onClick={handleBulkReject}
                disabled={acting}
                className="rounded-md bg-red-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                Reject
              </button>
              <div className="flex items-center gap-1.5">
                <select
                  value={recatTarget}
                  onChange={(e) => setRecatTarget(e.target.value)}
                  className="rounded-md border border-gray-200 px-2 py-1.5 text-[11px] text-gray-700"
                >
                  <option value="">Move to...</option>
                  {Object.keys(DISPLAY_NAMES)
                    .filter((c) => c !== category)
                    .map((c) => (
                      <option key={c} value={c}>
                        {getDisplayName(c)}
                      </option>
                    ))}
                </select>
                {recatTarget && (
                  <button
                    onClick={handleBulkRecategorize}
                    disabled={acting}
                    className="rounded-md bg-blue-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    Move
                  </button>
                )}
              </div>
            </>
          )}
          {result && (
            <span className="text-[12px] font-medium text-emerald-600 ml-auto">
              {result}
            </span>
          )}
        </div>
      )}

      {/* Ready to approve section */}
      {readyFees.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-bold text-gray-800">
                Ready to Approve
              </h2>
              <p className="text-[11px] text-gray-400">
                High confidence, within range, no flags
              </p>
            </div>
            <button
              onClick={handleApproveAllReady}
              disabled={acting}
              className="rounded-md bg-emerald-600 px-4 py-2 text-[12px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              Approve All {readyFees.length}
            </button>
          </div>
          <FeeTable
            fees={readyFees}
            selected={selected}
            onToggle={toggle}
            onToggleAll={toggleAllReady}
            medianAmount={medianAmount}
          />
        </section>
      )}

      {/* Needs review section */}
      {needsReviewFees.length > 0 && (
        <section>
          <div className="mb-3">
            <h2 className="text-sm font-bold text-gray-800">Needs Review</h2>
            <p className="text-[11px] text-gray-400">
              Low confidence, out of range, or flagged
            </p>
          </div>
          <FeeTable
            fees={needsReviewFees}
            selected={selected}
            onToggle={toggle}
            onToggleAll={toggleAllNeedsReview}
            medianAmount={medianAmount}
          />
        </section>
      )}

      {/* Approved section (collapsed by default) */}
      {approvedFees.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-sm font-bold text-gray-500 hover:text-gray-700 transition-colors">
            Approved ({approvedFees.length})
          </summary>
          <div className="mt-3">
            <FeeTable
              fees={approvedFees}
              selected={selected}
              onToggle={toggle}
              onToggleAll={() => {}}
              medianAmount={medianAmount}
            />
          </div>
        </details>
      )}
    </div>
  );
}

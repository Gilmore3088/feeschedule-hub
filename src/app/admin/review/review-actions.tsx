"use client";

import { useState, useTransition, useCallback } from "react";
import { approveFee, rejectFee, unstageFee, bulkApproveStagedFees, bulkApproveByConfidence } from "@/lib/fee-actions";

function animateRowExit(button: HTMLElement) {
  const row = button.closest("tr");
  if (row) row.classList.add("row-exiting");
}

export function ApproveButton({ feeId }: { feeId: number }) {
  const [pending, startTransition] = useTransition();

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      startTransition(async () => {
        animateRowExit(e.currentTarget);
        const result = await approveFee(feeId);
        if (!result.success) {
          alert(result.error || "Failed to approve");
        }
      });
    },
    [feeId]
  );

  return (
    <button
      data-action="approve"
      disabled={pending}
      onClick={handleClick}
      aria-label={`Approve fee ${feeId}`}
      className="rounded px-2 py-1 text-xs font-medium bg-emerald-50 text-emerald-700
                 hover:bg-emerald-100 disabled:opacity-50 dark:bg-emerald-900/20 dark:text-emerald-400 dark:hover:bg-emerald-900/30 transition-colors"
    >
      {pending ? "..." : "Approve"}
    </button>
  );
}

export function RejectButton({ feeId }: { feeId: number }) {
  const [pending, startTransition] = useTransition();

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      startTransition(async () => {
        const notes = prompt("Rejection notes (optional):");
        animateRowExit(e.currentTarget);
        const result = await rejectFee(feeId, notes || undefined);
        if (!result.success) {
          alert(result.error || "Failed to reject");
        }
      });
    },
    [feeId]
  );

  return (
    <button
      data-action="reject"
      disabled={pending}
      onClick={handleClick}
      aria-label={`Reject fee ${feeId}`}
      className="rounded px-2 py-1 text-xs font-medium bg-red-50 text-red-700
                 hover:bg-red-100 disabled:opacity-50 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30 transition-colors"
    >
      {pending ? "..." : "Reject"}
    </button>
  );
}

export function BulkApproveButton({ count }: { count: number }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2">
      <ConfidenceBatchButton />
      <button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            if (
              !confirm(
                `Approve all ${count} staged fees? This action cannot be undone.`
              )
            ) {
              return;
            }
            const result = await bulkApproveStagedFees();
            if (result.success) {
              alert(`Approved ${result.count} fees`);
            } else {
              alert(result.error || "Failed to bulk approve");
            }
          })
        }
        className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white
                   hover:bg-emerald-700 disabled:opacity-50 dark:bg-emerald-700 dark:hover:bg-emerald-600"
      >
        {pending ? "Approving..." : `Bulk Approve All ${count}`}
      </button>
    </div>
  );
}

function ConfidenceBatchButton() {
  const [pending, startTransition] = useTransition();
  const [threshold, setThreshold] = useState(0.9);

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={threshold}
        onChange={(e) => setThreshold(parseFloat(e.target.value))}
        className="rounded border border-gray-200 dark:border-white/[0.1] bg-white dark:bg-[oklch(0.18_0_0)] px-2 py-1.5 text-xs text-gray-700 dark:text-gray-300"
      >
        <option value={0.95}>95%+</option>
        <option value={0.9}>90%+</option>
        <option value={0.85}>85%+</option>
        <option value={0.8}>80%+</option>
      </select>
      <button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            if (!confirm(`Approve all staged fees with confidence >= ${(threshold * 100).toFixed(0)}%?`)) return;
            const result = await bulkApproveByConfidence(threshold);
            if (result.success) {
              alert(`Approved ${result.count} high-confidence fees`);
            } else {
              alert(result.error || "Failed");
            }
          })
        }
        className="rounded-md border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400
                   hover:bg-emerald-100 dark:hover:bg-emerald-900/30 disabled:opacity-50 transition-colors"
      >
        {pending ? "..." : "Approve by Confidence"}
      </button>
    </div>
  );
}

export function UnstageButton({ feeId }: { feeId: number }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const notes = prompt("Why are you unstaging this fee? (required)");
          if (!notes || notes.trim().length < 3) return;
          const result = await unstageFee(feeId, notes);
          if (!result.success) {
            alert(result.error || "Failed to unstage");
          }
        })
      }
      className="rounded px-2 py-1 text-xs font-medium bg-gray-100 text-gray-600
                 hover:bg-gray-200 disabled:opacity-50 dark:bg-white/[0.08] dark:text-gray-400 dark:hover:bg-white/[0.12] transition-colors"
    >
      {pending ? "..." : "Unstage"}
    </button>
  );
}

"use client";

import { useTransition, useCallback } from "react";
import { approveFee, rejectFee, bulkApproveStagedFees } from "@/lib/fee-actions";

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
      {pending ? "Approving..." : `Bulk Approve ${count} Staged`}
    </button>
  );
}

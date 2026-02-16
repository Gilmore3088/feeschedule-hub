"use client";

import { useTransition } from "react";
import { approveFee, rejectFee, bulkApproveStagedFees } from "@/lib/fee-actions";

export function ApproveButton({ feeId }: { feeId: number }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await approveFee(feeId);
          if (!result.success) {
            alert(result.error || "Failed to approve");
          }
        })
      }
      className="rounded px-2 py-1 text-xs font-medium bg-green-100 text-green-700
                 hover:bg-green-200 disabled:opacity-50"
    >
      {pending ? "..." : "Approve"}
    </button>
  );
}

export function RejectButton({ feeId }: { feeId: number }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const notes = prompt("Rejection notes (optional):");
          const result = await rejectFee(feeId, notes || undefined);
          if (!result.success) {
            alert(result.error || "Failed to reject");
          }
        })
      }
      className="rounded px-2 py-1 text-xs font-medium bg-red-100 text-red-700
                 hover:bg-red-200 disabled:opacity-50"
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
      className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white
                 hover:bg-green-700 disabled:opacity-50"
    >
      {pending ? "Approving..." : `Bulk Approve ${count} Staged`}
    </button>
  );
}

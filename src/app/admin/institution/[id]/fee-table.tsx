"use client";

import { useState, useTransition } from "react";
import { approveFee, rejectFee, markDuplicate, approveAllFees, updateFee } from "./actions";

interface Fee {
  id: number;
  fee_name: string;
  amount: number | null;
  frequency: string | null;
  fee_category: string | null;
  account_product_type: string | null;
  extraction_confidence: number | null;
  review_status: string;
  is_fee_cap: boolean;
  conditions: string | null;
}

interface Props {
  fees: Fee[];
  institutionId: number;
}

const STATUS_STYLES: Record<string, string> = {
  approved: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  staged: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  pending: "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-400",
  flagged: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  rejected: "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400",
  duplicate: "bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400",
};

function formatAmount(amount: number | null): string {
  if (amount === null) return "varies";
  if (amount === 0) return "Free";
  return `$${amount.toFixed(2)}`;
}

export function FeeTable({ fees, institutionId }: Props) {
  const [statuses, setStatuses] = useState<Record<number, string>>({});
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function getStatus(fee: Fee): string {
    return statuses[fee.id] ?? fee.review_status;
  }

  function handleApprove(feeId: number) {
    startTransition(async () => {
      const result = await approveFee(feeId, institutionId);
      if (result.ok) setStatuses((s) => ({ ...s, [feeId]: "approved" }));
    });
  }

  function handleReject(feeId: number) {
    startTransition(async () => {
      const result = await rejectFee(feeId, institutionId);
      if (result.ok) setStatuses((s) => ({ ...s, [feeId]: "rejected" }));
    });
  }

  function handleDuplicate(feeId: number) {
    startTransition(async () => {
      const result = await markDuplicate(feeId, institutionId);
      if (result.ok) setStatuses((s) => ({ ...s, [feeId]: "duplicate" }));
    });
  }

  function handleApproveAll() {
    startTransition(async () => {
      const result = await approveAllFees(institutionId);
      if (result.ok) {
        const updated: Record<number, string> = {};
        fees.forEach((f) => {
          if (f.review_status === "staged" || f.review_status === "pending") {
            updated[f.id] = "approved";
          }
        });
        setStatuses((s) => ({ ...s, ...updated }));
        setMessage(`Approved ${result.count} fees`);
        setTimeout(() => setMessage(null), 3000);
      }
    });
  }

  function handleSaveAmount(feeId: number) {
    const amount = editAmount === "" ? null : parseFloat(editAmount);
    startTransition(async () => {
      const result = await updateFee(feeId, institutionId, { amount });
      if (result.ok) {
        setEditingId(null);
        setMessage("Updated");
        setTimeout(() => setMessage(null), 2000);
      }
    });
  }

  // Group fees by category
  const grouped = new Map<string, Fee[]>();
  fees.forEach((f) => {
    const cat = f.fee_category || "other";
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(f);
  });

  const hasStagedOrPending = fees.some(
    (f) => getStatus(f) === "staged" || getStatus(f) === "pending"
  );

  return (
    <div>
      {/* Approve All button */}
      {hasStagedOrPending && (
        <div className="px-4 py-2 border-b border-gray-100 dark:border-white/[0.04] flex items-center justify-between">
          <span className="text-xs text-gray-500">
            {fees.filter((f) => getStatus(f) === "staged" || getStatus(f) === "pending").length} fees awaiting review
          </span>
          <div className="flex items-center gap-2">
            {message && (
              <span className="text-xs text-emerald-600">{message}</span>
            )}
            <button
              onClick={handleApproveAll}
              disabled={pending}
              className="px-3 py-1.5 text-xs font-semibold rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-900/50 transition-colors disabled:opacity-50"
            >
              {pending ? "..." : "Approve All"}
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="admin-table w-full text-xs">
          <thead>
            <tr className="text-left">
              <th>Fee Name</th>
              <th className="text-right">Amount</th>
              <th>Frequency</th>
              <th>Account</th>
              <th className="text-center">Conf.</th>
              <th className="text-center">Status</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {Array.from(grouped.entries()).map(([category, categoryFees]) => (
              <>
                <tr key={`cat-${category}`}>
                  <td
                    colSpan={7}
                    className="bg-gray-50/80 dark:bg-white/[0.03] text-[10px] font-bold text-gray-400 uppercase tracking-[0.08em] py-1.5"
                  >
                    {category.replace(/_/g, " ")}
                  </td>
                </tr>
                {categoryFees.map((fee) => {
                  const status = getStatus(fee);
                  return (
                    <tr
                      key={fee.id}
                      className={`hover:bg-gray-50/50 dark:hover:bg-white/[0.04] transition-colors ${
                        status === "rejected" || status === "duplicate" ? "opacity-40" : ""
                      }`}
                    >
                      <td className="text-gray-900 dark:text-gray-100 font-medium">
                        {fee.fee_name}
                        {fee.is_fee_cap && (
                          <span className="ml-1.5 inline-block rounded px-1 py-px text-[9px] font-bold bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
                            CAP
                          </span>
                        )}
                      </td>
                      <td className="text-right tabular-nums font-medium text-gray-900 dark:text-gray-100">
                        {editingId === fee.id ? (
                          <div className="flex items-center justify-end gap-1">
                            <input
                              type="number"
                              step="0.01"
                              value={editAmount}
                              onChange={(e) => setEditAmount(e.target.value)}
                              className="w-20 px-1.5 py-0.5 text-xs text-right border border-gray-200 dark:border-white/[0.1] rounded bg-white dark:bg-white/[0.05] text-gray-900 dark:text-gray-100"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleSaveAmount(fee.id);
                                if (e.key === "Escape") setEditingId(null);
                              }}
                            />
                            <button
                              onClick={() => handleSaveAmount(fee.id)}
                              disabled={pending}
                              className="text-[10px] text-emerald-600 font-medium"
                            >
                              Save
                            </button>
                          </div>
                        ) : (
                          <span
                            className="cursor-pointer hover:text-blue-600 transition-colors"
                            onClick={() => {
                              setEditingId(fee.id);
                              setEditAmount(fee.amount?.toString() ?? "");
                            }}
                            title="Click to edit"
                          >
                            {formatAmount(fee.amount)}
                          </span>
                        )}
                      </td>
                      <td className="text-gray-500">{fee.frequency ?? "-"}</td>
                      <td>
                        {fee.account_product_type ? (
                          <span className="inline-block rounded px-1.5 py-0.5 text-[9px] font-medium bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-400">
                            {fee.account_product_type.replace(/_/g, " ")}
                          </span>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>
                      <td className="text-center tabular-nums text-gray-400">
                        {fee.extraction_confidence
                          ? `${Math.round(fee.extraction_confidence * 100)}%`
                          : "-"}
                      </td>
                      <td className="text-center">
                        <span
                          className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            STATUS_STYLES[status] ?? STATUS_STYLES.pending
                          }`}
                        >
                          {status}
                        </span>
                      </td>
                      <td className="text-right">
                        {status !== "approved" && status !== "rejected" && status !== "duplicate" && (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleApprove(fee.id)}
                              disabled={pending}
                              className="px-1.5 py-0.5 text-[10px] font-medium rounded text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors disabled:opacity-50"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleDuplicate(fee.id)}
                              disabled={pending}
                              className="px-1.5 py-0.5 text-[10px] font-medium rounded text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors disabled:opacity-50"
                            >
                              Dupe
                            </button>
                            <button
                              onClick={() => handleReject(fee.id)}
                              disabled={pending}
                              className="px-1.5 py-0.5 text-[10px] font-medium rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                            >
                              Reject
                            </button>
                          </div>
                        )}
                        {status === "approved" && (
                          <span className="text-[10px] text-gray-400">approved</span>
                        )}
                        {(status === "rejected" || status === "duplicate") && (
                          <button
                            onClick={() => handleApprove(fee.id)}
                            disabled={pending}
                            className="px-1.5 py-0.5 text-[10px] font-medium rounded text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-50"
                          >
                            Restore
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

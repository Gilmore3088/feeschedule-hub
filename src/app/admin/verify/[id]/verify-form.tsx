"use client";

import { useState, useTransition } from "react";
import { formatAmount } from "@/lib/format";
import { saveGoldStandardVerification } from "./actions";

interface FeeRow {
  id: number;
  fee_name: string;
  amount: number | null;
  fee_category: string | null;
  frequency: string | null;
  review_status: string;
}

interface Props {
  institutionId: number;
  fees: FeeRow[];
}

type Verdict = "correct" | "incorrect" | null;

export function VerifyForm({ institutionId, fees }: Props) {
  const [verdicts, setVerdicts] = useState<Record<number, Verdict>>({});
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(feeId: number, v: Verdict) {
    setVerdicts((prev) => ({
      ...prev,
      [feeId]: prev[feeId] === v ? null : v,
    }));
    setSaved(false);
  }

  const correctCount = Object.values(verdicts).filter(
    (v) => v === "correct"
  ).length;
  const incorrectCount = Object.values(verdicts).filter(
    (v) => v === "incorrect"
  ).length;
  const totalMarked = correctCount + incorrectCount;

  function handleSave() {
    if (totalMarked === 0) return;
    setError(null);
    startTransition(async () => {
      try {
        const entries = Object.entries(verdicts)
          .filter(([, v]) => v !== null)
          .map(([feeId, verdict]) => ({
            fee_id: Number(feeId),
            verdict: verdict as "correct" | "incorrect",
          }));
        await saveGoldStandardVerification(institutionId, entries);
        setSaved(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="admin-card overflow-hidden">
        <div className="px-4 py-2.5 bg-gray-50/80 border-b border-gray-200 flex items-center justify-between">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
            Extracted Fees ({fees.length})
          </span>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span>
              <span className="font-medium text-emerald-600">
                {correctCount}
              </span>{" "}
              correct
            </span>
            <span>
              <span className="font-medium text-red-600">{incorrectCount}</span>{" "}
              incorrect
            </span>
            {totalMarked > 0 && (
              <span className="font-medium tabular-nums">
                {Math.round((correctCount / totalMarked) * 100)}% accuracy
              </span>
            )}
          </div>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="px-4 py-2 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                Fee Name
              </th>
              <th className="px-4 py-2 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                Category
              </th>
              <th className="px-4 py-2 text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                Amount
              </th>
              <th className="px-4 py-2 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                Frequency
              </th>
              <th className="px-4 py-2 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-2 text-center text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                Verdict
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {fees.map((fee) => {
              const v = verdicts[fee.id] ?? null;
              return (
                <tr
                  key={fee.id}
                  className="hover:bg-gray-50/50 transition-colors"
                >
                  <td className="px-4 py-2 font-medium text-gray-900">
                    {fee.fee_name}
                  </td>
                  <td className="px-4 py-2 text-gray-500 text-xs">
                    {fee.fee_category
                      ? fee.fee_category.replace(/_/g, " ")
                      : "-"}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-700">
                    {formatAmount(fee.amount)}
                  </td>
                  <td className="px-4 py-2 text-gray-500 text-xs">
                    {fee.frequency ?? "-"}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${
                        fee.review_status === "approved"
                          ? "bg-emerald-50 text-emerald-600"
                          : fee.review_status === "staged"
                            ? "bg-blue-50 text-blue-600"
                            : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {fee.review_status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => toggle(fee.id, "correct")}
                        className={`rounded px-2 py-0.5 text-[10px] font-bold transition-colors ${
                          v === "correct"
                            ? "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300"
                            : "bg-gray-50 text-gray-400 hover:bg-emerald-50 hover:text-emerald-600"
                        }`}
                      >
                        OK
                      </button>
                      <button
                        type="button"
                        onClick={() => toggle(fee.id, "incorrect")}
                        className={`rounded px-2 py-0.5 text-[10px] font-bold transition-colors ${
                          v === "incorrect"
                            ? "bg-red-100 text-red-700 ring-1 ring-red-300"
                            : "bg-gray-50 text-gray-400 hover:bg-red-50 hover:text-red-600"
                        }`}
                      >
                        ERR
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {saved && (
        <div className="rounded border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
          Verification saved ({totalMarked} fees marked).
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          disabled={totalMarked === 0 || isPending}
          onClick={handleSave}
          className="inline-flex items-center rounded px-4 py-2 text-sm font-medium bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? "Saving..." : `Save Verification (${totalMarked} fees)`}
        </button>
      </div>
    </div>
  );
}

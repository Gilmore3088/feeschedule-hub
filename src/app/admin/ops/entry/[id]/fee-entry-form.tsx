"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FEE_FAMILIES, DISPLAY_NAMES } from "@/lib/fee-taxonomy";
import { submitManualFees } from "./actions";

interface FeeRow {
  key: number;
  category: string;
  fee_name: string;
  amount: string;
  frequency: string;
  conditions: string;
}

const FREQUENCY_OPTIONS = [
  { value: "per_occurrence", label: "Per Occurrence" },
  { value: "monthly", label: "Monthly" },
  { value: "annual", label: "Annual" },
  { value: "one_time", label: "One Time" },
  { value: "daily", label: "Daily" },
];

// Build flat list of categories grouped by family
const CATEGORY_OPTIONS = Object.entries(FEE_FAMILIES).flatMap(([family, cats]) =>
  cats.map((cat) => ({
    value: cat,
    label: DISPLAY_NAMES[cat] ?? cat,
    family,
  }))
);

const INPUT_CLASS =
  "h-8 rounded-md border border-gray-200 bg-white px-2 text-sm text-gray-700 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-300";

let nextKey = 1;

function emptyRow(): FeeRow {
  return {
    key: nextKey++,
    category: "",
    fee_name: "",
    amount: "",
    frequency: "per_occurrence",
    conditions: "",
  };
}

export function FeeEntryForm({
  targetId,
  institutionName,
  existingCategories,
}: {
  targetId: number;
  institutionName: string;
  existingCategories: string[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<FeeRow[]>([emptyRow()]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function updateRow(key: number, field: keyof FeeRow, value: string) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r;
        const updated = { ...r, [field]: value };
        // Auto-fill fee_name from category
        if (field === "category" && value) {
          updated.fee_name = DISPLAY_NAMES[value] ?? value;
        }
        return updated;
      })
    );
  }

  function removeRow(key: number) {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow()]);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const validRows = rows.filter((r) => r.category && r.amount);
    if (validRows.length === 0) {
      setError("Add at least one fee with a category and amount");
      return;
    }

    const fees = validRows.map((r) => ({
      category: r.category,
      fee_name: r.fee_name || DISPLAY_NAMES[r.category] || r.category,
      amount: parseFloat(r.amount),
      frequency: r.frequency,
      conditions: r.conditions || null,
    }));

    // Validate amounts
    for (const fee of fees) {
      if (isNaN(fee.amount) || fee.amount < 0) {
        setError(`Invalid amount for ${fee.fee_name}`);
        return;
      }
    }

    startTransition(async () => {
      try {
        await submitManualFees(targetId, fees);
        router.push(`/admin/ops?submitted=${targetId}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to submit fees");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="space-y-3">
        {rows.map((row) => {
          const isDuplicate =
            row.category && existingCategories.includes(row.category);
          return (
            <div
              key={row.key}
              className="grid grid-cols-[1fr_1fr_100px_140px_1fr_32px] gap-2 items-start"
            >
              <div>
                <select
                  value={row.category}
                  onChange={(e) => updateRow(row.key, "category", e.target.value)}
                  className={`w-full ${INPUT_CLASS}`}
                >
                  <option value="">Select category...</option>
                  {Object.entries(FEE_FAMILIES).map(([family, cats]) => (
                    <optgroup key={family} label={family}>
                      {cats.map((cat) => (
                        <option key={cat} value={cat}>
                          {DISPLAY_NAMES[cat] ?? cat}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                {isDuplicate && (
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">
                    Already exists for this institution
                  </p>
                )}
              </div>

              <input
                type="text"
                value={row.fee_name}
                onChange={(e) => updateRow(row.key, "fee_name", e.target.value)}
                placeholder="Fee name"
                className={`w-full ${INPUT_CLASS}`}
              />

              <input
                type="number"
                value={row.amount}
                onChange={(e) => updateRow(row.key, "amount", e.target.value)}
                placeholder="0.00"
                step="0.01"
                min="0"
                className={`w-full ${INPUT_CLASS} tabular-nums`}
              />

              <select
                value={row.frequency}
                onChange={(e) => updateRow(row.key, "frequency", e.target.value)}
                className={INPUT_CLASS}
              >
                {FREQUENCY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>

              <input
                type="text"
                value={row.conditions}
                onChange={(e) => updateRow(row.key, "conditions", e.target.value)}
                placeholder="Conditions (optional)"
                className={`w-full ${INPUT_CLASS}`}
              />

              <button
                type="button"
                onClick={() => removeRow(row.key)}
                className="h-8 w-8 flex items-center justify-center rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                title="Remove row"
              >
                <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3 mt-4">
        <button
          type="button"
          onClick={addRow}
          className="h-8 rounded-md border border-dashed border-gray-300 dark:border-gray-600 px-3 text-xs font-medium text-gray-500 hover:border-gray-400 hover:text-gray-700 dark:hover:border-gray-500 dark:hover:text-gray-300 transition-colors"
        >
          + Add Fee
        </button>

        <div className="flex-1" />

        {error && (
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="h-8 rounded-md bg-gray-900 dark:bg-white/10 px-4 text-xs font-medium text-white hover:bg-gray-800 dark:hover:bg-white/20 disabled:opacity-50 transition-colors"
        >
          {isPending ? "Submitting..." : `Submit ${rows.filter((r) => r.category && r.amount).length} Fee(s)`}
        </button>
      </div>
    </form>
  );
}

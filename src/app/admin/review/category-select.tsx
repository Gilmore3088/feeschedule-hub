"use client";

import { useTransition } from "react";
import { updateFeeCategory } from "@/lib/fee-actions";
import { FEE_FAMILIES, DISPLAY_NAMES } from "@/lib/fee-taxonomy";

export function CategorySelect({
  feeId,
  currentCategory,
}: {
  feeId: number;
  currentCategory: string | null;
}) {
  const [isPending, startTransition] = useTransition();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value || null;
    startTransition(async () => {
      await updateFeeCategory(feeId, value);
    });
  }

  return (
    <select
      value={currentCategory || ""}
      onChange={handleChange}
      disabled={isPending}
      className={`text-xs rounded border px-1.5 py-1 max-w-[140px] truncate transition-colors ${
        isPending
          ? "opacity-50 bg-gray-50 dark:bg-white/[0.04]"
          : currentCategory
            ? "border-gray-200 bg-white text-gray-700 dark:bg-[oklch(0.18_0_0)] dark:border-white/[0.12] dark:text-gray-300"
            : "border-amber-200 bg-amber-50/50 text-amber-600 dark:bg-amber-900/20 dark:border-amber-800/40 dark:text-amber-400"
      }`}
    >
      <option value="">-- none --</option>
      {Object.entries(FEE_FAMILIES).map(([family, categories]) => (
        <optgroup key={family} label={family}>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {DISPLAY_NAMES[cat] || cat}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

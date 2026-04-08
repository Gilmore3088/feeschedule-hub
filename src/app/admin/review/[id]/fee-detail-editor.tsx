"use client";

import { useState, useTransition } from "react";
import { InlineAmountEditor } from "../inline-amount-editor";
import { editFee, updateFeeCategory } from "@/lib/fee-actions";
import { FEE_FAMILIES, DISPLAY_NAMES, getDisplayName } from "@/lib/fee-taxonomy";

const ALL_CATEGORIES = Object.values(FEE_FAMILIES).flat();

interface FeeDetailEditorProps {
  feeId: number;
  currentAmount: number | null;
  currentCategory: string | null;
  reviewStatus: string;
}

export function FeeDetailEditor({
  feeId,
  currentAmount,
  currentCategory,
  reviewStatus,
}: FeeDetailEditorProps) {
  const isEditable =
    reviewStatus !== "approved" && reviewStatus !== "rejected";

  return (
    <div className="space-y-4">
      <AmountEditor
        feeId={feeId}
        currentAmount={currentAmount}
        disabled={!isEditable}
      />
      <CategoryEditor
        feeId={feeId}
        currentCategory={currentCategory}
        disabled={!isEditable}
      />
    </div>
  );
}

function AmountEditor({
  feeId,
  currentAmount,
  disabled,
}: {
  feeId: number;
  currentAmount: number | null;
  disabled: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSave(newAmount: number) {
    setError(null);
    startTransition(async () => {
      const result = await editFee(feeId, { amount: newAmount }, "Amount corrected via review detail");
      if (!result.success) {
        setError(result.error || "Failed to update amount");
      }
    });
  }

  return (
    <div>
      <dt className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
        Amount
        {!disabled && (
          <span className="ml-1 text-blue-400 normal-case tracking-normal font-normal">
            (click to edit)
          </span>
        )}
      </dt>
      <dd className="mt-1 text-sm tabular-nums font-semibold text-gray-900">
        <InlineAmountEditor
          currentAmount={currentAmount}
          suggestedFixes={[]}
          onSave={handleSave}
          disabled={disabled || pending}
        />
        {error && (
          <p className="mt-1 text-xs text-red-600">{error}</p>
        )}
      </dd>
    </div>
  );
}

function CategoryEditor({
  feeId,
  currentCategory,
  disabled,
}: {
  feeId: number;
  currentCategory: string | null;
  disabled: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newCategory = e.target.value || null;
    if (newCategory === currentCategory) return;
    setError(null);
    startTransition(async () => {
      const result = await updateFeeCategory(feeId, newCategory);
      if (!result.success) {
        setError(result.error || "Failed to update category");
      }
    });
  }

  // Group categories by family for the optgroup display
  const familyEntries = Object.entries(FEE_FAMILIES);

  return (
    <div>
      <dt className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
        Category
      </dt>
      <dd className="mt-1">
        <select
          value={currentCategory || ""}
          onChange={handleChange}
          disabled={disabled || pending}
          aria-label="Fee category"
          className="w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900
                     disabled:opacity-50 disabled:cursor-not-allowed
                     dark:bg-[oklch(0.18_0_0)] dark:border-white/[0.12] dark:text-gray-100
                     focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-colors"
        >
          <option value="">-- Uncategorized --</option>
          {familyEntries.map(([family, categories]) => (
            <optgroup key={family} label={family}>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {getDisplayName(cat)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {pending && (
          <p className="mt-1 text-xs text-gray-400">Saving...</p>
        )}
        {error && (
          <p className="mt-1 text-xs text-red-600">{error}</p>
        )}
      </dd>
    </div>
  );
}

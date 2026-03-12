"use client";

import { useState, useRef, useEffect } from "react";
import { formatAmount } from "@/lib/format";

interface SuggestedFix {
  label: string;
  value: number;
}

interface InlineAmountEditorProps {
  currentAmount: number | null;
  suggestedFixes: SuggestedFix[];
  onSave: (newAmount: number) => void;
  disabled?: boolean;
}

export function InlineAmountEditor({
  currentAmount,
  suggestedFixes,
  onSave,
  disabled,
}: InlineAmountEditorProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  function startEdit() {
    if (disabled) return;
    setValue(currentAmount?.toString() ?? "");
    setEditing(true);
  }

  function handleSave() {
    const num = parseFloat(value);
    if (isNaN(num) || num < 0) return;
    setEditing(false);
    onSave(num);
  }

  function handleCancel() {
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      handleCancel();
    }
  }

  function handleQuickFix(fix: SuggestedFix) {
    onSave(fix.value);
  }

  if (editing) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-1">
          <span className="text-gray-400 text-xs">$</span>
          <input
            ref={inputRef}
            type="number"
            step="0.01"
            min="0"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleCancel}
            className="w-20 rounded border border-gray-300 px-1.5 py-0.5 text-xs tabular-nums
                       dark:bg-[oklch(0.18_0_0)] dark:border-white/[0.12] dark:text-gray-100"
          />
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleSave}
            className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-emerald-50 text-emerald-700
                       hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400"
          >
            Save
          </button>
        </div>
        {suggestedFixes.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {suggestedFixes.map((fix) => (
              <button
                key={fix.label}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleQuickFix(fix)}
                className="rounded-full px-2 py-0.5 text-[10px] font-medium
                           bg-blue-50 text-blue-600 hover:bg-blue-100
                           dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/30"
              >
                {fix.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={startEdit}
      disabled={disabled}
      className="group flex items-center gap-1 tabular-nums text-gray-900 dark:text-gray-100
                 hover:text-blue-600 dark:hover:text-blue-400 transition-colors disabled:opacity-50"
      title="Click to edit amount"
    >
      {formatAmount(currentAmount)}
      <svg
        className="w-3 h-3 text-gray-300 group-hover:text-blue-400 transition-colors"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="M11.5 1.5l3 3-9 9H2.5v-3z" />
        <path d="M9.5 3.5l3 3" />
      </svg>
    </button>
  );
}

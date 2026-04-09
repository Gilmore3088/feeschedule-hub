"use client";

import { Check } from "lucide-react";

interface Props {
  disabled: boolean;
  savedScenarioId: string | null;
  onGenerate: () => void;
}

export function GenerateBoardSummaryButton({ disabled, savedScenarioId, onGenerate }: Props) {
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={onGenerate}
        disabled={disabled}
        className="flex-1 rounded-lg px-5 py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
        style={{
          background: disabled ? "var(--hamilton-text-tertiary)" : "var(--hamilton-gradient-cta)",
        }}
      >
        Generate Board Scenario Summary
      </button>
      {savedScenarioId && (
        <span
          className="flex items-center gap-1 text-xs font-medium"
          style={{ color: "var(--hamilton-accent)" }}
        >
          <Check className="h-3.5 w-3.5" />
          Saved
        </span>
      )}
    </div>
  );
}

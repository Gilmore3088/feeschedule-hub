"use client";

import { ANALYSIS_FOCUS_TABS, type AnalysisFocus } from "@/lib/hamilton/navigation";

interface AnalysisFocusTabsProps {
  activeTab: AnalysisFocus;
  onTabChange: (tab: AnalysisFocus) => void;
}

/**
 * AnalysisFocusTabs — Tab bar for switching analysis lens on the Analyze screen.
 * Tabs: Pricing | Risk | Peer Position | Trend
 * Uses ANALYSIS_FOCUS_TABS from navigation.ts as the single source of truth.
 * Active tab has a solid bottom border in Hamilton accent color.
 */
export function AnalysisFocusTabs({ activeTab, onTabChange }: AnalysisFocusTabsProps) {
  return (
    <div
      className="flex items-center gap-1 border-b"
      style={{ borderColor: "var(--hamilton-border)" }}
      role="tablist"
      aria-label="Analysis Focus"
    >
      {ANALYSIS_FOCUS_TABS.map((tab) => {
        const isActive = tab === activeTab;
        return (
          <button
            key={tab}
            role="tab"
            aria-selected={isActive}
            onClick={() => onTabChange(tab)}
            className="px-4 py-2.5 text-sm font-medium transition-colors relative"
            style={{
              color: isActive
                ? "var(--hamilton-text-primary)"
                : "var(--hamilton-text-secondary)",
              borderBottom: isActive
                ? "2px solid var(--hamilton-accent)"
                : "2px solid transparent",
              marginBottom: "-1px",
              background: "none",
              cursor: "pointer",
              outline: "none",
            }}
          >
            {tab}
          </button>
        );
      })}
    </div>
  );
}

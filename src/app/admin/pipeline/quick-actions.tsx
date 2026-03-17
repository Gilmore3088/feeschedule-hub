"use client";

import { useState } from "react";
import {
  runCrawlGaps,
  runCategorize,
  runAutoReview,
  runOutlierDetect,
  runValidate,
  runEnrich,
  runDiscover,
  runRefreshData,
  runSmartPipeline,
} from "./actions";

interface ActionButton {
  label: string;
  description: string;
  fn: () => Promise<{ success: boolean; jobId?: number; error?: string }>;
  variant?: "primary" | "secondary";
}

const ACTIONS: ActionButton[] = [
  { label: "Crawl Gaps", description: "Crawl institutions with URLs but no fees", fn: runCrawlGaps },
  { label: "Discover URLs", description: "Find fee schedule URLs for institutions", fn: () => runDiscover() },
  { label: "Categorize", description: "Map fee names to 49 categories", fn: runCategorize },
  { label: "Auto-Review", description: "Approve/reject fees by confidence + bounds", fn: runAutoReview },
  { label: "Detect Outliers", description: "Find statistical outliers + decimal errors", fn: runOutlierDetect },
  { label: "Validate", description: "Check amount bounds per category", fn: runValidate },
  { label: "Enrich", description: "Enrich institution data from federal sources", fn: runEnrich },
  { label: "Refresh Daily", description: "Refresh FRED, BLS, NY Fed, OFR data", fn: () => runRefreshData("daily") },
  { label: "Refresh Weekly", description: "Refresh weekly cadence data sources", fn: () => runRefreshData("weekly") },
];

export function QuickActions() {
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [runningLabel, setRunningLabel] = useState<string | null>(null);

  async function handleAction(action: ActionButton) {
    setRunningLabel(action.label);
    setMessage(null);
    try {
      const result = await action.fn();
      if (result.success) {
        setMessage({ type: "success", text: `${action.label}: Job #${result.jobId} started` });
      } else {
        setMessage({ type: "error", text: `${action.label}: ${result.error}` });
      }
    } catch (e) {
      setMessage({ type: "error", text: String(e) });
    }
    setRunningLabel(null);
  }

  async function handleFullPipeline() {
    setRunningLabel("Full Pipeline");
    setMessage(null);
    try {
      const result = await runSmartPipeline();
      if (result.success) {
        setMessage({ type: "success", text: `Full Pipeline: Job #${result.jobId} started` });
      } else {
        setMessage({ type: "error", text: `Full Pipeline: ${result.error}` });
      }
    } catch (e) {
      setMessage({ type: "error", text: String(e) });
    }
    setRunningLabel(null);
  }

  return (
    <div className="admin-card overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-200 dark:border-white/[0.06] flex items-center justify-between">
        <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
          Quick Actions
        </h3>
        <div className="flex items-center gap-2">
          {message && (
            <span className={`text-[11px] ${message.type === "success" ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
              {message.text}
            </span>
          )}
          <button
            onClick={handleFullPipeline}
            disabled={runningLabel !== null}
            className="rounded-md bg-gray-900 dark:bg-white/[0.1] px-3 py-1 text-[10px] font-semibold text-white hover:bg-gray-800 dark:hover:bg-white/[0.15] disabled:opacity-40 transition-colors"
          >
            {runningLabel === "Full Pipeline" ? "Running..." : "Run Full Pipeline"}
          </button>
        </div>
      </div>
      <div className="p-4">
        <div className="flex flex-wrap gap-2">
          {ACTIONS.map((action) => (
            <button
              key={action.label}
              onClick={() => handleAction(action)}
              disabled={runningLabel !== null}
              title={action.description}
              className="rounded-md border border-gray-200 dark:border-white/[0.1] px-3 py-1.5 text-[11px] font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.06] hover:border-gray-400 dark:hover:border-white/[0.2] disabled:opacity-40 transition-colors"
            >
              {runningLabel === action.label ? "Running..." : action.label}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-gray-400 mt-2">
          Each command runs independently. For the recommended full sequence (categorize, validate, outlier-detect, auto-review), use Run Full Pipeline.
        </p>
      </div>
    </div>
  );
}

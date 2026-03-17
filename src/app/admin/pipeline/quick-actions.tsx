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

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC","PR","GU","VI",
];

interface ActionButton {
  label: string;
  description: string;
  fn: () => Promise<{ success: boolean; jobId?: number; error?: string }>;
}

export function QuickActions() {
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [runningLabel, setRunningLabel] = useState<string | null>(null);
  const [discoverState, setDiscoverState] = useState("");

  const actions: ActionButton[] = [
    { label: "Crawl Gaps", description: "Crawl institutions with URLs but no fees", fn: runCrawlGaps },
    { label: "Categorize", description: "Map fee names to 49 categories", fn: runCategorize },
    { label: "Auto-Review", description: "Approve/reject fees by confidence + bounds", fn: runAutoReview },
    { label: "Detect Outliers", description: "Find statistical outliers + decimal errors", fn: runOutlierDetect },
    { label: "Validate", description: "Check amount bounds per category", fn: runValidate },
    { label: "Enrich", description: "Enrich institution data from federal sources", fn: runEnrich },
    { label: "Refresh Daily", description: "Refresh FRED, BLS, NY Fed, OFR data", fn: () => runRefreshData("daily") },
    { label: "Refresh Weekly", description: "Refresh weekly cadence data sources", fn: () => runRefreshData("weekly") },
  ];

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

  async function handleDiscover() {
    setRunningLabel("Discover");
    setMessage(null);
    try {
      const result = await runDiscover(discoverState || undefined);
      if (result.success) {
        const scope = discoverState ? `${discoverState} institutions` : "all states (limit 200)";
        setMessage({ type: "success", text: `Discover ${scope}: Job #${result.jobId} started` });
      } else {
        setMessage({ type: "error", text: `Discover: ${result.error}` });
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
            <span className={`text-[11px] max-w-[400px] truncate ${message.type === "success" ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
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
        {/* Discover row with state selector */}
        <div className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-100 dark:border-white/[0.04]">
          <span className="text-[11px] font-medium text-gray-600 dark:text-gray-400 w-20 shrink-0">Discover</span>
          <select
            value={discoverState}
            onChange={(e) => setDiscoverState(e.target.value)}
            className="rounded-md border border-gray-200 dark:border-white/[0.1] bg-white dark:bg-[oklch(0.18_0_0)] px-2 py-1 text-[11px] text-gray-700 dark:text-gray-300"
          >
            <option value="">All states (200 max)</option>
            {US_STATES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <button
            onClick={handleDiscover}
            disabled={runningLabel !== null}
            title={discoverState ? `Find fee schedule URLs for all ${discoverState} institutions` : "Find fee schedule URLs (200 institutions)"}
            className="rounded-md border border-gray-200 dark:border-white/[0.1] px-3 py-1 text-[11px] font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.06] hover:border-gray-400 dark:hover:border-white/[0.2] disabled:opacity-40 transition-colors"
          >
            {runningLabel === "Discover" ? "Running..." : discoverState ? `Discover ${discoverState}` : "Discover URLs"}
          </button>
          <span className="text-[10px] text-gray-400">
            {discoverState ? `All institutions in ${discoverState} without fee URLs` : "Largest 200 institutions without fee URLs"}
          </span>
        </div>

        {/* Other action buttons */}
        <div className="flex flex-wrap gap-2">
          {actions.map((action) => (
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

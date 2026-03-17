"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { triggerJob, cancelOpsJob } from "./actions";
import type { OpsJob, OpsJobSummary } from "@/lib/crawler-db/ops";
import type { CrawlStats } from "@/lib/crawler-db/types";
import { timeAgo } from "@/lib/format";

const STATUS_COLORS: Record<string, string> = {
  running: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  queued: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  failed: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  cancelled: "bg-gray-100 text-gray-500 dark:bg-white/[0.08] dark:text-gray-400",
};

interface CommandInfo {
  description: string;
  detail: string;
  group: "pipeline" | "data-quality" | "ingest" | "setup";
  usesLimit: boolean;
  usesCharter: boolean;
  usesState?: boolean;
  typical: string;
}

const COMMAND_INFO: Record<string, CommandInfo> = {
  "run-pipeline": {
    description: "Run Full Pipeline",
    detail: "Runs discover + crawl + categorize in sequence. This is the main command for collecting new fee data end-to-end.",
    group: "pipeline",
    usesLimit: true,
    usesCharter: true,
    usesState: true,
    typical: "python -m fee_crawler run-pipeline --limit 50",
  },
  crawl: {
    description: "Crawl & Extract Fees",
    detail: "Downloads fee schedule pages from institutions that already have a known URL, then uses LLM extraction to pull out individual fees and amounts.",
    group: "pipeline",
    usesLimit: true,
    usesCharter: true,
    usesState: true,
    typical: "python -m fee_crawler crawl --limit 20",
  },
  discover: {
    description: "Discover Fee URLs",
    detail: "Searches institution websites to find their fee schedule page. Tries common paths (/fees, /disclosures, etc.), sitemaps, and Google site: search.",
    group: "pipeline",
    usesLimit: true,
    usesCharter: true,
    usesState: true,
    typical: "python -m fee_crawler discover --limit 50",
  },
  categorize: {
    description: "Categorize Fees",
    detail: "Maps extracted fee names to the 49-category taxonomy using alias matching (e.g., 'Monthly Service Charge' → monthly_maintenance). Fast, no API calls.",
    group: "data-quality",
    usesLimit: false,
    usesCharter: false,
    typical: "python -m fee_crawler categorize",
  },
  validate: {
    description: "Validate Fees",
    detail: "Re-runs validation rules on existing fees: amount bounds checking, frequency detection, duplicate detection, and confidence scoring.",
    group: "data-quality",
    usesLimit: false,
    usesCharter: false,
    typical: "python -m fee_crawler validate",
  },
  analyze: {
    description: "Compute Analysis",
    detail: "Builds peer comparison reports and fee summary statistics per institution. Results power the dashboard and peer analysis pages.",
    group: "data-quality",
    usesLimit: false,
    usesCharter: false,
    typical: "python -m fee_crawler analyze",
  },
  "outlier-detect": {
    description: "Detect Outliers",
    detail: "Flags fees with amounts that are statistical outliers within their category (e.g., $500 overdraft fee). Uses IQR and z-score methods.",
    group: "data-quality",
    usesLimit: false,
    usesCharter: false,
    typical: "python -m fee_crawler outlier-detect",
  },
  enrich: {
    description: "Enrich Institutions",
    detail: "Backfills asset_size_tier, fed_district, and fixes NCUA asset units (thousands vs actual). Run after seeding new institutions.",
    group: "data-quality",
    usesLimit: false,
    usesCharter: false,
    typical: "python -m fee_crawler enrich",
  },
  "ingest-fdic": {
    description: "Ingest FDIC Data",
    detail: "Pulls financial data (assets, deposits, income) from FDIC API for all bank institutions. Updates institution_financials table.",
    group: "ingest",
    usesLimit: false,
    usesCharter: false,
    typical: "python -m fee_crawler ingest-fdic",
  },
  "ingest-ncua": {
    description: "Ingest NCUA Data",
    detail: "Pulls 5300 Call Report data from NCUA for credit unions. Updates institution_financials table.",
    group: "ingest",
    usesLimit: false,
    usesCharter: false,
    typical: "python -m fee_crawler ingest-ncua",
  },
  "ingest-cfpb": {
    description: "Ingest CFPB Complaints",
    detail: "Pulls consumer complaint data from CFPB API, aggregated by institution and product. Updates institution_complaints table.",
    group: "ingest",
    usesLimit: false,
    usesCharter: false,
    typical: "python -m fee_crawler ingest-cfpb",
  },
  "ingest-call-reports": {
    description: "Ingest Call Reports",
    detail: "Pulls service charge revenue data from Call Reports for coverage gap analysis. Shows how much fee revenue each bank earns.",
    group: "ingest",
    usesLimit: false,
    usesCharter: false,
    typical: "python -m fee_crawler ingest-call-reports",
  },
  "ingest-beige-book": {
    description: "Ingest Beige Book",
    detail: "Downloads and stores Federal Reserve Beige Book reports by district. Powers the Fed District commentary pages.",
    group: "ingest",
    usesLimit: false,
    usesCharter: false,
    typical: "python -m fee_crawler ingest-beige-book",
  },
  "ingest-fed-content": {
    description: "Ingest Fed Content",
    detail: "Pulls recent Fed speeches, research papers, and publications from RSS feeds. Powers the Fed in Print section.",
    group: "ingest",
    usesLimit: false,
    usesCharter: false,
    typical: "python -m fee_crawler ingest-fed-content",
  },
  "ingest-fred": {
    description: "Ingest FRED Data",
    detail: "Pulls economic indicators (CPI, unemployment, interest rates) from FRED API by district. Powers district economic context.",
    group: "ingest",
    usesLimit: false,
    usesCharter: false,
    typical: "python -m fee_crawler ingest-fred",
  },
  "ingest-bls": {
    description: "Ingest BLS CPI Data",
    detail: "Pulls Consumer Price Index data from BLS API, including bank services CPI (CUUR0000SEMC01) and regional breakdowns. Powers fee inflation analysis.",
    group: "ingest",
    usesLimit: false,
    usesCharter: false,
    typical: "python -m fee_crawler ingest-bls",
  },
  "ingest-nyfed": {
    description: "Ingest NY Fed Rates",
    detail: "Pulls daily reference rates (SOFR, EFFR, OBFR) from NY Fed Markets API. Provides interest rate context for fee trend analysis.",
    group: "ingest",
    usesLimit: false,
    usesCharter: false,
    typical: "python -m fee_crawler ingest-nyfed",
  },
  "refresh-data": {
    description: "Refresh All Data",
    detail: "Orchestrates all 12 data ingestion sources in dependency order. Use --cadence daily|weekly|quarterly|annual to run a subset.",
    group: "ingest",
    usesLimit: false,
    usesCharter: false,
    typical: "python -m fee_crawler refresh-data --cadence daily",
  },
  "ingest-ofr": {
    description: "Ingest OFR Stress Index",
    detail: "Pulls daily Financial Stress Index from OFR (composite + 4 sub-indices). Positive = elevated stress, negative = calm. Context for fee trend analysis.",
    group: "ingest",
    usesLimit: false,
    usesCharter: false,
    typical: "python -m fee_crawler ingest-ofr",
  },
  "ingest-sod": {
    description: "Ingest Summary of Deposits",
    detail: "Pulls branch-level deposit data from FDIC SOD API. Computes HHI market concentration per MSA. Powers fee pricing power analysis.",
    group: "ingest",
    usesLimit: true,
    usesCharter: false,
    typical: "python -m fee_crawler ingest-sod --year 2024",
  },
  "ingest-census-acs": {
    description: "Ingest Census Demographics",
    detail: "Pulls median income, poverty, and population from Census ACS at county level. Powers fee burden analysis (fees as % of income).",
    group: "ingest",
    usesLimit: false,
    usesCharter: false,
    typical: "python -m fee_crawler ingest-census-acs",
  },
  "ingest-census-tracts": {
    description: "Ingest Census Tract Income",
    detail: "Ingests FFIEC tract income classifications (low/moderate/middle/upper). Enables CRA-style fee equity analysis by community income level.",
    group: "ingest",
    usesLimit: false,
    usesCharter: false,
    typical: "python -m fee_crawler ingest-census-tracts",
  },
  snapshot: {
    description: "Snapshot Fees",
    detail: "Copies current approved+staged fees to fee_snapshots table and detects price changes since the last snapshot. Creates fee_change_events for any increases or decreases. Run periodically to build trend data.",
    group: "data-quality",
    usesLimit: false,
    usesCharter: false,
    typical: "python -m fee_crawler snapshot",
  },
  seed: {
    description: "Seed Institutions",
    detail: "Loads institution directory from FDIC and NCUA bulk data files. Only needed when setting up or expanding the institution list.",
    group: "setup",
    usesLimit: true,
    usesCharter: true,
    typical: "python -m fee_crawler seed --limit 100",
  },
  "backfill-ncua-urls": {
    description: "Backfill NCUA URLs",
    detail: "Fills in missing website URLs for NCUA credit unions using the NCUA API. Run after seeding to improve discover success rate.",
    group: "setup",
    usesLimit: false,
    usesCharter: false,
    typical: "python -m fee_crawler backfill-ncua-urls",
  },
  stats: {
    description: "Show Stats",
    detail: "Prints database statistics to the log (institution counts, fee counts, coverage). Quick health check, no data changes.",
    group: "setup",
    usesLimit: false,
    usesCharter: false,
    typical: "python -m fee_crawler stats",
  },
  "merge-fees": {
    description: "Merge Fees",
    detail: "Re-merges extracted fees with existing data. Compares by category, snapshots old values, records change events. Useful after updating categorization rules.",
    group: "data-quality",
    usesLimit: false,
    usesCharter: false,
    typical: "python -m fee_crawler merge-fees",
  },
  "publish-index": {
    description: "Publish Index",
    detail: "Materializes the fee index cache (49 categories), updates coverage snapshot, revalidates Next.js cache, runs DB maintenance (PRAGMA optimize + WAL checkpoint).",
    group: "data-quality",
    usesLimit: false,
    usesCharter: false,
    typical: "python -m fee_crawler publish-index",
  },
  pipeline: {
    description: "Atomic Pipeline (v2)",
    detail: "Runs the full 9-stage atomic pipeline with resume support: seed-enrich, discover, crawl, merge-fees, categorize, validate, auto-review, snapshot, publish-index. Use --state to target a specific state.",
    group: "pipeline",
    usesLimit: true,
    usesCharter: false,
    usesState: true,
    typical: "python -m fee_crawler pipeline --limit 100 --state CA",
  },
};

const GROUP_LABELS: Record<string, string> = {
  pipeline: "Pipeline",
  "data-quality": "Data Quality",
  ingest: "Data Ingestion",
  setup: "Setup & Maintenance",
};

interface OpsClientProps {
  summary: OpsJobSummary;
  activeJobs: OpsJob[];
  recentJobs: OpsJob[];
  crawlStats: CrawlStats;
  commands: string[];
  username: string;
}

export function OpsClient({
  summary: initialSummary,
  activeJobs: initialActive,
  recentJobs: initialRecent,
  crawlStats,
  commands,
}: OpsClientProps) {
  const [summary, setSummary] = useState(initialSummary);
  const [activeJobs, setActiveJobs] = useState(initialActive);
  const [recentJobs, setRecentJobs] = useState(initialRecent);
  const [selectedCommand, setSelectedCommand] = useState(commands[0] || "");
  const [limit, setLimit] = useState("10");
  const [charterType, setCharterType] = useState<"" | "bank" | "credit_union">("");
  const [stateCode, setStateCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [expandedJob, setExpandedJob] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/admin/ops/api");
      if (res.ok) {
        const data = await res.json();
        setSummary(data.summary);
        setActiveJobs(data.activeJobs);
        setRecentJobs(data.recentJobs);
      }
    } catch {
      // Silently fail on poll errors
    }
  }, []);

  useEffect(() => {
    if (activeJobs.length === 0) return;
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, [activeJobs.length, refresh]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage(null);

    const params: Record<string, unknown> = {};
    const cmd = selectedCommand;

    // User-controlled limit (blank = no limit = process all)
    const cmdInfo = COMMAND_INFO[cmd];
    const parsedLimit = parseInt(limit, 10);
    if (cmdInfo?.usesLimit && parsedLimit > 0) {
      params.limit = parsedLimit;
    }

    if (charterType) params.charter_type = charterType;
    if (stateCode) params.state = stateCode;

    // Smart defaults for pipeline commands
    if (cmd === "crawl" || cmd === "run-pipeline") {
      params.skip_with_fees = true;
    }

    const result = await triggerJob(selectedCommand, params);

    if (result.success) {
      setMessage({ type: "success", text: `Job #${result.jobId} started` });
      await refresh();
    } else {
      setMessage({ type: "error", text: result.error || "Failed to start job" });
    }
    setIsSubmitting(false);
  }

  async function handleCancel(jobId: number) {
    const result = await cancelOpsJob(jobId);
    if (result.success) {
      setMessage({ type: "success", text: `Job #${jobId} cancelled` });
      await refresh();
    } else {
      setMessage({ type: "error", text: result.error || "Failed to cancel" });
    }
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {([
          ["Total", summary.total, "text-gray-900 dark:text-gray-100"],
          ["Running", summary.running, "text-blue-600 dark:text-blue-400"],
          ["Queued", summary.queued, "text-amber-600 dark:text-amber-400"],
          ["Completed", summary.completed, "text-emerald-600 dark:text-emerald-400"],
          ["Failed", summary.failed, "text-red-600 dark:text-red-400"],
        ] as const).map(([label, value, color]) => (
          <div key={label} className="admin-card px-4 py-3">
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              {label}
            </div>
            <div className={`text-lg font-bold tabular-nums ${color}`}>
              {value}
            </div>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Trigger form */}
        <div className="admin-card p-4">
          <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-3">
            Trigger Job
          </h2>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Command
              </label>
              <select
                value={selectedCommand}
                onChange={(e) => setSelectedCommand(e.target.value)}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm
                           dark:bg-[oklch(0.18_0_0)] dark:border-white/[0.12] dark:text-gray-100"
              >
                {(["pipeline", "data-quality", "ingest", "setup"] as const).map((group) => {
                  const groupCmds = commands.filter((c) => COMMAND_INFO[c]?.group === group);
                  if (groupCmds.length === 0) return null;
                  return (
                    <optgroup key={group} label={GROUP_LABELS[group]}>
                      {groupCmds.map((cmd) => (
                        <option key={cmd} value={cmd}>
                          {COMMAND_INFO[cmd]?.description || cmd}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </div>

            {/* Command detail card */}
            {COMMAND_INFO[selectedCommand] && (
              <div className="rounded-md border border-gray-200 dark:border-white/[0.08] px-3 py-2.5 space-y-2">
                <div className="flex items-start gap-2">
                  <span className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                    COMMAND_INFO[selectedCommand].group === "pipeline"
                      ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                      : COMMAND_INFO[selectedCommand].group === "data-quality"
                        ? "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
                        : COMMAND_INFO[selectedCommand].group === "ingest"
                          ? "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400"
                          : "bg-gray-100 text-gray-500 dark:bg-white/[0.08] dark:text-gray-400"
                  }`}>
                    {GROUP_LABELS[COMMAND_INFO[selectedCommand].group]}
                  </span>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                  {COMMAND_INFO[selectedCommand].detail}
                </p>
              </div>
            )}

            {/* Filters - only show relevant ones */}
            {(COMMAND_INFO[selectedCommand]?.usesLimit || COMMAND_INFO[selectedCommand]?.usesCharter || COMMAND_INFO[selectedCommand]?.usesState) && (
              <div className="grid grid-cols-3 gap-3">
                {COMMAND_INFO[selectedCommand]?.usesLimit && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Limit
                    </label>
                    <input
                      type="number"
                      value={limit}
                      onChange={(e) => setLimit(e.target.value)}
                      placeholder="No limit"
                      min={0}
                      max={500}
                      className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm
                                 dark:bg-[oklch(0.18_0_0)] dark:border-white/[0.12] dark:text-gray-100"
                    />
                    <p className="text-[10px] text-gray-400 mt-0.5">0 or blank = no limit</p>
                  </div>
                )}
                {COMMAND_INFO[selectedCommand]?.usesCharter && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Charter Type
                    </label>
                    <select
                      value={charterType}
                      onChange={(e) => setCharterType(e.target.value as "" | "bank" | "credit_union")}
                      className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm
                                 dark:bg-[oklch(0.18_0_0)] dark:border-white/[0.12] dark:text-gray-100"
                    >
                      <option value="">All</option>
                      <option value="bank">Banks</option>
                      <option value="credit_union">Credit Unions</option>
                    </select>
                  </div>
                )}
                {COMMAND_INFO[selectedCommand]?.usesState && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      State
                    </label>
                    <select
                      value={stateCode}
                      onChange={(e) => setStateCode(e.target.value)}
                      className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm
                                 dark:bg-[oklch(0.18_0_0)] dark:border-white/[0.12] dark:text-gray-100"
                    >
                      <option value="">All States</option>
                      {["AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"].map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            {/* Command preview */}
            <div className="rounded-md bg-gray-900 dark:bg-gray-950 px-3 py-2">
              <div className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                Will execute
              </div>
              <code className="text-[11px] text-emerald-400 font-mono">
                python -m fee_crawler {selectedCommand}
                {COMMAND_INFO[selectedCommand]?.usesLimit && parseInt(limit, 10) > 0 ? ` --limit ${limit}` : ""}
                {charterType && selectedCommand === "discover" ? ` --source ${charterType === "bank" ? "fdic" : "ncua"}` : ""}
                {stateCode ? ` --state ${stateCode}` : ""}
              </code>
            </div>

            {message && (
              <div
                className={`rounded-md px-3 py-2 text-sm ${
                  message.type === "success"
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"
                    : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"
                }`}
              >
                {message.text}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white
                         hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed
                         dark:bg-white/10 dark:hover:bg-white/15"
            >
              {isSubmitting ? "Starting..." : `Run ${COMMAND_INFO[selectedCommand]?.description || selectedCommand}`}
            </button>
          </form>
        </div>

        {/* Active jobs */}
        <div className="admin-card p-4">
          <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-3">
            Active Jobs
            {activeJobs.length > 0 && (
              <span className="ml-2 inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            )}
          </h2>
          {activeJobs.length === 0 ? (
            <p className="text-sm text-gray-400">No active jobs</p>
          ) : (
            <div className="space-y-3">
              {activeJobs.map((job) => {
                const elapsed = (job as unknown as { elapsed_seconds?: number }).elapsed_seconds || 0;
                const liveLog = (job as unknown as { live_log?: string }).live_log || "";
                const mins = Math.floor(elapsed / 60);
                const secs = elapsed % 60;
                const elapsedStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

                return (
                  <div
                    key={job.id}
                    className="rounded-md border border-gray-200 dark:border-white/[0.08] overflow-hidden"
                  >
                    <div className="flex items-center gap-3 px-3 py-2">
                      <StatusBadge status={job.status} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {job.command}
                        </div>
                        <div className="text-[11px] text-gray-400">
                          #{job.id} by {job.triggered_by}
                          {" "}&middot;{" "}
                          <span className="font-medium text-blue-500 tabular-nums">{elapsedStr}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleCancel(job.id)}
                        className="text-xs text-red-500 hover:text-red-700 font-medium"
                      >
                        Cancel
                      </button>
                    </div>
                    {/* Live log output */}
                    {liveLog && (
                      <div className="border-t border-gray-100 dark:border-white/[0.06] bg-gray-950 px-3 py-2 max-h-[200px] overflow-y-auto">
                        <pre className="text-[10px] text-gray-400 font-mono whitespace-pre-wrap leading-relaxed">
                          {liveLog}
                        </pre>
                      </div>
                    )}
                    {!liveLog && elapsed > 2 && (
                      <div className="border-t border-gray-100 dark:border-white/[0.06] bg-gray-950 px-3 py-2">
                        <p className="text-[10px] text-gray-600 font-mono">Waiting for output...</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-4 pt-3 border-t dark:border-white/[0.08]">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              System
            </h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-gray-400">Institutions:</span>{" "}
                <span className="font-medium text-gray-700 dark:text-gray-300 tabular-nums">
                  {crawlStats.total_institutions.toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-gray-400">Fee URLs:</span>{" "}
                <span className="font-medium text-gray-700 dark:text-gray-300 tabular-nums">
                  {crawlStats.with_fee_url.toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-gray-400">Fees:</span>{" "}
                <span className="font-medium text-gray-700 dark:text-gray-300 tabular-nums">
                  {crawlStats.total_fees.toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-gray-400">Crawl Runs:</span>{" "}
                <span className="font-medium text-gray-700 dark:text-gray-300 tabular-nums">
                  {crawlStats.crawl_runs.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent jobs table */}
      <div className="admin-card overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50/80 dark:bg-white/[0.03]">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Recent Jobs
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                <th className="px-4 py-2.5">ID</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Command</th>
                <th className="px-4 py-2.5">Triggered By</th>
                <th className="px-4 py-2.5">Started</th>
                <th className="px-4 py-2.5">Duration</th>
                <th className="px-4 py-2.5 text-right">Exit</th>
                <th className="px-4 py-2.5 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {recentJobs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                    No jobs yet. Trigger one above.
                  </td>
                </tr>
              ) : (
                recentJobs.map((job) => (
                  <Fragment key={job.id}>
                    <tr
                      className="border-b hover:bg-gray-50/50 dark:hover:bg-white/[0.02] cursor-pointer transition-colors"
                      onClick={() => setExpandedJob(expandedJob === job.id ? null : job.id)}
                    >
                      <td className="px-4 py-2.5 tabular-nums text-gray-500">
                        #{job.id}
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusBadge status={job.status} />
                      </td>
                      <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-gray-100">
                        {job.command}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500">
                        {job.triggered_by}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 tabular-nums">
                        {job.started_at ? timeAgo(job.started_at) : "-"}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 tabular-nums">
                        {formatDuration(job.started_at, job.completed_at)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {job.exit_code !== null ? (
                          <span
                            className={
                              job.exit_code === 0
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-red-600 dark:text-red-400"
                            }
                          >
                            {job.exit_code}
                          </span>
                        ) : (
                          <span className="text-gray-300 dark:text-gray-600">-</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-gray-400">
                        <svg
                          className={`w-3.5 h-3.5 transition-transform ${expandedJob === job.id ? "rotate-90" : ""}`}
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M6 4l4 4-4 4" />
                        </svg>
                      </td>
                    </tr>
                    {expandedJob === job.id && (
                      <tr key={`${job.id}-detail`} className="border-b bg-gray-50/50 dark:bg-white/[0.02]">
                        <td colSpan={8} className="px-4 py-3">
                          <JobDetail job={job} onCancel={handleCancel} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
        STATUS_COLORS[status] || "bg-gray-100 text-gray-500"
      }`}
    >
      {status}
    </span>
  );
}

function JobDetail({ job, onCancel }: { job: OpsJob; onCancel: (id: number) => void }) {
  const params = (() => {
    try {
      return JSON.parse(job.params_json);
    } catch {
      return {};
    }
  })();

  return (
    <div className="space-y-3 text-xs">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <span className="text-gray-400">PID:</span>{" "}
          <span className="font-mono text-gray-600 dark:text-gray-300">{job.pid ?? "-"}</span>
        </div>
        <div>
          <span className="text-gray-400">Target ID:</span>{" "}
          <span className="tabular-nums text-gray-600 dark:text-gray-300">{job.target_id ?? "-"}</span>
        </div>
        <div>
          <span className="text-gray-400">Created:</span>{" "}
          <span className="text-gray-600 dark:text-gray-300">{job.created_at}</span>
        </div>
        <div>
          <span className="text-gray-400">Params:</span>{" "}
          <span className="font-mono text-gray-600 dark:text-gray-300">
            {params.args?.join(" ") || "none"}
          </span>
        </div>
      </div>

      {job.error_summary && (
        <div className="rounded-md bg-red-50 dark:bg-red-900/10 px-3 py-2">
          <div className="text-[10px] font-semibold text-red-500 uppercase tracking-wider mb-1">
            Error
          </div>
          <pre className="text-red-700 dark:text-red-400 whitespace-pre-wrap font-mono text-[11px]">
            {job.error_summary}
          </pre>
        </div>
      )}

      {job.stdout_tail && (
        <div>
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
            Log Tail
          </div>
          <pre className="rounded-md bg-gray-900 text-gray-300 px-3 py-2 font-mono text-[11px] max-h-48 overflow-y-auto whitespace-pre-wrap">
            {job.stdout_tail}
          </pre>
        </div>
      )}

      {(job.status === "running" || job.status === "queued") && (
        <button
          onClick={() => onCancel(job.id)}
          className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600
                     hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
        >
          Cancel Job
        </button>
      )}
    </div>
  );
}

function formatDuration(start: string | null, end: string | null): string {
  if (!start) return "-";
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const diffMs = e - s;
  if (diffMs < 1000) return "<1s";
  const secs = Math.floor(diffMs / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remainSecs = secs % 60;
  if (mins < 60) return `${mins}m ${remainSecs}s`;
  const hours = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return `${hours}h ${remainMins}m`;
}

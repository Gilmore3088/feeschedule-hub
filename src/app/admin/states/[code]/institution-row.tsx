"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { JobLaunchReceipt } from "@/components/agent-console/job-launch-receipt";
import { triggerAgentRunExecution } from "@/lib/agents/client-execution";
import { setFeeScheduleUrl, markOffline, triggerExtract } from "./actions";
import { formatAssets } from "@/lib/format";

interface Props {
  id: number;
  institution_name: string;
  city: string | null;
  charter_type: string | null;
  asset_size_tier: string | null;
  fee_schedule_url: string | null;
  document_type: string | null;
  fee_count: number;
  last_crawled: string;
  assetSize?: number | null;
}

function truncateUrl(url: string, maxLen = 35): string {
  try {
    const parsed = new URL(url);
    const display = parsed.hostname + parsed.pathname;
    return display.length > maxLen ? display.slice(0, maxLen) + "..." : display;
  } catch {
    return url.length > maxLen ? url.slice(0, maxLen) + "..." : url;
  }
}

function statusBadge(
  feeUrl: string | null,
  docType: string | null,
  feeCount: number
): { label: string; cls: string } {
  if (docType === "offline")
    return { label: "Offline", cls: "bg-gray-100 text-gray-500 dark:bg-white/[0.06] dark:text-gray-400" };
  if (feeCount > 0)
    return { label: `${feeCount} fees`, cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" };
  if (feeUrl)
    return { label: "URL only", cls: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" };
  return { label: "No data", cls: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400" };
}

export function InstitutionRow({
  id,
  institution_name,
  city,
  charter_type,
  fee_schedule_url,
  document_type,
  fee_count,
  last_crawled,
  assetSize,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState(fee_schedule_url || "");
  const [feedback, setFeedback] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [queuedJob, setQueuedJob] = useState<{ id: number; reused: boolean } | null>(null);
  const [pending, startTransition] = useTransition();
  const [currentUrl, setCurrentUrl] = useState(fee_schedule_url);
  const [currentDocType, setCurrentDocType] = useState(document_type);

  function handleSaveUrl() {
    if (!url.trim()) return;
    setFeedback(null);
    setQueuedJob(null);
    startTransition(async () => {
      const result = await setFeeScheduleUrl(id, url.trim());
      if (result.error) {
        setFeedback({ type: "error", text: result.error });
      } else {
        setCurrentUrl(url.trim());
        setCurrentDocType(null);
        setFeedback({ type: "success", text: "URL saved. Extract next." });
        setEditing(false);
        setTimeout(() => setFeedback(null), 3000);
      }
    });
  }

  function handleMarkOffline() {
    setFeedback(null);
    setQueuedJob(null);
    startTransition(async () => {
      const result = await markOffline(id);
      if (result.error) {
        setFeedback({ type: "error", text: result.error });
      } else {
        setCurrentUrl(null);
        setCurrentDocType("offline");
        setFeedback({ type: "success", text: "Marked offline" });
        setTimeout(() => setFeedback(null), 3000);
      }
    });
  }

  function handleExtract() {
    if (!currentUrl) {
      setFeedback({ type: "error", text: "Set a fee URL first" });
      return;
    }
    setFeedback({ type: "info", text: "Queuing extraction..." });
    setQueuedJob(null);
    startTransition(async () => {
      const result = await triggerExtract(id);
      if (result.error) {
        setFeedback({ type: "error", text: result.error });
      } else if (typeof result.jobId === "number") {
        setFeedback(null);
        setQueuedJob({ id: result.jobId, reused: Boolean(result.reused) });
        window.dispatchEvent(new CustomEvent("atlas:started", {
          detail: {
            runId: result.jobId,
            title: `${institution_name} extraction`,
            label: `${institution_name} extraction`,
            agent: "magellan",
            reused: result.reused,
            startedAt: new Date().toISOString(),
          },
        }));
        triggerAgentRunExecution(result.jobId);
      } else {
        setFeedback({ type: "success", text: "Extraction queued." });
      }
    });
  }

  const badge = statusBadge(currentUrl, currentDocType, fee_count);

  return (
    <>
      <tr className="hover:bg-gray-50/50 dark:hover:bg-white/[0.04] transition-colors">
        <td className="text-gray-900 dark:text-gray-100 font-medium">
          <Link
            href={`/admin/institution/${id}`}
            className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          >
            {institution_name}
          </Link>
        </td>
        <td className="text-gray-500">{city ?? "-"}</td>
        <td className="text-gray-500">{charter_type ?? "-"}</td>
        <td>
          <span
            className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${badge.cls}`}
          >
            {badge.label}
          </span>
        </td>
        <td>
          {editing ? (
            <div className="flex items-center gap-1">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://..."
                autoFocus
                className="flex-1 min-w-0 px-2 py-1 text-xs border border-gray-200 dark:border-white/[0.1] rounded bg-white dark:bg-white/[0.05] text-gray-900 dark:text-gray-100"
                onKeyDown={(e) => e.key === "Enter" && handleSaveUrl()}
              />
              <button
                type="button"
                onClick={handleSaveUrl}
                disabled={pending || !url.trim()}
                className="px-2 py-1 text-[10px] font-semibold rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 transition-colors disabled:opacity-50"
              >
                {pending ? "..." : "Save"}
              </button>
              <button
                type="button"
                onClick={() => { setEditing(false); setUrl(currentUrl || ""); }}
                className="px-2 py-1 text-[10px] font-semibold rounded bg-gray-100 text-gray-500 dark:bg-white/[0.06] dark:text-gray-400 transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <div className="min-w-0">
                {currentUrl ? (
                  <a
                    href={currentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 hover:underline"
                    title={currentUrl}
                  >
                    {truncateUrl(currentUrl)}
                  </a>
                ) : (
                  <span className="text-gray-300">
                    {currentDocType === "offline" ? "offline" : "none"}
                  </span>
                )}
                {feedback && (
                  <span
                    className={`mt-0.5 block text-[10px] ${
                      feedback.type === "error"
                        ? "text-red-600 dark:text-red-400"
                        : feedback.type === "info"
                          ? "text-amber-700 dark:text-amber-400"
                          : "text-emerald-600 dark:text-emerald-400"
                    }`}
                  >
                    {feedback.text}
                  </span>
                )}
              </div>
              <div className="flex gap-1 ml-auto shrink-0">
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="px-1.5 py-0.5 text-[10px] font-medium rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                >
                  {currentUrl ? "Edit" : "Set URL"}
                </button>
                {currentUrl && currentDocType !== "offline" && (
                  <button
                    type="button"
                    onClick={handleExtract}
                    disabled={pending}
                    className="px-1.5 py-0.5 text-[10px] font-medium rounded text-gray-400 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors disabled:opacity-50"
                  >
                    Extract
                  </button>
                )}
                {currentDocType !== "offline" && (
                  <button
                    type="button"
                    onClick={handleMarkOffline}
                    disabled={pending}
                    className="px-1.5 py-0.5 text-[10px] font-medium rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors disabled:opacity-50"
                  >
                    Offline
                  </button>
                )}
              </div>
            </div>
          )}
        </td>
        <td className="text-right tabular-nums text-gray-500 dark:text-gray-400">
          {assetSize !== undefined ? formatAssets(assetSize ?? null) : last_crawled}
        </td>
      </tr>
      {queuedJob && (
        <tr className="bg-emerald-50/20 dark:bg-emerald-950/10">
          <td colSpan={6} className="p-3">
            <JobLaunchReceipt
              compact
              jobId={queuedJob.id}
              title={`${institution_name} extraction`}
              owner="magellan"
              command={`fetch + read + extract #${id}`}
              scope={institution_name}
              reused={queuedJob.reused}
              detail="Magellan queued an agentic extraction run for this fee schedule. Track live status for step events and outputs."
            />
          </td>
        </tr>
      )}
    </>
  );
}

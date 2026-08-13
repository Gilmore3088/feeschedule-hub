"use client";

import { useState, useTransition } from "react";
import { JobLaunchReceipt } from "@/components/agent-console/job-launch-receipt";
import { triggerAgentRunExecution } from "@/lib/agents/client-execution";
import { setFeeScheduleUrl, markOffline, triggerExtract } from "./actions";

interface Props {
  institutionId: number;
  institutionName: string;
  websiteUrl: string | null;
  failureReason: string | null;
}

export function UrlResolutionRow({
  institutionId,
  institutionName,
  websiteUrl,
  failureReason,
}: Props) {
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [url, setUrl] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [queuedJob, setQueuedJob] = useState<{ id: number; reused: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSetUrl() {
    if (!url.trim()) return;
    setFeedback(null);
    setQueuedJob(null);
    startTransition(async () => {
      const saveResult = await setFeeScheduleUrl(institutionId, url.trim());
      if (saveResult.error) {
        setFeedback({ type: "error", text: saveResult.error });
        return;
      }

      setMode("view");
      setFeedback({ type: "info", text: "URL saved. Queuing extraction..." });
      const extractResult = await triggerExtract(institutionId);
      if (extractResult.error) {
        setFeedback({ type: "error", text: extractResult.error });
      } else if (typeof extractResult.jobId === "number") {
        setFeedback(null);
        setQueuedJob({ id: extractResult.jobId, reused: Boolean(extractResult.reused) });
        window.dispatchEvent(new CustomEvent("atlas:started", {
          detail: {
            runId: extractResult.jobId,
            title: `${institutionName} extraction`,
            label: `${institutionName} extraction`,
            agent: "magellan",
            reused: extractResult.reused,
            startedAt: new Date().toISOString(),
          },
        }));
        triggerAgentRunExecution(extractResult.jobId);
      } else {
        setFeedback({ type: "success", text: "URL saved. Extraction queued." });
      }
    });
  }

  function handleMarkOffline() {
    setFeedback(null);
    setQueuedJob(null);
    startTransition(async () => {
      const result = await markOffline(institutionId);
      if (result.error) {
        setFeedback({ type: "error", text: result.error });
      } else {
        setFeedback({ type: "success", text: "Marked as offline" });
      }
    });
  }

  return (
    <>
      <tr className="hover:bg-gray-50/50 dark:hover:bg-white/[0.04] transition-colors">
        <td className="text-gray-900 dark:text-gray-100 font-medium">
          {institutionName}
        </td>
        <td>
          {websiteUrl ? (
            <a
              href={websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              {websiteUrl.replace(/^https?:\/\/(www\.)?/, "").slice(0, 35)}
            </a>
          ) : (
            <span className="text-gray-300">no website</span>
          )}
        </td>
        <td>
          {mode === "view" ? (
            <div className="flex items-center gap-2">
              <div className="min-w-0">
                <span className="block max-w-[200px] truncate text-xs text-gray-500">
                  {failureReason ?? "-"}
                </span>
                {feedback && (
                  <span
                    className={`mt-0.5 block text-[10px] ${
                      feedback.type === "error"
                        ? "text-red-600 dark:text-red-400"
                        : feedback.type === "info"
                          ? "text-amber-700 dark:text-amber-400"
                          : "text-emerald-700 dark:text-emerald-400"
                    }`}
                  >
                    {feedback.text}
                  </span>
                )}
              </div>
              <div className="flex gap-1 ml-auto shrink-0">
                <button
                  type="button"
                  onClick={() => setMode("edit")}
                  className="px-2 py-1 text-[10px] font-semibold rounded bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50 transition-colors"
                >
                  Set URL
                </button>
                <button
                  type="button"
                  onClick={handleMarkOffline}
                  disabled={pending}
                  className="px-2 py-1 text-[10px] font-semibold rounded bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-white/[0.06] dark:text-gray-400 dark:hover:bg-white/[0.1] transition-colors disabled:opacity-50"
                >
                  Offline
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/fee-schedule.pdf"
                autoFocus
                className="flex-1 min-w-0 px-2 py-1 text-xs border border-gray-200 dark:border-white/[0.1] rounded bg-white dark:bg-white/[0.05] text-gray-900 dark:text-gray-100 placeholder-gray-400"
                onKeyDown={(e) => e.key === "Enter" && handleSetUrl()}
              />
              <button
                type="button"
                onClick={handleSetUrl}
                disabled={pending || !url.trim()}
                className="px-2 py-1 text-[10px] font-semibold rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 transition-colors disabled:opacity-50"
              >
                {pending ? "Queuing..." : "Save + extract"}
              </button>
              <button
                type="button"
                onClick={() => setMode("view")}
                className="px-2 py-1 text-[10px] font-semibold rounded bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-white/[0.06] dark:text-gray-400 transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </td>
      </tr>
      {queuedJob && (
        <tr className="bg-emerald-50/20 dark:bg-emerald-950/10">
          <td colSpan={3} className="p-3">
            <JobLaunchReceipt
              compact
              jobId={queuedJob.id}
              title={`${institutionName} extraction`}
              owner="magellan"
              command={`fetch + read + extract #${institutionId}`}
              scope={institutionName}
              reused={queuedJob.reused}
              detail="Magellan queued an agentic extraction run for this fee schedule. Track live status for step events and outputs."
            />
          </td>
        </tr>
      )}
    </>
  );
}

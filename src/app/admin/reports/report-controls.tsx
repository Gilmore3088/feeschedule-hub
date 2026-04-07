"use client";

import { useState, useEffect, useRef } from "react";
import { STATE_CODES, STATE_NAMES } from "@/lib/us-states";
import type { ReportType } from "@/lib/report-engine/types";

// ─── Types ──────────────────────────────────────────────────────────────────

type GenState =
  | { status: "idle" }
  | { status: "picking_state" }
  | { status: "generating"; jobId: string }
  | { status: "complete"; jobId: string; presignedUrl: string | null }
  | { status: "failed"; error: string };

interface ReportControlsProps {
  publishedJobIds: string[];
}

// ─── Status stepper constants ────────────────────────────────────────────────

const STEPS = ["pending", "assembling", "rendering", "complete"] as const;
type StepName = (typeof STEPS)[number];

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function triggerGeneration(
  reportType: ReportType,
  params: Record<string, string>,
  setter: (s: GenState) => void,
) {
  try {
    const res = await fetch("/api/reports/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ report_type: reportType, params }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { error?: string };
      setter({ status: "failed", error: data.error ?? `HTTP ${res.status}` });
      return;
    }
    const { jobId } = await res.json() as { jobId: string };
    setter({ status: "generating", jobId });
  } catch (e) {
    setter({ status: "failed", error: String(e) });
  }
}

// ─── JobPoller ───────────────────────────────────────────────────────────────

function JobPoller({
  jobId,
  onComplete,
  onFailed,
}: {
  jobId: string;
  onComplete: (url: string | null) => void;
  onFailed: (err: string) => void;
}) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [currentStatus, setCurrentStatus] = useState<string>("pending");

  useEffect(() => {
    intervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/reports/${jobId}/status`);
        if (!res.ok) return;
        const data = await res.json() as { status: string; presigned_url?: string; error?: string };
        setCurrentStatus(data.status);
        if (data.status === "complete") {
          clearInterval(intervalRef.current!);
          onComplete(data.presigned_url ?? null);
        } else if (data.status === "failed") {
          clearInterval(intervalRef.current!);
          onFailed(data.error ?? "Unknown error");
        }
      } catch {
        // Network error — keep polling
      }
    }, 3000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [jobId, onComplete, onFailed]);

  const currentIdx = STEPS.indexOf(currentStatus as StepName);

  return (
    <div className="flex items-center gap-1 mt-2">
      {STEPS.map((step, i) => {
        const isPast = i < currentIdx;
        const isCurrent = i === currentIdx && currentStatus !== "complete";
        const isDone = currentStatus === "complete" && i === STEPS.length - 1;
        const isFailed = currentStatus === "failed";

        let dotClass = "w-2 h-2 rounded-full border ";
        if (isFailed && i === currentIdx) {
          dotClass += "bg-red-500 border-red-500";
        } else if (isDone || isPast) {
          dotClass += "bg-emerald-500 border-emerald-500";
        } else if (isCurrent) {
          dotClass += "bg-blue-500 border-blue-500 animate-pulse";
        } else {
          dotClass += "bg-transparent border-gray-300 dark:border-gray-600";
        }

        return (
          <div key={step} className="flex items-center gap-1">
            <div className={dotClass} />
            <span
              className={`text-[10px] ${
                isPast || isDone
                  ? "text-emerald-600 dark:text-emerald-400"
                  : isCurrent
                    ? "text-blue-600 dark:text-blue-400 font-medium"
                    : isFailed && i === currentIdx
                      ? "text-red-500"
                      : "text-gray-400 dark:text-gray-500"
              }`}
            >
              {step.charAt(0).toUpperCase() + step.slice(1)}
            </span>
            {i < STEPS.length - 1 && (
              <span className="text-gray-200 dark:text-gray-700 text-[10px]">→</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── GenerateButton ──────────────────────────────────────────────────────────

function GenerateButton({
  label,
  genState,
  onGenerate,
  disabled,
}: {
  label: string;
  genState: GenState;
  onGenerate: () => void;
  disabled?: boolean;
}) {
  const isGenerating = genState.status === "generating";
  const isComplete = genState.status === "complete";
  const isFailed = genState.status === "failed";

  return (
    <button
      type="button"
      onClick={onGenerate}
      disabled={isGenerating || isComplete || disabled}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] hover:bg-gray-50 dark:hover:bg-white/[0.07] text-gray-700 dark:text-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {isGenerating && (
        <span className="inline-block w-3 h-3 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" />
      )}
      {isComplete ? "Done" : isFailed ? "Failed — Retry?" : isGenerating ? "Generating..." : label}
    </button>
  );
}

// ─── ReportControls ──────────────────────────────────────────────────────────

export function ReportControls({ publishedJobIds: _publishedJobIds }: ReportControlsProps) {
  const [national, setNational] = useState<GenState>({ status: "idle" });
  const [stateJob, setStateJob] = useState<GenState>({ status: "idle" });
  const [selectedState, setSelectedState] = useState("CA");
  const [pulse, setPulse] = useState<GenState>({ status: "idle" });

  function handleNational() {
    if (national.status === "generating") return;
    setNational({ status: "idle" });
    triggerGeneration("national_index", {}, setNational);
  }

  function handleStatePick() {
    if (stateJob.status === "picking_state") {
      setStateJob({ status: "idle" });
    } else if (stateJob.status !== "generating") {
      setStateJob({ status: "picking_state" });
    }
  }

  function handleStateConfirm() {
    setStateJob({ status: "idle" });
    triggerGeneration("state_index", { state_code: selectedState }, setStateJob);
  }

  function handlePulse() {
    if (pulse.status === "generating") return;
    setPulse({ status: "idle" });
    triggerGeneration("monthly_pulse", {}, setPulse);
  }

  return (
    <div className="admin-card p-4">
      <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-3">
        Generate Report
      </h2>

      <div className="flex flex-wrap gap-6">

        {/* National Quarterly */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
            National
          </span>
          <GenerateButton
            label="Generate National Quarterly"
            genState={national}
            onGenerate={handleNational}
          />
          {national.status === "generating" && (
            <JobPoller
              jobId={national.jobId}
              onComplete={(url) => setNational({ status: "complete", jobId: national.status === "generating" ? national.jobId : "", presignedUrl: url })}
              onFailed={(err) => setNational({ status: "failed", error: err })}
            />
          )}
          {national.status === "complete" && national.presignedUrl && (
            <a
              href={national.presignedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 dark:text-blue-400 text-[12px] font-medium mt-1"
            >
              Preview PDF
            </a>
          )}
          {national.status === "complete" && (
            <span className="text-emerald-600 dark:text-emerald-400 text-[11px]">
              Job complete — refresh page to publish
            </span>
          )}
          {national.status === "failed" && (
            <span className="text-red-500 text-[11px]">{national.error}</span>
          )}
        </div>

        {/* State Index */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
            State Index
          </span>
          {stateJob.status === "picking_state" ? (
            <div className="flex items-center gap-2">
              <select
                value={selectedState}
                onChange={(e) => setSelectedState(e.target.value)}
                className="text-[12px] border border-gray-200 dark:border-white/[0.08] rounded px-2 py-1.5 bg-white dark:bg-white/[0.04] text-gray-700 dark:text-gray-300"
              >
                {STATE_CODES.map((code) => (
                  <option key={code} value={code}>
                    {STATE_NAMES[code] ?? code} ({code})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleStateConfirm}
                className="inline-flex items-center px-3 py-1.5 text-[12px] font-medium rounded border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] hover:bg-gray-50 dark:hover:bg-white/[0.07] text-gray-700 dark:text-gray-300 transition-colors"
              >
                Generate
              </button>
              <button
                type="button"
                onClick={() => setStateJob({ status: "idle" })}
                className="text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <GenerateButton
              label="Generate State Index"
              genState={stateJob}
              onGenerate={handleStatePick}
            />
          )}
          {stateJob.status === "generating" && (
            <JobPoller
              jobId={stateJob.jobId}
              onComplete={(url) => setStateJob({ status: "complete", jobId: stateJob.status === "generating" ? stateJob.jobId : "", presignedUrl: url })}
              onFailed={(err) => setStateJob({ status: "failed", error: err })}
            />
          )}
          {stateJob.status === "complete" && stateJob.presignedUrl && (
            <a
              href={stateJob.presignedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 dark:text-blue-400 text-[12px] font-medium mt-1"
            >
              Preview PDF
            </a>
          )}
          {stateJob.status === "complete" && (
            <span className="text-emerald-600 dark:text-emerald-400 text-[11px]">
              Job complete — refresh page to publish
            </span>
          )}
          {stateJob.status === "failed" && (
            <span className="text-red-500 text-[11px]">{stateJob.error}</span>
          )}
        </div>

        {/* Monthly Pulse */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
            Monthly Pulse
          </span>
          <GenerateButton
            label="Generate Monthly Pulse"
            genState={pulse}
            onGenerate={handlePulse}
          />
          {pulse.status === "generating" && (
            <JobPoller
              jobId={pulse.jobId}
              onComplete={(url) => setPulse({ status: "complete", jobId: pulse.status === "generating" ? pulse.jobId : "", presignedUrl: url })}
              onFailed={(err) => setPulse({ status: "failed", error: err })}
            />
          )}
          {pulse.status === "complete" && pulse.presignedUrl && (
            <a
              href={pulse.presignedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 dark:text-blue-400 text-[12px] font-medium mt-1"
            >
              Preview PDF
            </a>
          )}
          {pulse.status === "complete" && (
            <span className="text-emerald-600 dark:text-emerald-400 text-[11px]">
              Job complete — refresh page to publish
            </span>
          )}
          {pulse.status === "failed" && (
            <span className="text-red-500 text-[11px]">{pulse.error}</span>
          )}
        </div>

      </div>
    </div>
  );
}

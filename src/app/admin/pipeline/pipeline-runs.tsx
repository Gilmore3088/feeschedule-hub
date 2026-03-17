import { getPipelineRuns, getActivePipelineRun, type PipelineRun } from "@/lib/crawler-db/pipeline-runs";
import { timeAgo } from "@/lib/format";

const STAGES = [
  { name: "seed-enrich", label: "Seed", phase: 1, icon: "db" },
  { name: "discover", label: "Discover", phase: 1, icon: "search" },
  { name: "crawl", label: "Crawl", phase: 2, icon: "download" },
  { name: "merge-fees", label: "Merge", phase: 2, icon: "merge" },
  { name: "categorize", label: "Categorize", phase: 3, icon: "tag" },
  { name: "validate", label: "Validate", phase: 3, icon: "check" },
  { name: "auto-review", label: "Review", phase: 3, icon: "eye" },
  { name: "snapshot", label: "Snapshot", phase: 4, icon: "camera" },
  { name: "publish", label: "Publish", phase: 4, icon: "globe" },
] as const;

const PHASE_COLORS: Record<number, { bg: string; text: string; border: string; active: string }> = {
  1: { bg: "bg-violet-50 dark:bg-violet-900/20", text: "text-violet-700 dark:text-violet-300", border: "border-violet-200 dark:border-violet-800", active: "bg-violet-500" },
  2: { bg: "bg-blue-50 dark:bg-blue-900/20", text: "text-blue-700 dark:text-blue-300", border: "border-blue-200 dark:border-blue-800", active: "bg-blue-500" },
  3: { bg: "bg-amber-50 dark:bg-amber-900/20", text: "text-amber-700 dark:text-amber-300", border: "border-amber-200 dark:border-amber-800", active: "bg-amber-500" },
  4: { bg: "bg-emerald-50 dark:bg-emerald-900/20", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-200 dark:border-emerald-800", active: "bg-emerald-500" },
};

const PHASE_LABELS: Record<number, string> = {
  1: "Discovery",
  2: "Extraction",
  3: "Hygiene",
  4: "Publishing",
};

function StageIcon({ icon, className }: { icon: string; className?: string }) {
  const cls = className || "w-3.5 h-3.5";
  switch (icon) {
    case "db": return <svg className={cls} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" /></svg>;
    case "search": return <svg className={cls} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="m21 21-4.35-4.35" /></svg>;
    case "download": return <svg className={cls} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>;
    case "merge": return <svg className={cls} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg>;
    case "tag": return <svg className={cls} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" /></svg>;
    case "check": return <svg className={cls} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
    case "eye": return <svg className={cls} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
    case "camera": return <svg className={cls} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" /><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" /></svg>;
    case "globe": return <svg className={cls} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" /></svg>;
    default: return null;
  }
}

function getStageStatus(run: PipelineRun, stageIndex: number): "completed" | "active" | "failed" | "pending" {
  const lastJob = run.last_completed_job;
  if (!lastJob) {
    if (run.status === "running") return stageIndex === 0 ? "active" : "pending";
    if (run.status === "failed") return stageIndex === 0 ? "failed" : "pending";
    return "pending";
  }

  const lastIdx = STAGES.findIndex(s => s.name === lastJob);
  if (stageIndex <= lastIdx) return "completed";
  if (stageIndex === lastIdx + 1) {
    if (run.status === "running") return "active";
    if (run.status === "failed") return "failed";
  }
  return "pending";
}

function PipelineStageTracker({ run }: { run: PipelineRun }) {
  let currentPhase = 0;
  return (
    <div className="flex items-stretch gap-0 overflow-x-auto">
      {STAGES.map((stage, idx) => {
        const status = getStageStatus(run, idx);
        const phase = stage.phase;
        const colors = PHASE_COLORS[phase];
        const showPhaseLabel = phase !== currentPhase;
        if (showPhaseLabel) currentPhase = phase;

        return (
          <div key={stage.name} className="flex items-center">
            {/* Phase divider */}
            {showPhaseLabel && idx > 0 && (
              <div className="w-px h-10 bg-gray-200 dark:bg-white/10 mx-1" />
            )}
            <div className="flex flex-col items-center min-w-[60px]">
              {showPhaseLabel && (
                <span className={`text-[8px] font-bold uppercase tracking-widest mb-1 ${colors.text}`}>
                  {PHASE_LABELS[phase]}
                </span>
              )}
              {!showPhaseLabel && <span className="text-[8px] mb-1">&nbsp;</span>}
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
                  status === "completed"
                    ? `${colors.bg} ${colors.text} ${colors.border} border`
                    : status === "active"
                      ? `${colors.active} text-white shadow-md shadow-blue-200/50 dark:shadow-blue-900/50 animate-pulse`
                      : status === "failed"
                        ? "bg-red-100 text-red-600 border border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800"
                        : "bg-gray-50 text-gray-300 border border-gray-150 dark:bg-white/[0.03] dark:text-gray-600 dark:border-white/5"
                }`}
                title={`${stage.label}: ${status}`}
              >
                {status === "completed" ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                ) : status === "failed" ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <StageIcon icon={stage.icon} />
                )}
              </div>
              <span className={`text-[9px] mt-1 font-medium ${
                status === "completed" ? colors.text
                  : status === "active" ? "text-gray-900 dark:text-gray-100"
                  : status === "failed" ? "text-red-600 dark:text-red-400"
                  : "text-gray-300 dark:text-gray-600"
              }`}>
                {stage.label}
              </span>
            </div>
            {/* Connector line */}
            {idx < STAGES.length - 1 && STAGES[idx + 1].phase === phase && (
              <div className={`w-3 h-0.5 mt-2 ${
                status === "completed" ? colors.active + " opacity-40" : "bg-gray-200 dark:bg-white/10"
              }`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

const RUN_STATUS_STYLES: Record<string, { bg: string; dot: string }> = {
  running:   { bg: "bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800", dot: "bg-blue-500 animate-pulse" },
  completed: { bg: "bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800", dot: "bg-emerald-500" },
  partial:   { bg: "bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800", dot: "bg-amber-500" },
  failed:    { bg: "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800", dot: "bg-red-500" },
};

export function PipelineRunsPanel() {
  const runs = getPipelineRuns(5);
  const activeRun = getActivePipelineRun();

  if (runs.length === 0 && !activeRun) {
    return (
      <div className="admin-card p-6 text-center">
        <div className="text-gray-300 dark:text-gray-600 mb-3">
          <svg className="w-12 h-12 mx-auto" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
          </svg>
        </div>
        <h3 className="text-sm font-bold text-gray-600 dark:text-gray-300">No Pipeline Runs Yet</h3>
        <p className="text-[11px] text-gray-400 mt-1">
          Run <code className="bg-gray-100 dark:bg-white/10 px-1.5 py-0.5 rounded text-[10px]">python -m fee_crawler pipeline</code> or trigger from Ops Center
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {runs.map((run) => {
        const style = RUN_STATUS_STYLES[run.status] || RUN_STATUS_STYLES.failed;
        return (
          <div key={run.id} className={`admin-card border ${style.bg} overflow-hidden`}>
            {/* Header row */}
            <div className="px-4 py-2.5 flex items-center justify-between border-b border-gray-100 dark:border-white/5">
              <div className="flex items-center gap-3">
                <span className={`w-2 h-2 rounded-full ${style.dot}`} />
                <span className="text-[11px] font-bold text-gray-700 dark:text-gray-200">
                  Run #{run.id}
                </span>
                <span className="text-[10px] text-gray-400">
                  {run.started_at ? timeAgo(run.started_at) : ""}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {run.status === "failed" && run.error_msg && (
                  <span className="text-[10px] text-red-500 dark:text-red-400 max-w-[300px] truncate">
                    {run.error_msg}
                  </span>
                )}
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${
                  run.status === "completed" ? "text-emerald-600 dark:text-emerald-400"
                    : run.status === "running" ? "text-blue-600 dark:text-blue-400"
                    : run.status === "failed" ? "text-red-600 dark:text-red-400"
                    : "text-amber-600 dark:text-amber-400"
                }`}>
                  {run.status}
                </span>
              </div>
            </div>
            {/* Stage tracker */}
            <div className="px-4 py-3 overflow-x-auto">
              <PipelineStageTracker run={run} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

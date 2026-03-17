import Link from "next/link";
import { getPipelineRuns, getActivePipelineRun } from "@/lib/crawler-db/pipeline-runs";
import { timeAgo } from "@/lib/format";

const PHASE_NAMES: Record<number, string> = {
  1: "Discovery",
  2: "Extraction",
  3: "Hygiene",
  4: "Publishing",
};

const STATUS_COLORS: Record<string, string> = {
  running: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  completed: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  partial: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  failed: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  cancelled: "bg-gray-100 text-gray-500 dark:bg-white/5 dark:text-gray-400",
};

function PhaseProgress({ completedPhase }: { completedPhase: number }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4].map((phase) => {
        const isComplete = phase <= completedPhase;
        const isCurrent = phase === completedPhase + 1;
        return (
          <div key={phase} className="flex items-center gap-1">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold transition-colors ${
                isComplete
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                  : isCurrent
                    ? "bg-blue-100 text-blue-700 ring-2 ring-blue-400/50 dark:bg-blue-900/40 dark:text-blue-300"
                    : "bg-gray-100 text-gray-400 dark:bg-white/5 dark:text-gray-500"
              }`}
              title={PHASE_NAMES[phase]}
            >
              {isComplete ? (
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              ) : (
                phase
              )}
            </div>
            {phase < 4 && (
              <div
                className={`w-4 h-0.5 ${
                  phase < completedPhase
                    ? "bg-emerald-300 dark:bg-emerald-700"
                    : "bg-gray-200 dark:bg-white/10"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function PipelineRunsPanel() {
  const runs = getPipelineRuns(8);
  const activeRun = getActivePipelineRun();

  if (runs.length === 0 && !activeRun) {
    return (
      <div className="admin-card p-4">
        <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-2">
          Pipeline Runs
        </h2>
        <p className="text-[11px] text-gray-400">
          No pipeline runs yet. Run <code className="bg-gray-100 dark:bg-white/10 px-1 rounded">python -m fee_crawler pipeline</code> to start.
        </p>
      </div>
    );
  }

  return (
    <div className="admin-card overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-white/5 flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200">
          Pipeline Runs
        </h2>
        {activeRun && (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-blue-600 dark:text-blue-400">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            Running
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="bg-gray-50/80 dark:bg-white/[0.03]">
              <th className="text-left px-4 py-2 font-semibold text-gray-400 uppercase tracking-wider">ID</th>
              <th className="text-left px-4 py-2 font-semibold text-gray-400 uppercase tracking-wider">Status</th>
              <th className="text-left px-4 py-2 font-semibold text-gray-400 uppercase tracking-wider">Phase Progress</th>
              <th className="text-left px-4 py-2 font-semibold text-gray-400 uppercase tracking-wider">Last Job</th>
              <th className="text-left px-4 py-2 font-semibold text-gray-400 uppercase tracking-wider">Started</th>
              <th className="text-left px-4 py-2 font-semibold text-gray-400 uppercase tracking-wider">Error</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-white/5">
            {runs.map((run) => (
              <tr key={run.id} className="hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition-colors">
                <td className="px-4 py-2.5 tabular-nums text-gray-500">#{run.id}</td>
                <td className="px-4 py-2.5">
                  <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_COLORS[run.status] || STATUS_COLORS.cancelled}`}>
                    {run.status}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <PhaseProgress completedPhase={run.last_completed_phase || 0} />
                </td>
                <td className="px-4 py-2.5 text-gray-600 dark:text-gray-300">
                  {run.last_completed_job || "-"}
                </td>
                <td className="px-4 py-2.5 text-gray-400">
                  {run.started_at ? timeAgo(run.started_at) : "-"}
                </td>
                <td className="px-4 py-2.5 text-red-500 dark:text-red-400 max-w-[200px] truncate">
                  {run.error_msg || ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

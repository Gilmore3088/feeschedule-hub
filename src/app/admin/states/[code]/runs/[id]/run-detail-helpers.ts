import type { AgentRunStepSnapshot } from "@/lib/agents/types";
import type { AgentRunDetail, AgentRunResult } from "@/lib/data-store/states";

export interface RunSummaryStat {
  label: string;
  value: number;
  alert?: boolean;
}

export function buildRunSummaryStats({
  legacyRun,
  steps,
}: {
  legacyRun: AgentRunDetail;
  steps: Array<Pick<AgentRunStepSnapshot, "status">>;
}): RunSummaryStat[] {
  if (steps.length === 0) {
    return [
      { label: "Discovered", value: legacyRun.discovered },
      { label: "Classified", value: legacyRun.classified },
      { label: "Extracted", value: legacyRun.extracted },
      { label: "Validated", value: legacyRun.validated },
      { label: "Failed", value: legacyRun.failed, alert: legacyRun.failed > 0 },
    ];
  }

  const completed = steps.filter((step) => step.status === "completed" || step.status === "skipped").length;
  const queued = steps.filter((step) => step.status === "queued").length;
  const running = steps.filter((step) => step.status === "running" || step.status === "cancel_requested").length;
  const blocked = steps.filter((step) => step.status === "blocked" || step.status === "failed" || step.status === "cancelled").length;

  return [
    { label: "Steps total", value: steps.length },
    { label: "Completed", value: completed },
    { label: "Queued", value: queued },
    { label: "Running", value: running },
    { label: "Blocked/failed", value: blocked, alert: blocked > 0 },
  ];
}

export function isLedgerOnlyRun({
  results,
  steps,
}: {
  results: AgentRunResult[];
  steps: AgentRunStepSnapshot[];
}): boolean {
  return results.length === 0 && steps.length > 0;
}

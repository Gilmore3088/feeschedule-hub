"use client";

const activeExecutions = new Set<number>();

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function triggerAgentRunExecution(runId: number, maxPasses = 20): void {
  if (!Number.isInteger(runId) || runId < 1 || activeExecutions.has(runId)) return;
  activeExecutions.add(runId);

  void (async () => {
    try {
      for (let pass = 0; pass < maxPasses; pass += 1) {
        const response = await fetch(`/api/admin/agents/runs/${runId}/execute`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ maxSteps: 1 }),
          cache: "no-store",
        });
        if (!response.ok) return;
        const result = await response.json() as {
          terminal?: boolean;
          executedSteps?: number;
          status?: string;
        };
        if (result.terminal || !result.executedSteps) return;
        await wait(750);
      }
    } catch {
      // The live status poller remains the source of truth for user-visible errors.
    } finally {
      activeExecutions.delete(runId);
    }
  })();
}

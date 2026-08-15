import { getAutomationControl } from "@/lib/automation-control";
import { getExecutionBackendStatus } from "@/lib/execution-backend";

export async function assertAtlasDispatchReady(): Promise<void> {
  const [automation, execution] = await Promise.all([
    getAutomationControl(),
    Promise.resolve(getExecutionBackendStatus()),
  ]);

  if (!automation.enabled) {
    throw new Error(automation.reason
      ? `Automation is stopped: ${automation.reason}`
      : "Automation is stopped.");
  }

  if (!execution.enabled) {
    throw new Error(execution.detail);
  }
}

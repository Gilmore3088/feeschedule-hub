export type ExecutionBackend = "disabled" | "agentic_v1";

const BACKENDS = new Set<ExecutionBackend>(["disabled", "agentic_v1"]);

export interface ExecutionBackendStatus {
  backend: ExecutionBackend;
  enabled: boolean;
  label: string;
  detail: string;
}

export class RetiredExecutionBlockedError extends Error {
  readonly backend: ExecutionBackend;
  readonly capability: string;

  constructor(capability: string, backend = getExecutionBackend()) {
    super(retiredExecutionBlockedMessage(capability, backend));
    this.name = "RetiredExecutionBlockedError";
    this.backend = backend;
    this.capability = capability;
  }
}

export function getExecutionBackend(): ExecutionBackend {
  const raw = process.env.EXECUTION_BACKEND?.trim();
  if (!raw) return "disabled";
  if (BACKENDS.has(raw as ExecutionBackend)) return raw as ExecutionBackend;
  return "disabled";
}

export function getExecutionBackendStatus(): ExecutionBackendStatus {
  const backend = getExecutionBackend();
  if (backend === "agentic_v1") {
    return {
      backend,
      enabled: true,
      label: "Agentic backend selected",
      detail:
        "Retired external launchers remain blocked; launches must use the agentic run API.",
    };
  }

  return {
    backend,
    enabled: false,
    label: "Agentic backend disabled",
    detail:
      "Agent execution is visible but blocked until EXECUTION_BACKEND=agentic_v1 is selected.",
  };
}

export function retiredExecutionBlockedMessage(
  capability: string,
  backend = getExecutionBackend(),
): string {
  if (backend === "agentic_v1") {
    return `${capability} is still routed through a retired external launcher. Wire this capability through the agentic run API before enabling it.`;
  }
  return `${capability} is blocked because the agentic execution backend is disabled. Retired external launchers are intentionally unavailable.`;
}

export function blockRetiredExecution(capability: string): never {
  throw new RetiredExecutionBlockedError(capability);
}

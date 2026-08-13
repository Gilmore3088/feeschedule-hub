export type AgentRunVisibilityState =
  | "waiting_for_pickup"
  | "stale_queued"
  | "running"
  | "stale_running"
  | "blocked"
  | "terminal";

export interface AgentRunVisibilityInput {
  status: string;
  startedAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
  lastEventAt?: string | null;
  now?: Date;
}

export interface AgentRunVisibility {
  state: AgentRunVisibilityState;
  stale: boolean;
  message: string;
  nextPickupAt: string | null;
  ageSeconds: number | null;
}

const QUEUED_PICKUP_WINDOW_MS = 5 * 60 * 1000;
const QUEUED_STALE_AFTER_MS = 2 * 60 * 1000;
const RUNNING_STALE_AFTER_MS = 5 * 60 * 1000;

function timeMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function ageSeconds(sinceMs: number | null, nowMs: number): number | null {
  if (sinceMs == null) return null;
  return Math.max(0, Math.floor((nowMs - sinceMs) / 1000));
}

function isoFromMs(value: number | null): string | null {
  return value == null ? null : new Date(value).toISOString();
}

export function getAgentRunVisibility(input: AgentRunVisibilityInput): AgentRunVisibility {
  const nowMs = (input.now ?? new Date()).getTime();
  const startedMs = timeMs(input.startedAt);
  const updatedMs = timeMs(input.updatedAt);
  const eventMs = timeMs(input.lastEventAt);
  const heartbeatMs = Math.max(updatedMs ?? 0, eventMs ?? 0) || null;
  const queuedAgeMs = startedMs == null ? 0 : nowMs - startedMs;
  const heartbeatAgeMs = heartbeatMs == null ? 0 : nowMs - heartbeatMs;
  const nextPickupAt = isoFromMs(startedMs == null ? null : startedMs + QUEUED_PICKUP_WINDOW_MS);

  if (input.status === "blocked") {
    return {
      state: "blocked",
      stale: false,
      message: "Run is blocked. The recorded error explains what must change before it can continue.",
      nextPickupAt: null,
      ageSeconds: ageSeconds(heartbeatMs ?? startedMs, nowMs),
    };
  }

  if (!["queued", "running", "cancel_requested"].includes(input.status)) {
    return {
      state: "terminal",
      stale: false,
      message: "Run reached a terminal state.",
      nextPickupAt: null,
      ageSeconds: ageSeconds(timeMs(input.completedAt) ?? heartbeatMs ?? startedMs, nowMs),
    };
  }

  if (input.status === "queued") {
    const stale = queuedAgeMs >= QUEUED_STALE_AFTER_MS;
    return {
      state: stale ? "stale_queued" : "waiting_for_pickup",
      stale,
      message: stale
        ? "Queued run has not been picked up yet. Manual client execution and the Vercel cron should both be checked."
        : "Run is queued and waiting for client execution or the next Vercel cron pickup.",
      nextPickupAt,
      ageSeconds: ageSeconds(startedMs, nowMs),
    };
  }

  const stale = heartbeatAgeMs >= RUNNING_STALE_AFTER_MS;
  return {
    state: stale ? "stale_running" : "running",
    stale,
    message: stale
      ? "Running run has not emitted a recent heartbeat or event. It may be stalled."
      : "Run is active and has recent ledger activity.",
    nextPickupAt: null,
    ageSeconds: ageSeconds(heartbeatMs ?? startedMs, nowMs),
  };
}

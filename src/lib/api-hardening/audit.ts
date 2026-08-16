import { createHash } from "crypto";
import type { NextRequest } from "next/server";
import { sql } from "@/lib/data-store/connection";
import type { ApiRoutePolicy } from "./policies";

export type ApiAuditOutcome =
  | "success"
  | "error"
  | "blocked"
  | "rate_limited"
  | "unauthorized";

export interface ApiAuditInput {
  policy: ApiRoutePolicy;
  request?: Request | NextRequest;
  method?: string;
  path?: string;
  statusCode?: number;
  outcome: ApiAuditOutcome;
  startedAt?: number;
  latencyMs?: number;
  userId?: number | null;
  subjectKey?: string | null;
  budgetPolicyId?: number | null;
  provider?: string | null;
  model?: string | null;
  agentName?: string | null;
  operation?: string | null;
  reasonCode?: string | null;
  metadata?: Record<string, unknown>;
}

export function hashAuditSubject(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  return createHash("sha256").update(normalized).digest("hex");
}

export function getRequestSubjectKey(request: Request | NextRequest | undefined): string | null {
  if (!request) return null;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  return hashAuditSubject(forwarded || realIp || null);
}

function requestPath(request: Request | NextRequest | undefined): string | null {
  if (!request) return null;
  try {
    return new URL(request.url).pathname;
  } catch {
    return null;
  }
}

export async function recordApiRouteAuditEvent(input: ApiAuditInput): Promise<void> {
  const latencyMs = input.latencyMs ?? (
    typeof input.startedAt === "number"
      ? Math.max(0, Date.now() - input.startedAt)
      : null
  );
  const method = input.method ?? input.request?.method ?? input.policy.allowedMethods[0] ?? "GET";
  const path = input.path ?? requestPath(input.request) ?? input.policy.routeTemplate;
  const subjectKey = input.subjectKey ?? getRequestSubjectKey(input.request);

  try {
    await sql`
      INSERT INTO public.api_route_audit_events
        (route_id, method, path, surface, status_code, outcome, latency_ms,
         user_id, subject_key, auth_policy, rate_limit_policy, cost_policy,
         budget_policy_id, provider, model, agent_name, operation, reason_code, metadata)
      VALUES
        (${input.policy.routeId}, ${method}, ${path}, ${input.policy.surface},
         ${input.statusCode ?? null}, ${input.outcome}, ${latencyMs},
         ${input.userId ?? null}, ${subjectKey}, ${input.policy.authRequirement},
         ${input.policy.rateLimitBucket}, ${input.policy.costPolicy},
         ${input.budgetPolicyId ?? null}, ${input.provider ?? null},
         ${input.model ?? null}, ${input.agentName ?? null}, ${input.operation ?? null},
         ${input.reasonCode ?? null}, ${JSON.stringify(input.metadata ?? {})}::jsonb)
    `;
  } catch (error) {
    console.error("API route audit write failed", error);
  }
}

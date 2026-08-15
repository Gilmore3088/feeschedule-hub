import { sql } from "@/lib/data-store/connection";
import { normalizeStateCode } from "./state-lane-memory";

type SqlTag = typeof sql;

export type PublicFindingCode =
  | "horizontal_overflow"
  | "visible_error"
  | "console_errors"
  | "unlabeled_inputs"
  | "not_found";

export interface PublicDiscoveryObservationInput {
  agentRunId?: number | null;
  stateCode?: string | null;
  routeTemplate?: string | null;
  url: string;
  source?: string;
  viewport?: "desktop" | "mobile";
  statusCode?: number | null;
  finalUrl?: string | null;
  h1?: string | null;
  title?: string | null;
  hasHorizontalOverflow?: boolean;
  consoleErrorCount?: number;
  consoleWarningCount?: number;
  screenshotPath?: string | null;
  detail?: Record<string, unknown>;
}

export interface PublicDiscoveryFindingResult {
  code: PublicFindingCode;
  severity: "warning" | "critical";
  message: string;
}

export interface PublicDiscoveryObservationResult {
  observationId: number | null;
  findings: PublicDiscoveryFindingResult[];
}

function boundedNonnegativeInt(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(Math.floor(parsed), 0);
}

function detailNumber(detail: Record<string, unknown>, key: string): number {
  return boundedNonnegativeInt(detail[key]);
}

export function classifyPublicDiscoveryObservation(
  input: PublicDiscoveryObservationInput,
): PublicDiscoveryFindingResult[] {
  const detail = input.detail ?? {};
  const findings: PublicDiscoveryFindingResult[] = [];
  const statusCode = input.statusCode == null ? null : Number(input.statusCode);
  const consoleErrors = boundedNonnegativeInt(input.consoleErrorCount);
  const unlabeledInputs = detailNumber(detail, "unlabeledInputCount");
  const visibleErrorText = typeof detail.visibleErrorText === "string"
    ? detail.visibleErrorText.trim()
    : "";

  if (statusCode === 404) {
    findings.push({
      code: "not_found",
      severity: "critical",
      message: "Page returned 404 during public discovery render.",
    });
  }
  if (input.hasHorizontalOverflow) {
    findings.push({
      code: "horizontal_overflow",
      severity: "warning",
      message: "Rendered viewport has horizontal overflow.",
    });
  }
  if (consoleErrors > 0) {
    findings.push({
      code: "console_errors",
      severity: "warning",
      message: `Rendered page produced ${consoleErrors} console error${consoleErrors === 1 ? "" : "s"}.`,
    });
  }
  if (unlabeledInputs > 0) {
    findings.push({
      code: "unlabeled_inputs",
      severity: "warning",
      message: `Rendered page has ${unlabeledInputs} unlabeled input${unlabeledInputs === 1 ? "" : "s"}.`,
    });
  }
  if (detail.visibleError === true || visibleErrorText.length > 0) {
    findings.push({
      code: "visible_error",
      severity: "critical",
      message: visibleErrorText || "Rendered page displayed a visible error state.",
    });
  }

  return findings;
}

export async function recordPublicDiscoveryObservation(
  input: PublicDiscoveryObservationInput,
  db: SqlTag = sql,
): Promise<PublicDiscoveryObservationResult> {
  const stateCode = normalizeStateCode(input.stateCode ?? null);
  const detail = input.detail ?? {};
  const findings = classifyPublicDiscoveryObservation(input);
  const [observation] = await db`
    INSERT INTO public.public_discovery_observations (
      agent_run_id,
      state_code,
      route_template,
      url,
      source,
      viewport,
      status_code,
      final_url,
      h1,
      title,
      has_horizontal_overflow,
      console_error_count,
      console_warning_count,
      screenshot_path,
      detail
    )
    VALUES (
      ${input.agentRunId ?? null},
      ${stateCode},
      ${input.routeTemplate ?? null},
      ${input.url},
      ${input.source ?? "magellan_public_discovery"},
      ${input.viewport ?? "desktop"},
      ${input.statusCode ?? null},
      ${input.finalUrl ?? null},
      ${input.h1 ?? null},
      ${input.title ?? null},
      ${Boolean(input.hasHorizontalOverflow)},
      ${boundedNonnegativeInt(input.consoleErrorCount)},
      ${boundedNonnegativeInt(input.consoleWarningCount)},
      ${input.screenshotPath ?? null},
      ${JSON.stringify(detail)}::jsonb
    )
    RETURNING id
  `;
  const observationId = observation?.id == null ? null : Number(observation.id);

  for (const finding of findings) {
    await db`
      INSERT INTO public.public_discovery_findings (
        observation_id,
        agent_run_id,
        state_code,
        route_template,
        url,
        issue_code,
        severity,
        verified_status,
        message,
        evidence
      )
      VALUES (
        ${observationId},
        ${input.agentRunId ?? null},
        ${stateCode},
        ${input.routeTemplate ?? null},
        ${input.url},
        ${finding.code},
        ${finding.severity},
        'unverified',
        ${finding.message},
        ${JSON.stringify({
          status_code: input.statusCode ?? null,
          final_url: input.finalUrl ?? null,
          viewport: input.viewport ?? "desktop",
          detail,
        })}::jsonb
      )
    `;
  }

  return { observationId, findings };
}

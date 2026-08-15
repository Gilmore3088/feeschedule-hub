import { sql } from "@/lib/data-store/connection";
import { SITE_URL } from "@/lib/constants";
import { normalizeStateCode } from "./state-lane-memory";

type SqlTag = typeof sql;
type FetchImpl = typeof fetch;

function jsonParam(value: unknown): ReturnType<typeof sql.json> | string {
  const json = (sql as unknown as { json?: (input: unknown) => unknown }).json;
  return typeof json === "function"
    ? json.call(sql, value) as ReturnType<typeof sql.json>
    : JSON.stringify(value);
}

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

export interface PublicDiscoveryRoute {
  stateCode: string | null;
  routeTemplate: string;
  url: string;
  source: "static" | "state" | "city" | "institution";
}

export interface PublicDiscoveryRouteResult {
  routeTemplate: string;
  url: string;
  stateCode: string | null;
  status: "observed" | "failed" | "dry_run";
  statusCode: number | null;
  finalUrl: string | null;
  findingCodes: PublicFindingCode[];
  error?: string;
}

export interface PublicDiscoveryAuditResult {
  selected: number;
  processed: number;
  observed: number;
  failed: number;
  findings: number;
  criticalFindings: number;
  warningFindings: number;
  routeTemplates: number;
  limit: number;
  dryRun: boolean;
  routes: PublicDiscoveryRouteResult[];
}

export interface PublicDiscoveryClusterResult {
  clusters: number;
  systemicCandidates: number;
  findingsTagged: number;
  criticalFindings: number;
  summaryRows: Array<{
    issueCode: PublicFindingCode;
    routeTemplate: string | null;
    findings: number;
    severity: string;
    systemicCandidate: boolean;
  }>;
}

export interface PublicDiscoveryDiagnosisResult {
  findings: number;
  criticalFindings: number;
  systemicCandidates: number;
  topIssue: string | null;
  summary: string;
}

function boundedNonnegativeInt(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(Math.floor(parsed), 0);
}

function detailNumber(detail: Record<string, unknown>, key: string): number {
  return boundedNonnegativeInt(detail[key]);
}

function boundedLimit(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 20;
  return Math.min(Math.max(Math.floor(parsed), 1), 50);
}

function publicBaseUrl(value: string | undefined = SITE_URL): string {
  try {
    return new URL(value || SITE_URL).origin;
  } catch {
    return new URL(SITE_URL).origin;
  }
}

function routeUrl(baseUrl: string, path: string): string {
  return new URL(path, `${publicBaseUrl(baseUrl)}/`).toString();
}

function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeBasicHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractTagText(html: string, tag: "title" | "h1"): string | null {
  const match = html.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  if (!match?.[1]) return null;
  const text = decodeBasicHtmlEntities(stripTags(match[1]));
  return text ? text.slice(0, 240) : null;
}

function detectVisibleErrorText(html: string, statusCode: number | null): string | null {
  const lower = html.toLowerCase();
  if (statusCode != null && statusCode >= 500) {
    return `HTTP ${statusCode} response during public discovery render.`;
  }
  if (lower.includes("server components render")) {
    return "Rendered page displayed a Server Components error.";
  }
  if (lower.includes("application error") || lower.includes("a client-side exception has occurred")) {
    return "Rendered page displayed an application error.";
  }
  if (lower.includes("this page could not be found") || lower.includes("404")) {
    return null;
  }
  return null;
}

function countUnlabeledInputs(html: string): number {
  const labelForIds = new Set<string>();
  for (const match of html.matchAll(/<label\b[^>]*\bfor=["']([^"']+)["'][^>]*>/gi)) {
    if (match[1]) labelForIds.add(match[1]);
  }

  let count = 0;
  for (const match of html.matchAll(/<input\b[^>]*>/gi)) {
    const tag = match[0];
    const type = tag.match(/\btype=["']?([^"'\s>]+)/i)?.[1]?.toLowerCase() ?? "text";
    if (["hidden", "submit", "button", "reset"].includes(type)) continue;
    if (/\baria-label=/i.test(tag) || /\baria-labelledby=/i.test(tag) || /\btitle=/i.test(tag)) continue;
    const id = tag.match(/\bid=["']([^"']+)["']/i)?.[1];
    if (id && labelForIds.has(id)) continue;
    count += 1;
  }
  return count;
}

async function routeRowsForState(
  db: SqlTag,
  stateCode: string,
  baseUrl: string,
  limit: number,
): Promise<PublicDiscoveryRoute[]> {
  const routes: PublicDiscoveryRoute[] = [
    {
      stateCode,
      routeTemplate: "/research/state/[code]",
      url: routeUrl(baseUrl, `/research/state/${stateCode}`),
      source: "state",
    },
    {
      stateCode,
      routeTemplate: "/fees/city/[state]",
      url: routeUrl(baseUrl, `/fees/city/${stateCode.toLowerCase()}`),
      source: "state",
    },
  ];

  const citySlots = Math.max(0, Math.min(12, limit - routes.length));
  if (citySlots > 0) {
    const cityRows = await db<Array<{ city: string }>>`
      SELECT city
        FROM public.institution_sources
       WHERE upper(btrim(state_code)) = ${stateCode}
         AND city IS NOT NULL
         AND btrim(city) <> ''
       GROUP BY city
       ORDER BY COUNT(*) DESC, city ASC
       LIMIT ${citySlots}
    `;
    for (const row of cityRows) {
      const city = String(row.city ?? "").trim();
      if (!city) continue;
      routes.push({
        stateCode,
        routeTemplate: "/fees/city/[state]/[city]",
        url: routeUrl(baseUrl, `/fees/city/${stateCode.toLowerCase()}/${encodeURIComponent(city.toLowerCase())}`),
        source: "city",
      });
    }
  }

  const institutionSlots = Math.max(0, limit - routes.length);
  if (institutionSlots > 0) {
    const institutionRows = await db<Array<{ id: number | string }>>`
      SELECT inst.id
        FROM public.institution_sources inst
       WHERE upper(btrim(inst.state_code)) = ${stateCode}
         AND COALESCE(inst.status, 'active') = 'active'
         AND EXISTS (
           SELECT 1
             FROM public.published_fee_catalog pfc
            WHERE pfc.institution_id = inst.id
              AND pfc.review_status = 'approved'
         )
       ORDER BY inst.id ASC
       LIMIT ${institutionSlots}
    `;
    for (const row of institutionRows) {
      const id = Number(row.id);
      if (!Number.isInteger(id) || id < 1) continue;
      routes.push({
        stateCode,
        routeTemplate: "/institution/[id]",
        url: routeUrl(baseUrl, `/institution/${id}`),
        source: "institution",
      });
    }
  }

  return routes.slice(0, limit);
}

export async function selectPublicDiscoveryRoutes({
  stateCode,
  limit,
  baseUrl = SITE_URL,
  db = sql,
}: {
  stateCode?: string | null;
  limit?: number;
  baseUrl?: string;
  db?: SqlTag;
} = {}): Promise<PublicDiscoveryRoute[]> {
  const safeLimit = boundedLimit(limit);
  const normalizedState = normalizeStateCode(stateCode ?? null);
  if (normalizedState) {
    return routeRowsForState(db, normalizedState, baseUrl, safeLimit);
  }

  const staticRoutes: PublicDiscoveryRoute[] = [
    { stateCode: null, routeTemplate: "/", url: routeUrl(baseUrl, "/"), source: "static" },
    { stateCode: null, routeTemplate: "/fees", url: routeUrl(baseUrl, "/fees"), source: "static" },
    { stateCode: null, routeTemplate: "/institutions", url: routeUrl(baseUrl, "/institutions"), source: "static" },
    { stateCode: null, routeTemplate: "/research", url: routeUrl(baseUrl, "/research"), source: "static" },
    { stateCode: null, routeTemplate: "/reports", url: routeUrl(baseUrl, "/reports"), source: "static" },
    { stateCode: null, routeTemplate: "/guides", url: routeUrl(baseUrl, "/guides"), source: "static" },
    { stateCode: null, routeTemplate: "/methodology", url: routeUrl(baseUrl, "/methodology"), source: "static" },
  ];
  return staticRoutes.slice(0, safeLimit);
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
      ${jsonParam(detail)}
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
        ${jsonParam({
          status_code: input.statusCode ?? null,
          final_url: input.finalUrl ?? null,
          viewport: input.viewport ?? "desktop",
          detail,
        })}
      )
    `;
  }

  return { observationId, findings };
}

async function observePublicRoute({
  route,
  runId,
  fetchImpl,
}: {
  route: PublicDiscoveryRoute;
  runId?: number | null;
  fetchImpl: FetchImpl;
}): Promise<PublicDiscoveryObservationInput> {
  const started = Date.now();
  const timeoutSignal = typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
    ? AbortSignal.timeout(12_000)
    : undefined;
  const response = await fetchImpl(route.url, {
    redirect: "follow",
    headers: {
      "user-agent": "FeeInsight-Atlas-PublicDiscovery/1.0",
      accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1",
    },
    signal: timeoutSignal,
  });
  const statusCode = response.status;
  const contentType = response.headers.get("content-type") ?? "";
  const html = contentType.includes("text") || contentType.includes("html") || contentType === ""
    ? await response.text()
    : "";
  const visibleErrorText = detectVisibleErrorText(html, statusCode);
  const detail: Record<string, unknown> = {
    contentType,
    elapsedMs: Date.now() - started,
    bodyChars: html.length,
    renderMode: "http_html",
    browserRenderPending: true,
    horizontalOverflowMeasured: false,
    unlabeledInputCount: countUnlabeledInputs(html),
  };
  if (visibleErrorText) {
    detail.visibleError = true;
    detail.visibleErrorText = visibleErrorText;
  }

  return {
    agentRunId: runId,
    stateCode: route.stateCode,
    routeTemplate: route.routeTemplate,
    url: route.url,
    source: `atlas_public_${route.source}`,
    viewport: "desktop",
    statusCode,
    finalUrl: response.url || route.url,
    h1: extractTagText(html, "h1"),
    title: extractTagText(html, "title"),
    hasHorizontalOverflow: false,
    consoleErrorCount: 0,
    consoleWarningCount: 0,
    detail,
  };
}

export async function runPublicDiscoveryAudit({
  runId,
  stateCode,
  limit,
  baseUrl = SITE_URL,
  dryRun = false,
  fetchImpl = fetch,
  db = sql,
}: {
  runId?: number | null;
  stateCode?: string | null;
  limit?: number;
  baseUrl?: string;
  dryRun?: boolean;
  fetchImpl?: FetchImpl;
  db?: SqlTag;
} = {}): Promise<PublicDiscoveryAuditResult> {
  const safeLimit = boundedLimit(limit);
  const routes = await selectPublicDiscoveryRoutes({
    stateCode,
    limit: safeLimit,
    baseUrl,
    db,
  });
  const results: PublicDiscoveryRouteResult[] = [];
  let observed = 0;
  let failed = 0;
  let findings = 0;
  let criticalFindings = 0;
  let warningFindings = 0;

  if (dryRun) {
    return {
      selected: routes.length,
      processed: 0,
      observed: 0,
      failed: 0,
      findings: 0,
      criticalFindings: 0,
      warningFindings: 0,
      routeTemplates: new Set(routes.map((route) => route.routeTemplate)).size,
      limit: safeLimit,
      dryRun,
      routes: routes.map((route) => ({
        routeTemplate: route.routeTemplate,
        url: route.url,
        stateCode: route.stateCode,
        status: "dry_run",
        statusCode: null,
        finalUrl: null,
        findingCodes: [],
      })),
    };
  }

  for (const route of routes) {
    try {
      const observation = await observePublicRoute({ route, runId, fetchImpl });
      const recorded = await recordPublicDiscoveryObservation(observation, db);
      observed += 1;
      findings += recorded.findings.length;
      criticalFindings += recorded.findings.filter((finding) => finding.severity === "critical").length;
      warningFindings += recorded.findings.filter((finding) => finding.severity === "warning").length;
      results.push({
        routeTemplate: route.routeTemplate,
        url: route.url,
        stateCode: route.stateCode,
        status: "observed",
        statusCode: observation.statusCode ?? null,
        finalUrl: observation.finalUrl ?? null,
        findingCodes: recorded.findings.map((finding) => finding.code),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const recorded = await recordPublicDiscoveryObservation({
        agentRunId: runId,
        stateCode: route.stateCode,
        routeTemplate: route.routeTemplate,
        url: route.url,
        source: `atlas_public_${route.source}`,
        viewport: "desktop",
        statusCode: null,
        finalUrl: null,
        detail: {
          visibleError: true,
          visibleErrorText: `Fetch failed during public discovery: ${message}`,
          renderMode: "http_html",
          browserRenderPending: true,
        },
      }, db);
      failed += 1;
      findings += recorded.findings.length;
      criticalFindings += recorded.findings.filter((finding) => finding.severity === "critical").length;
      warningFindings += recorded.findings.filter((finding) => finding.severity === "warning").length;
      results.push({
        routeTemplate: route.routeTemplate,
        url: route.url,
        stateCode: route.stateCode,
        status: "failed",
        statusCode: null,
        finalUrl: null,
        findingCodes: recorded.findings.map((finding) => finding.code),
        error: message,
      });
    }
  }

  return {
    selected: routes.length,
    processed: results.length,
    observed,
    failed,
    findings,
    criticalFindings,
    warningFindings,
    routeTemplates: new Set(routes.map((route) => route.routeTemplate)).size,
    limit: safeLimit,
    dryRun,
    routes: results,
  };
}

export async function clusterPublicDiscoveryFindings({
  runId,
  stateCode,
  db = sql,
}: {
  runId: number;
  stateCode?: string | null;
  db?: SqlTag;
}): Promise<PublicDiscoveryClusterResult> {
  const normalizedState = normalizeStateCode(stateCode ?? null);
  const rows = await db<Array<{
    issue_code: PublicFindingCode;
    route_template: string | null;
    findings: number | string;
    severity: string;
    systemic_candidate: boolean;
  }>>`
    WITH clusters AS (
      SELECT
        issue_code,
        route_template,
        COUNT(*)::int AS findings,
        CASE
          WHEN BOOL_OR(severity = 'critical') THEN 'critical'
          ELSE 'warning'
        END AS severity,
        COUNT(*) >= 2 AS systemic_candidate
      FROM public.public_discovery_findings
      WHERE agent_run_id = ${runId}
        AND (${normalizedState}::text IS NULL OR state_code = ${normalizedState})
      GROUP BY issue_code, route_template
    ),
    tagged AS (
      UPDATE public.public_discovery_findings finding
         SET evidence = finding.evidence || jsonb_build_object(
               'darwin_cluster_size', clusters.findings,
               'systemic_candidate', clusters.systemic_candidate
             ),
             updated_at = NOW()
        FROM clusters
       WHERE finding.agent_run_id = ${runId}
         AND finding.issue_code = clusters.issue_code
         AND finding.route_template IS NOT DISTINCT FROM clusters.route_template
       RETURNING finding.id
    )
    SELECT issue_code, route_template, findings, severity, systemic_candidate
      FROM clusters
     ORDER BY systemic_candidate DESC, findings DESC, issue_code ASC, route_template ASC
  `;
  const findingsTagged = rows.reduce((sum, row) => sum + Number(row.findings ?? 0), 0);
  return {
    clusters: rows.length,
    systemicCandidates: rows.filter((row) => Boolean(row.systemic_candidate)).length,
    findingsTagged,
    criticalFindings: rows
      .filter((row) => row.severity === "critical")
      .reduce((sum, row) => sum + Number(row.findings ?? 0), 0),
    summaryRows: rows.slice(0, 8).map((row) => ({
      issueCode: row.issue_code,
      routeTemplate: row.route_template,
      findings: Number(row.findings ?? 0),
      severity: row.severity,
      systemicCandidate: Boolean(row.systemic_candidate),
    })),
  };
}

export async function summarizePublicDiscoveryDiagnosis({
  runId,
  stateCode,
  db = sql,
}: {
  runId: number;
  stateCode?: string | null;
  db?: SqlTag;
}): Promise<PublicDiscoveryDiagnosisResult> {
  const normalizedState = normalizeStateCode(stateCode ?? null);
  const rows = await db<Array<{
    issue_code: PublicFindingCode;
    route_template: string | null;
    findings: number | string;
    critical_findings: number | string;
    systemic_candidates: number | string;
  }>>`
    SELECT
      issue_code,
      route_template,
      COUNT(*)::int AS findings,
      COUNT(*) FILTER (WHERE severity = 'critical')::int AS critical_findings,
      COUNT(*) FILTER (WHERE (evidence->>'systemic_candidate')::boolean IS TRUE)::int AS systemic_candidates
    FROM public.public_discovery_findings
    WHERE agent_run_id = ${runId}
      AND (${normalizedState}::text IS NULL OR state_code = ${normalizedState})
    GROUP BY issue_code, route_template
    ORDER BY critical_findings DESC, findings DESC, issue_code ASC, route_template ASC
    LIMIT 8
  `;
  const totalFindings = rows.reduce((sum, row) => sum + Number(row.findings ?? 0), 0);
  const criticalFindings = rows.reduce((sum, row) => sum + Number(row.critical_findings ?? 0), 0);
  const systemicCandidates = rows.reduce((sum, row) => sum + Number(row.systemic_candidates ?? 0), 0);
  const top = rows[0] ?? null;
  const topIssue = top
    ? `${top.issue_code}${top.route_template ? ` on ${top.route_template}` : ""}`
    : null;
  const scope = normalizedState ? `${normalizedState} public discovery` : "Public discovery";
  const summary = totalFindings === 0
    ? `${scope} found no deterministic public page findings in this run.`
    : `${scope} found ${totalFindings.toLocaleString()} finding${totalFindings === 1 ? "" : "s"} across ${rows.length.toLocaleString()} route cluster${rows.length === 1 ? "" : "s"}; ${criticalFindings.toLocaleString()} critical. Top issue: ${topIssue}.`;

  return {
    findings: totalFindings,
    criticalFindings,
    systemicCandidates,
    topIssue,
    summary,
  };
}

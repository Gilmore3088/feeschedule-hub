import { sql, withTransaction } from "@/lib/crawler-db/connection";
import { safeJsonb, toISO } from "@/lib/pg-helpers";
import { getExecutionBackend } from "@/lib/execution-backend";
import { runDarwinVerify } from "@/lib/agents/darwin/verify";
import { runHamiltonPublish } from "@/lib/agents/hamilton/publish";
import { runKnoxExtract } from "@/lib/agents/knox/extract";
import { runMagellanDiscovery } from "@/lib/agents/magellan/discovery";
import { runMagellanFetch } from "@/lib/agents/magellan/fetch";
import { runRosettaRead } from "@/lib/agents/rosetta/read";
import type {
  AdminAgent,
  AgentRunEventSnapshot,
  AgentRunKind,
  AgentRunStatus,
  AgentRunSnapshot,
  AgentRunStepDefinition,
  AgentRunStepStatus,
  AgentRunStepSnapshot,
  AgentRunTriggerSource,
} from "./types";

const ACTIVE_STATUSES = ["queued", "running", "cancel_requested"];
const AGENTIC_SUMMARY =
  "Agentic run advanced through the TypeScript run ledger with committed step events. Magellan can reduce missing fee URLs and fetch source documents; Rosetta can normalize HTML/text source documents and route PDFs to OCR; Knox can extract conservative raw fee observations and surface rejection decisions for anomaly-only human review; Darwin can verify canonical-hinted raw rows; Hamilton can publish eligible verified rows into the Tier-3 ledger. Durable queues, PDF/OCR, provider extraction, and adversarial review depth remain gated until each agent module is implemented.";

type SqlTag = typeof sql;

interface AgenticStepExecution {
  status: Extract<AgentRunStepStatus, "completed" | "skipped">;
  summary: string;
  detail?: Record<string, unknown>;
}

export interface StartAgentRunInput {
  agent: AdminAgent;
  kind: AgentRunKind;
  title: string;
  stateCode?: string;
  params?: Record<string, unknown>;
  triggeredBy: string;
  triggerSource?: AgentRunTriggerSource;
  idempotencyKey?: string;
  steps: AgentRunStepDefinition[];
  summary?: string;
}

export interface StartAgentRunResult {
  run: AgentRunSnapshot;
  steps: AgentRunStepSnapshot[];
  reused: boolean;
}

function requiredIso(value: unknown): string {
  return toISO(value as string | Date | null | undefined) ?? new Date(0).toISOString();
}

function optionalIso(value: unknown): string | null {
  return toISO(value as string | Date | null | undefined);
}

function safeRecord(value: unknown): Record<string, unknown> {
  const parsed = safeJsonb<Record<string, unknown>>(value);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
}

function mapRun(row: Record<string, unknown>): AgentRunSnapshot {
  return {
    id: Number(row.id),
    agent: String(row.agent_name ?? "atlas") as AdminAgent,
    runKind: String(row.run_kind ?? "workflow") as AgentRunKind,
    title: String(row.title ?? "Agent run"),
    status: String(row.status ?? "queued") as AgentRunSnapshot["status"],
    startedAt: requiredIso(row.started_at),
    completedAt: optionalIso(row.completed_at),
    updatedAt: requiredIso(row.updated_at ?? row.started_at),
    triggerSource: String(row.trigger_source ?? "admin") as AgentRunTriggerSource,
    triggeredBy: row.triggered_by ? String(row.triggered_by) : null,
    correlationId: String(row.correlation_id ?? ""),
    backend: String(row.backend ?? "agentic_v1"),
    progressCurrent: Number(row.progress_current ?? 0),
    progressTotal: Number(row.progress_total ?? 0),
    currentStage: row.current_stage ? String(row.current_stage) : null,
    error: row.error_summary ? String(row.error_summary) : null,
    summary: row.summary ? String(row.summary) : null,
    params: safeRecord(row.params_json),
  };
}

function mapStep(row: Record<string, unknown>): AgentRunStepSnapshot {
  return {
    id: Number(row.id),
    runId: Number(row.agent_run_id),
    stepKey: String(row.step_key),
    agent: String(row.agent_name) as AdminAgent,
    title: String(row.title),
    status: String(row.status) as AgentRunStepSnapshot["status"],
    sequence: Number(row.sequence ?? 0),
    summary: row.summary ? String(row.summary) : null,
    error: row.error_summary ? String(row.error_summary) : null,
    queuedAt: requiredIso(row.queued_at),
    startedAt: optionalIso(row.started_at),
    completedAt: optionalIso(row.completed_at),
    updatedAt: requiredIso(row.updated_at ?? row.queued_at),
  };
}

function mapEvent(row: Record<string, unknown>): AgentRunEventSnapshot {
  return {
    id: Number(row.id),
    runId: Number(row.agent_run_id),
    stepId: row.step_id == null ? null : Number(row.step_id),
    eventType: String(row.event_type),
    status: String(row.status),
    message: String(row.message),
    detail: safeRecord(row.detail),
    createdAt: requiredIso(row.created_at),
  };
}

function isTerminalRunStatus(status: string): boolean {
  return !ACTIVE_STATUSES.includes(status);
}

async function countRows(tx: SqlTag, table: string, where = "TRUE"): Promise<number> {
  const [row] = await tx.unsafe(`SELECT COUNT(*)::int AS count FROM ${table} WHERE ${where}`);
  return Number(row?.count ?? 0);
}

interface KnoxDecisionQueueSnapshot {
  pending: number;
  confirmed: number;
  overridden: number;
  total: number;
}

async function getKnoxDecisionQueueSnapshot(tx: SqlTag): Promise<KnoxDecisionQueueSnapshot> {
  const rows = await tx<{ bucket: string; cnt: string | number }[]>`
    SELECT
      CASE
        WHEN ko.decision IS NULL THEN 'pending'
        WHEN ko.decision = 'confirm' THEN 'confirmed'
        WHEN ko.decision = 'override' THEN 'overridden'
        ELSE 'other'
      END AS bucket,
      COUNT(*) AS cnt
    FROM agent_messages am
    LEFT JOIN knox_overrides ko ON ko.rejection_msg_id = am.message_id
    WHERE am.sender_agent = 'knox'
      AND am.intent = 'reject'
    GROUP BY 1
  `;
  const counts: KnoxDecisionQueueSnapshot = {
    pending: 0,
    confirmed: 0,
    overridden: 0,
    total: 0,
  };
  for (const row of rows) {
    const count = Number(row.cnt ?? 0);
    if (row.bucket === "pending") counts.pending = count;
    if (row.bucket === "confirmed") counts.confirmed = count;
    if (row.bucket === "overridden") counts.overridden = count;
    counts.total += count;
  }
  return counts;
}

function numericRunParam(
  params: Record<string, unknown>,
  keys: string[],
): number | undefined {
  for (const key of keys) {
    const value = params[key];
    if (value == null || value === "") continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

async function executeAgenticStep(
  tx: SqlTag,
  run: AgentRunSnapshot,
  step: AgentRunStepSnapshot,
): Promise<AgenticStepExecution> {
  switch (step.stepKey) {
    case "enhance": {
      const total = await countRows(tx, "crawl_targets");
      const missingWebsite = await countRows(tx, "crawl_targets", "website_url IS NULL");
      return {
        status: "completed",
        summary: `Profile inventory checked: ${total.toLocaleString()} institutions, ${missingWebsite.toLocaleString()} missing websites.`,
        detail: { total_institutions: total, missing_website_url: missingWebsite },
      };
    }
    case "discover":
    case "rescue": {
      const discovery = await runMagellanDiscovery({
        runId: run.id,
        mode: step.stepKey === "rescue" ? "rescue" : "discover",
        dryRun: run.runKind === "dry_run",
        limit: numericRunParam(run.params, ["discovery_limit", "rescue_limit", "limit", "size"]),
      });
      return {
        status: "completed",
        summary: `Magellan processed ${discovery.processed.toLocaleString()} institutions and discovered ${discovery.discovered.toLocaleString()} fee schedule URLs (${discovery.retryAfter.toLocaleString()} retry later, ${discovery.dead.toLocaleString()} no source, ${discovery.needsHuman.toLocaleString()} need human review).`,
        detail: {
          selected_institutions: discovery.selected,
          processed_institutions: discovery.processed,
          discovered_fee_urls: discovery.discovered,
          dead_institutions: discovery.dead,
          needs_human: discovery.needsHuman,
          retry_after: discovery.retryAfter,
          failures: discovery.failures,
          attempted_urls: discovery.attemptedUrls,
          discovery_limit: discovery.limit,
          dry_run: discovery.dryRun,
          sample_results: discovery.results.slice(0, 10).map((result) => ({
            institution_id: result.institutionId,
            outcome: result.outcome,
            url: result.url,
            confidence: result.confidence,
            reason: result.reason,
          })),
        },
      };
    }
    case "fetch": {
      const fetched = await runMagellanFetch({
        runId: run.id,
        dryRun: run.runKind === "dry_run",
        limit: numericRunParam(run.params, ["fetch_limit", "limit", "size"]),
        institutionId: numericRunParam(run.params, ["institution_id", "crawl_target_id"]),
      });
      return {
        status: "completed",
        summary: `Magellan fetched ${fetched.succeeded.toLocaleString()} source documents from ${fetched.processed.toLocaleString()} selected institutions (${fetched.failed.toLocaleString()} failed, ${fetched.skipped.toLocaleString()} skipped).`,
        detail: {
          selected_institutions: fetched.selected,
          processed_institutions: fetched.processed,
          fetched_documents: fetched.succeeded,
          failed_fetches: fetched.failed,
          skipped_fetches: fetched.skipped,
          fetched_bytes: fetched.bytes,
          fetch_limit: fetched.limit,
          dry_run: fetched.dryRun,
          sample_results: fetched.results.slice(0, 10).map((result) => ({
            institution_id: result.institutionId,
            outcome: result.outcome,
            final_url: result.finalUrl,
            status_code: result.statusCode,
            document_type: result.documentType,
            content_hash: result.contentHash,
            reason: result.reason,
          })),
        },
      };
    }
    case "read": {
      const read = await runRosettaRead({
        runId: run.id,
        dryRun: run.runKind === "dry_run",
        limit: numericRunParam(run.params, ["read_limit", "limit", "size"]),
        institutionId: numericRunParam(run.params, ["institution_id", "crawl_target_id"]),
      });
      return {
        status: "completed",
        summary: `Rosetta read ${read.completed.toLocaleString()} text artifacts from ${read.processed.toLocaleString()} selected documents (${read.needsOcr.toLocaleString()} need OCR, ${read.failed.toLocaleString()} failed, ${read.empty.toLocaleString()} empty).`,
        detail: {
          selected_documents: read.selected,
          processed_documents: read.processed,
          text_artifacts: read.completed,
          empty_documents: read.empty,
          needs_ocr: read.needsOcr,
          failed_reads: read.failed,
          skipped_reads: read.skipped,
          read_chars: read.chars,
          read_limit: read.limit,
          dry_run: read.dryRun,
          sample_results: read.results.slice(0, 10).map((result) => ({
            crawl_result_id: result.crawlResultId,
            crawl_target_id: result.crawlTargetId,
            institution_name: result.institutionName,
            status: result.status,
            source_url: result.sourceUrl,
            document_type: result.documentType,
            content_type: result.contentType,
            char_count: result.charCount,
            error: result.error,
          })),
        },
      };
    }
    case "extract": {
      const extraction = await runKnoxExtract({
        runId: run.id,
        dryRun: run.runKind === "dry_run",
        limit: numericRunParam(run.params, ["extract_limit", "limit", "size"]),
        institutionId: numericRunParam(run.params, ["institution_id", "crawl_target_id"]),
        db: tx,
      });
      return {
        status: "completed",
        summary: `Knox extracted ${extraction.insertedFees.toLocaleString()} raw fee observations from ${extraction.processedDocuments.toLocaleString()} Rosetta text artifacts (${extraction.extractedFees.toLocaleString()} candidates, ${extraction.skippedFees.toLocaleString()} skipped).`,
        detail: {
          selected_text_artifacts: extraction.selectedDocuments,
          processed_text_artifacts: extraction.processedDocuments,
          extracted_fee_candidates: extraction.extractedFees,
          inserted_raw_fee_observations: extraction.insertedFees,
          skipped_fee_candidates: extraction.skippedFees,
          extract_limit: extraction.limit,
          dry_run: extraction.dryRun,
          sample_results: extraction.results.slice(0, 10).map((result) => ({
            document_text_id: result.documentTextId,
            crawl_result_id: result.crawlResultId,
            crawl_target_id: result.crawlTargetId,
            source_url: result.sourceUrl,
            extracted: result.extracted,
            inserted: result.inserted,
            skipped: result.skipped,
            sample_candidates: result.candidates.slice(0, 5).map((candidate) => ({
              fee_name: candidate.feeName,
              amount: candidate.amount,
              frequency: candidate.frequency,
              canonical_hint: candidate.canonicalHint,
              confidence: candidate.confidence,
            })),
          })),
        },
      };
    }
    case "classify":
    case "verify": {
      const verification = await runDarwinVerify({
        runId: run.id,
        dryRun: run.runKind === "dry_run",
        limit: numericRunParam(run.params, ["verify_limit", "classify_limit", "limit", "size"]),
        institutionId: numericRunParam(run.params, ["institution_id", "crawl_target_id"]),
        db: tx,
      });
      return {
        status: "completed",
        summary: `Darwin verified ${verification.verifiedFees.toLocaleString()} raw fee observations from ${verification.processedRawFees.toLocaleString()} selected rows (${verification.skippedFees.toLocaleString()} skipped).`,
        detail: {
          selected_raw_fees: verification.selectedRawFees,
          processed_raw_fees: verification.processedRawFees,
          verified_fee_observations: verification.verifiedFees,
          skipped_raw_fees: verification.skippedFees,
          verify_limit: verification.limit,
          dry_run: verification.dryRun,
          sample_results: verification.results.slice(0, 10).map((result) => ({
            fee_raw_id: result.feeRawId,
            institution_id: result.institutionId,
            fee_name: result.feeName,
            amount: result.amount,
            canonical_fee_key: result.canonicalFeeKey,
            status: result.status,
            reason: result.reason,
            fee_verified_id: result.feeVerifiedId,
          })),
        },
      };
    }
    case "review": {
      const decisions = await getKnoxDecisionQueueSnapshot(tx);
      return {
        status: "completed",
        summary: `Knox decision queue checked: ${decisions.pending.toLocaleString()} pending human verdicts; ${decisions.confirmed.toLocaleString()} confirmed and ${decisions.overridden.toLocaleString()} overridden.`,
        detail: {
          pending_knox_decisions: decisions.pending,
          confirmed_knox_decisions: decisions.confirmed,
          overridden_knox_decisions: decisions.overridden,
          total_knox_decisions: decisions.total,
          dry_run: run.runKind === "dry_run",
        },
      };
    }
    case "publish":
    case "publish-index":
    case "publish-context": {
      const published = await runHamiltonPublish({
        runId: run.id,
        dryRun: run.runKind === "dry_run",
        limit: numericRunParam(run.params, ["publish_limit", "limit", "size"]),
        institutionId: numericRunParam(run.params, ["institution_id", "crawl_target_id"]),
        minConfidence: numericRunParam(run.params, [
          "publish_min_confidence",
          "min_confidence",
          "confidence_threshold",
        ]),
        db: tx,
      });
      return {
        status: "completed",
        summary: `Hamilton published ${published.publishedFees.toLocaleString()} verified fee observations from ${published.processedVerifiedFees.toLocaleString()} selected rows (${published.skippedFees.toLocaleString()} skipped).`,
        detail: {
          selected_verified_fees: published.selectedVerifiedFees,
          processed_verified_fees: published.processedVerifiedFees,
          published_fees: published.publishedFees,
          skipped_verified_fees: published.skippedFees,
          publish_limit: published.limit,
          publish_min_confidence: published.minConfidence,
          publish_batch_id: published.batchId,
          dry_run: published.dryRun,
          sample_results: published.results.slice(0, 10).map((result) => ({
            fee_verified_id: result.feeVerifiedId,
            institution_id: result.institutionId,
            fee_name: result.feeName,
            amount: result.amount,
            canonical_fee_key: result.canonicalFeeKey,
            status: result.status,
            reason: result.reason,
            fee_published_id: result.feePublishedId,
          })),
        },
      };
    }
    case "assemble":
    case "render": {
      return {
        status: "completed",
        summary: `${step.title} acknowledged for run #${run.id}; report rendering worker remains a dedicated follow-up.`,
        detail: { report_worker_pending: true },
      };
    }
    default:
      return {
        status: "skipped",
        summary: `${step.title} has no TypeScript worker implementation yet.`,
        detail: { missing_worker: step.stepKey },
      };
  }
}

async function executeAgenticRun(runId: number): Promise<void> {
  const prepared = await withTransaction(async (tx) => {
    const [runRow] = await tx`
      SELECT id, agent_name, run_kind, title, status, started_at, completed_at,
             updated_at, trigger_source, triggered_by, correlation_id, backend,
             progress_current, progress_total, current_stage, error_summary,
             summary, params_json
        FROM agent_runs
       WHERE id = ${runId}
       FOR UPDATE
    `;
    if (!runRow || isTerminalRunStatus(String(runRow.status))) return null;
    const run = mapRun(runRow);

    const stepRows = await tx`
      SELECT id, agent_run_id, step_key, agent_name, title, status, sequence,
             summary, error_summary, queued_at, started_at, completed_at, updated_at
        FROM agent_run_steps
       WHERE agent_run_id = ${runId}
       ORDER BY sequence ASC, id ASC
    `;
    const steps = stepRows.map(mapStep);

    await tx`
      UPDATE agent_runs
         SET status = 'running',
             current_stage = ${steps[0]?.stepKey ?? null},
             updated_at = NOW()
       WHERE id = ${runId}
    `;
    await tx`
      INSERT INTO agent_run_events
        (agent_run_id, event_type, status, message, detail)
      VALUES
        (${runId}, 'run.started', 'running',
         'Agentic TypeScript worker pass started.',
         ${JSON.stringify({ backend: run.backend, step_count: steps.length })}::jsonb)
    `;

    return { run, steps };
  });
  if (!prepared) return;

  let completed = 0;
  for (const step of prepared.steps) {
    await withTransaction(async (tx) => {
      await tx`
        UPDATE agent_run_steps
           SET status = 'running',
               started_at = COALESCE(started_at, NOW()),
               updated_at = NOW()
         WHERE id = ${step.id}
      `;
      await tx`
        INSERT INTO agent_run_events
          (agent_run_id, step_id, event_type, status, message, detail)
        VALUES
          (${runId}, ${step.id}, 'step.started', 'running',
           ${`${step.agent} started ${step.title}.`},
           ${JSON.stringify({ step_key: step.stepKey, agent: step.agent })}::jsonb)
      `;
      await tx`
        UPDATE agent_runs
           SET current_stage = ${step.stepKey},
               updated_at = NOW()
         WHERE id = ${runId}
      `;
    });

    try {
      const outcome =
        step.stepKey === "discover" ||
        step.stepKey === "rescue" ||
        step.stepKey === "fetch" ||
        step.stepKey === "read"
          ? await executeAgenticStep(sql, prepared.run, step)
          : await withTransaction((tx) => executeAgenticStep(tx, prepared.run, step));
      if (outcome.status === "completed") completed += 1;
      await withTransaction(async (tx) => {
        await tx`
          UPDATE agent_run_steps
             SET status = ${outcome.status},
                 summary = ${outcome.summary},
                 error_summary = NULL,
                 completed_at = NOW(),
                 updated_at = NOW()
           WHERE id = ${step.id}
        `;
        await tx`
          INSERT INTO agent_run_events
            (agent_run_id, step_id, event_type, status, message, detail)
          VALUES
            (${runId}, ${step.id}, 'step.finished', ${outcome.status},
             ${outcome.summary},
             ${JSON.stringify(outcome.detail ?? {})}::jsonb)
        `;
        await tx`
          UPDATE agent_runs
             SET progress_current = ${completed},
                 current_stage = ${step.stepKey},
                 updated_at = NOW()
           WHERE id = ${runId}
        `;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await withTransaction(async (tx) => {
        await tx`
          UPDATE agent_run_steps
             SET status = 'failed',
                 error_summary = ${message},
                 completed_at = NOW(),
                 updated_at = NOW()
           WHERE id = ${step.id}
        `;
        await tx`
          INSERT INTO agent_run_events
            (agent_run_id, step_id, event_type, status, message, detail)
          VALUES
            (${runId}, ${step.id}, 'step.failed', 'failed',
             ${message},
             ${JSON.stringify({ step_key: step.stepKey, agent: step.agent })}::jsonb)
        `;
        await tx`
          UPDATE agent_runs
             SET status = 'failed',
                 progress_current = ${completed},
                 current_stage = ${step.stepKey},
                 error_summary = ${message},
                 completed_at = NOW(),
                 updated_at = NOW()
           WHERE id = ${runId}
        `;
        await tx`
          INSERT INTO agent_run_events
            (agent_run_id, event_type, status, message, detail)
          VALUES
            (${runId}, 'run.failed', 'failed',
             ${message},
             ${JSON.stringify({ failed_step: step.stepKey, completed_steps: completed })}::jsonb)
        `;
      });
      return;
    }
  }

  const finalStatus: AgentRunStatus = "completed";
  await withTransaction(async (tx) => {
    await tx`
      UPDATE agent_runs
         SET status = ${finalStatus},
             progress_current = ${completed},
             progress_total = ${prepared.steps.length},
             current_stage = NULL,
             summary = ${AGENTIC_SUMMARY},
             error_summary = NULL,
             completed_at = NOW(),
             updated_at = NOW()
       WHERE id = ${runId}
    `;
    await tx`
      INSERT INTO agent_run_events
        (agent_run_id, event_type, status, message, detail)
      VALUES
        (${runId}, 'run.completed', 'completed',
         ${AGENTIC_SUMMARY},
         ${JSON.stringify({ completed_steps: completed, total_steps: prepared.steps.length })}::jsonb)
    `;
  });
}

export async function getAgentRunSteps(runId: number): Promise<AgentRunStepSnapshot[]> {
  const rows = await sql`
    SELECT id, agent_run_id, step_key, agent_name, title, status, sequence,
           summary, error_summary, queued_at, started_at, completed_at, updated_at
      FROM agent_run_steps
     WHERE agent_run_id = ${runId}
     ORDER BY sequence ASC, id ASC
  `;
  return rows.map(mapStep);
}

export async function getAgentRun(runId: number): Promise<AgentRunSnapshot | null> {
  const [row] = await sql`
    SELECT id, agent_name, run_kind, title, status, started_at, completed_at,
           updated_at, trigger_source, triggered_by, correlation_id, backend,
           progress_current, progress_total, current_stage, error_summary,
           summary, params_json
      FROM agent_runs
     WHERE id = ${runId}
  `;
  return row ? mapRun(row) : null;
}

export async function getAgentRunEvents(
  runId: number,
  limit = 100,
): Promise<AgentRunEventSnapshot[]> {
  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 500);
  const rows = await sql`
    SELECT id, agent_run_id, step_id, event_type, status, message, detail, created_at
      FROM agent_run_events
     WHERE agent_run_id = ${runId}
     ORDER BY created_at DESC, id DESC
     LIMIT ${safeLimit}
  `;
  return rows.reverse().map(mapEvent);
}

export async function listAgentRuns(limit = 20): Promise<AgentRunSnapshot[]> {
  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 100);
  const rows = await sql`
    SELECT id, agent_name, run_kind, title, status, started_at, completed_at,
           updated_at, trigger_source, triggered_by, correlation_id, backend,
           progress_current, progress_total, current_stage, error_summary,
           summary, params_json
      FROM agent_runs
     WHERE run_kind IN ('workflow', 'workflow_lane', 'report', 'manual_repair', 'dry_run')
     ORDER BY started_at DESC, id DESC
     LIMIT ${safeLimit}
  `;
  return rows.map(mapRun);
}

export async function listActiveAgentRuns(): Promise<AgentRunSnapshot[]> {
  const rows = await sql`
    SELECT id, agent_name, run_kind, title, status, started_at, completed_at,
           updated_at, trigger_source, triggered_by, correlation_id, backend,
           progress_current, progress_total, current_stage, error_summary,
           summary, params_json
      FROM agent_runs
     WHERE run_kind IN ('workflow', 'workflow_lane', 'report', 'manual_repair', 'dry_run')
       AND status = ANY(${ACTIVE_STATUSES})
     ORDER BY started_at DESC, id DESC
     LIMIT 20
  `;
  return rows.map(mapRun);
}

export async function cancelAgentRun(
  runId: number,
  cancelledBy: string,
): Promise<{ success: boolean; error?: string }> {
  const [run] = await sql`
    SELECT id, status
      FROM agent_runs
     WHERE id = ${runId}
  `;
  if (!run) return { success: false, error: "Agent run not found" };
  if (!ACTIVE_STATUSES.includes(String(run.status))) {
    return { success: false, error: `Agent run is already ${run.status}` };
  }

  await withTransaction(async (tx) => {
    const [updated] = await tx`
      UPDATE agent_runs
         SET status = 'cancelled',
             summary = 'Cancelled before worker execution',
             cancel_requested_at = NOW(),
             completed_at = NOW(),
             updated_at = NOW()
       WHERE id = ${runId}
       RETURNING id
    `;
    await tx`
      UPDATE agent_run_steps
         SET status = 'cancelled',
             error_summary = COALESCE(error_summary, 'Cancelled before worker execution'),
             completed_at = COALESCE(completed_at, NOW()),
             updated_at = NOW()
       WHERE agent_run_id = ${runId}
         AND status IN ('queued', 'running', 'cancel_requested')
    `;
    if (updated) {
      await tx`
        INSERT INTO agent_run_events
          (agent_run_id, event_type, status, message, detail)
        VALUES
          (${runId}, 'run.cancelled', 'cancelled',
           'Run cancelled before completion.',
           ${JSON.stringify({ cancelled_by: cancelledBy })}::jsonb)
      `;
    }
  });
  return { success: true };
}

export interface CancelAllAgentRunsResult {
  requested: number;
  cancelled: number;
  failed: Array<{ runId: number; error: string }>;
}

export async function cancelAllActiveAgentRuns(
  cancelledBy: string,
): Promise<CancelAllAgentRunsResult> {
  const activeRuns = await sql`
    SELECT id
      FROM agent_runs
     WHERE run_kind IN ('workflow', 'workflow_lane', 'report', 'manual_repair', 'dry_run')
       AND status IN ('queued', 'running', 'cancel_requested')
     ORDER BY started_at ASC, id ASC
  `;
  const result: CancelAllAgentRunsResult = {
    requested: activeRuns.length,
    cancelled: 0,
    failed: [],
  };

  for (const run of activeRuns) {
    const runId = Number(run.id);
    const cancellation = await cancelAgentRun(runId, cancelledBy);
    if (cancellation.success) {
      result.cancelled += 1;
    } else {
      result.failed.push({ runId, error: cancellation.error ?? "Unknown cancellation failure" });
    }
  }

  return result;
}

export async function startAgentRun(input: StartAgentRunInput): Promise<StartAgentRunResult> {
  const params = input.params ?? {};
  const triggerSource = input.triggerSource ?? "admin";
  const progressTotal = input.steps.length;
  const firstStage = input.steps[0]?.key ?? null;

  if (input.idempotencyKey) {
    const [existing] = await sql`
      SELECT id, agent_name, run_kind, title, status, started_at, completed_at,
             updated_at, trigger_source, triggered_by, correlation_id, backend,
             progress_current, progress_total, current_stage, error_summary,
             summary, params_json
        FROM agent_runs
       WHERE idempotency_key = ${input.idempotencyKey}
         AND status = ANY(${ACTIVE_STATUSES})
       ORDER BY started_at DESC
       LIMIT 1
    `;
    if (existing) {
      const run = mapRun(existing);
      return { run, steps: await getAgentRunSteps(run.id), reused: true };
    }
  }

  const created = await withTransaction(async (tx) => {
    const [runRow] = await tx`
      INSERT INTO agent_runs
        (agent_name, run_kind, state_code, title, summary, status, params_json,
         trigger_source, triggered_by, idempotency_key, backend,
         progress_current, progress_total, current_stage, started_at, updated_at)
      VALUES
        (${input.agent}, ${input.kind}, ${input.stateCode ?? null}, ${input.title}, ${input.summary ?? null},
         'queued', ${JSON.stringify(params)}::jsonb, ${triggerSource},
         ${input.triggeredBy}, ${input.idempotencyKey ?? null}, 'agentic_v1',
         0, ${progressTotal}, ${firstStage}, NOW(), NOW())
      RETURNING id, agent_name, run_kind, title, status, started_at, completed_at,
                updated_at, trigger_source, triggered_by, correlation_id, backend,
                progress_current, progress_total, current_stage, error_summary,
                summary, params_json
    `;
    const run = mapRun(runRow);

    for (const [index, step] of input.steps.entries()) {
      await tx`
        INSERT INTO agent_run_steps
          (agent_run_id, step_key, agent_name, title, status, sequence, input_payload)
        VALUES
          (${run.id}, ${step.key}, ${step.agent}, ${step.title},
           'queued', ${index + 1}, ${JSON.stringify(step.input ?? {})}::jsonb)
      `;
    }

    await tx`
      INSERT INTO agent_run_events
        (agent_run_id, event_type, status, message, detail)
      VALUES
        (${run.id}, 'run.created', 'queued',
         'Agentic run accepted by the TypeScript run ledger. No retired external worker process was launched.',
         ${JSON.stringify({
           agent: input.agent,
           kind: input.kind,
           title: input.title,
           steps: input.steps.map((step) => step.key),
         })}::jsonb)
    `;

    const stepRows = await tx`
      SELECT id, agent_run_id, step_key, agent_name, title, status, sequence,
             summary, error_summary, queued_at, started_at, completed_at, updated_at
        FROM agent_run_steps
       WHERE agent_run_id = ${run.id}
       ORDER BY sequence ASC, id ASC
    `;

    return {
      run,
      steps: stepRows.map(mapStep),
      reused: false,
    };
  });

  if (getExecutionBackend() !== "agentic_v1") {
    await withTransaction(async (tx) => {
      await tx`
        INSERT INTO agent_run_events
          (agent_run_id, event_type, status, message, detail)
        VALUES
          (${created.run.id}, 'run.blocked', 'blocked',
           'Worker execution is waiting for EXECUTION_BACKEND=agentic_v1.',
           ${JSON.stringify({
             reason: "agentic execution backend is disabled",
             retired_external_worker_blocked: true,
           })}::jsonb)
      `;
      await tx`
        UPDATE agent_run_steps
           SET status = 'blocked',
               error_summary = 'Waiting for EXECUTION_BACKEND=agentic_v1',
               updated_at = NOW()
         WHERE agent_run_id = ${created.run.id}
           AND sequence = 1
      `;
      await tx`
        UPDATE agent_runs
           SET status = 'blocked',
               error_summary = 'agentic execution backend is disabled',
               summary = COALESCE(summary, 'Run record created; execution is blocked until EXECUTION_BACKEND=agentic_v1.'),
               updated_at = NOW()
         WHERE id = ${created.run.id}
      `;
    });
    const [run, steps] = await Promise.all([
      getAgentRun(created.run.id),
      getAgentRunSteps(created.run.id),
    ]);
    return { run: run ?? created.run, steps, reused: false };
  }

  await executeAgenticRun(created.run.id);
  const [run, steps] = await Promise.all([
    getAgentRun(created.run.id),
    getAgentRunSteps(created.run.id),
  ]);
  return { run: run ?? created.run, steps, reused: false };
}

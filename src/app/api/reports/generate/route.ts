/**
 * POST /api/reports/generate
 * Phase 13-03 + 14-03: report generation endpoint with cron auth support.
 *
 * Enqueues a report generation job. Returns jobId immediately — does NOT wait
 * for Modal to complete (fire-and-forget). Clients poll /api/reports/[id]/status.
 *
 * Auth paths:
 *   1. Session cookie (getCurrentUser) — normal user-triggered generation
 *   2. X-Cron-Secret header — cron-triggered generation (run_monthly_pulse)
 *      Cron jobs get user_id=null in report_jobs; this is correct per ReportJob spec.
 *
 * Flow: auth → validate report_type → freshness gate → DB insert → Modal trigger
 *
 * Decision refs: D-04, D-07, D-10 (see 13-CONTEXT.md)
 * Threat refs: T-13-10, T-13-13, T-14-07
 */

import { NextResponse, after } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getSql } from '@/lib/crawler-db/connection';
import { checkFreshness } from '@/lib/report-engine/freshness';
import type { ReportType } from '@/lib/report-engine/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Mark a report job as failed with a descriptive reason.
 * Called on every Modal trigger failure path so no job is left in 'pending' forever.
 * Uses the schema column `error` (not `error_message`) per migration 20260406_report_jobs.sql.
 * Sets completed_at to close the job lifecycle even for failed jobs.
 */
async function markJobFailed(jobId: string, reason: string): Promise<void> {
  try {
    const sql = getSql();
    await sql`
      UPDATE report_jobs
      SET status       = 'failed',
          error        = ${'modal trigger failed: ' + reason.slice(0, 490)},
          completed_at = now()
      WHERE id = ${jobId}
    `;
  } catch (updateErr) {
    console.error('[reports/generate] failed to mark job failed:', updateErr);
  }
}

// Allowlist — T-13-13: explicit validation before DB insert
const VALID_REPORT_TYPES: ReadonlySet<string> = new Set([
  'national_index',
  'state_index',
  'peer_brief',
  'monthly_pulse',
]);

// Derive freshness scope from report type
function getFreshnessScope(
  reportType: ReportType,
): 'national' | 'state' | 'peer' {
  if (reportType === 'state_index') return 'state';
  if (reportType === 'peer_brief') return 'peer';
  return 'national';
}

export async function POST(request: Request) {
  // T-13-10 / T-14-07: dual auth — session cookie or cron secret header
  const user = await getCurrentUser();

  let cronAuthed = false;
  if (!user) {
    const headerSecret = request.headers.get('x-cron-secret');
    // Accept either REPORT_CRON_SECRET or BFI_REVALIDATE_TOKEN (Hamilton chat uses the latter)
    const secrets = [process.env.REPORT_CRON_SECRET, process.env.BFI_REVALIDATE_TOKEN].filter(
      (s): s is string => typeof s === 'string' && s.length > 0,
    );
    if (headerSecret && secrets.some((s) => s === headerSecret)) {
      cronAuthed = true;
    }
  }

  if (!user && !cronAuthed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { report_type?: unknown; params?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { report_type, params } = body;

  // T-13-13: validate report_type against explicit allowlist
  if (typeof report_type !== 'string' || !VALID_REPORT_TYPES.has(report_type)) {
    return NextResponse.json(
      {
        error: `Invalid report_type. Must be one of: ${[...VALID_REPORT_TYPES].join(', ')}`,
      },
      { status: 400 },
    );
  }

  const validatedType = report_type as ReportType;
  const validatedParams =
    params !== null && typeof params === 'object' && !Array.isArray(params)
      ? (params as Record<string, unknown>)
      : {};

  // D-10: freshness gate — block generation when crawl data is stale
  const scope = getFreshnessScope(validatedType);
  const stateCode =
    scope === 'state' && typeof validatedParams.state_code === 'string'
      ? validatedParams.state_code
      : undefined;

  const freshnessResult = await checkFreshness(scope, stateCode);
  if (!freshnessResult.fresh) {
    return NextResponse.json(
      {
        error: freshnessResult.reason,
        medianAgeDays: freshnessResult.medianAgeDays,
        threshold: freshnessResult.threshold,
      },
      { status: 422 },
    );
  }

  // Insert report_jobs row — returns id immediately
  // user_id is null for cron-triggered jobs (T-14-08: designed behavior)
  const sql = getSql();
  const rows = await sql<Array<{ id: string }>>`
    INSERT INTO report_jobs (report_type, status, params, user_id)
    VALUES (
      ${validatedType},
      'pending',
      ${JSON.stringify(validatedParams)},
      ${user?.id ?? null}
    )
    RETURNING id
  `;

  const jobId = rows[0]?.id;
  if (!jobId) {
    return NextResponse.json(
      { error: 'Failed to create report job' },
      { status: 500 },
    );
  }

  // Trigger Modal via after() — runs after response is sent, Vercel keeps function alive.
  // Modal endpoint is synchronous (runs full pipeline), so we can't await it before responding.
  const modalUrl = process.env.MODAL_REPORT_URL;

  if (!modalUrl) {
    // Terminal error: nothing will ever process this job. Fail it immediately so
    // the row does not sit in 'pending' forever (audit Finding 3 ghost-queue fix).
    await markJobFailed(jobId, 'MODAL_REPORT_URL not configured');
    return NextResponse.json(
      { error: 'Report worker not configured (MODAL_REPORT_URL missing)' },
      { status: 503 },
    );
  }

  after(async () => {
    try {
      const triggerRes = await fetch(modalUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: jobId,
          report_type: validatedType,
          params: validatedParams,
        }),
      });
      if (!triggerRes.ok) {
        const bodyText = await triggerRes.text().catch(() => '');
        console.error('[reports/generate] Modal returned', triggerRes.status, bodyText.slice(0, 200));
        await markJobFailed(jobId, `modal http ${triggerRes.status}`);
      }
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error('[reports/generate] Modal trigger threw:', reason);
      await markJobFailed(jobId, reason);
    }
  });

  return NextResponse.json({ jobId }, { status: 202 });
}

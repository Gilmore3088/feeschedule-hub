/**
 * POST /api/reports/generate
<<<<<<< HEAD
 * Phase 13-03: D-07 implementation
=======
 * Phase 13-03 + 14-03: report generation endpoint with cron auth support.
>>>>>>> worktree-agent-a6da4c7b
 *
 * Enqueues a report generation job. Returns jobId immediately — does NOT wait
 * for Modal to complete (fire-and-forget). Clients poll /api/reports/[id]/status.
 *
<<<<<<< HEAD
 * Flow: auth → validate report_type → freshness gate → DB insert → Modal trigger
 *
 * Decision refs: D-04, D-07, D-10 (see 13-CONTEXT.md)
 * Threat refs: T-13-10, T-13-13
=======
 * Auth paths:
 *   1. Session cookie (getCurrentUser) — normal user-triggered generation
 *   2. X-Cron-Secret header — cron-triggered generation (run_monthly_pulse)
 *      Cron jobs get user_id=null in report_jobs; this is correct per ReportJob spec.
 *
 * Flow: auth → validate report_type → freshness gate → DB insert → Modal trigger
 *
 * Decision refs: D-04, D-07, D-10 (see 13-CONTEXT.md)
 * Threat refs: T-13-10, T-13-13, T-14-07
>>>>>>> worktree-agent-a6da4c7b
 */

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getSql } from '@/lib/crawler-db/connection';
import { checkFreshness } from '@/lib/report-engine/freshness';
import type { ReportType } from '@/lib/report-engine/types';

export const dynamic = 'force-dynamic';

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
<<<<<<< HEAD
  // T-13-10: auth required before any processing
  const user = await getCurrentUser();
  if (!user) {
=======
  // T-13-10 / T-14-07: dual auth — session cookie or cron secret header
  const user = await getCurrentUser();

  let cronAuthed = false;
  if (!user) {
    const cronSecret = process.env.REPORT_CRON_SECRET;
    const headerSecret = request.headers.get('x-cron-secret');
    // T-14-07: guard length > 0 prevents empty-string bypass
    if (cronSecret && cronSecret.length > 0 && headerSecret === cronSecret) {
      cronAuthed = true;
    }
  }

  if (!user && !cronAuthed) {
>>>>>>> worktree-agent-a6da4c7b
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
<<<<<<< HEAD
=======
  // user_id is null for cron-triggered jobs (T-14-08: designed behavior)
>>>>>>> worktree-agent-a6da4c7b
  const sql = getSql();
  const rows = await sql<Array<{ id: string }>>`
    INSERT INTO report_jobs (report_type, status, params, user_id)
    VALUES (
      ${validatedType},
      'pending',
      ${JSON.stringify(validatedParams)},
<<<<<<< HEAD
      ${user.id}
=======
      ${user?.id ?? null}
>>>>>>> worktree-agent-a6da4c7b
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

  // Fire-and-forget Modal trigger — do NOT await (job tracked via polling)
<<<<<<< HEAD
  // MODAL_REPORT_URL is optional at this stage; warn if missing
=======
>>>>>>> worktree-agent-a6da4c7b
  const modalUrl = process.env.MODAL_REPORT_URL;
  if (!modalUrl) {
    console.warn('[reports/generate] MODAL_REPORT_URL not configured — skipping Modal trigger');
  } else {
    // Non-blocking: intentionally not awaited
    fetch(modalUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job_id: jobId,
        html: '',
        report_type: validatedType,
      }),
    }).catch((err: unknown) => {
      console.error('[reports/generate] Modal trigger failed:', err instanceof Error ? err.message : String(err));
    });
  }

  return NextResponse.json({ jobId }, { status: 202 });
}

/**
 * POST /api/reports/generate
 * Phase 13-03 + 14-03: report generation endpoint with cron auth support.
 *
 * Enqueues a report generation job. The active backend decides whether it can
 * execute; clients poll /api/reports/[id]/status for completion.
 *
 * Auth paths:
 *   1. Session cookie (getCurrentUser) — normal user-triggered generation
 *   2. X-Cron-Secret header — cron-triggered generation (run_monthly_pulse)
 *      Cron jobs get user_id=null in report_jobs; this is correct per ReportJob spec.
 *
 * Flow: auth → validate report_type → freshness gate → DB insert → backend trigger
 *
 * Decision refs: D-04, D-07, D-10 (see 13-CONTEXT.md)
 * Threat refs: T-13-10, T-13-13, T-14-07
 */

import { NextResponse } from 'next/server';
import { getCurrentUser, hasPermission } from '@/lib/auth';
import { getSql } from '@/lib/crawler-db/connection';
import { checkFreshness } from '@/lib/report-engine/freshness';
import { triggerReportJob } from '@/lib/report-job-runner';
import type { ReportType } from '@/lib/report-engine/types';
import { matchesConfiguredCronSecret } from '@/lib/cron-secret';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

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
    if (matchesConfiguredCronSecret(headerSecret)) {
      cronAuthed = true;
    }
  }

  if (!user && !cronAuthed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (user && !hasPermission(user, 'trigger_jobs')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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

  const trigger = await triggerReportJob(
    jobId,
    validatedType,
    validatedParams,
    user?.username ?? 'monthly-pulse',
    cronAuthed ? 'schedule' : 'api',
  );
  if (!trigger.success) {
    return NextResponse.json(
      { error: trigger.error ?? 'Report worker failed to accept the job', jobId },
      { status: 503 },
    );
  }

  return NextResponse.json({ jobId }, { status: 202 });
}

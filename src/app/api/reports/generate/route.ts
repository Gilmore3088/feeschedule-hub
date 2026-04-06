/**
 * POST /api/reports/generate
 * Phase 13-03: D-07 implementation
 *
 * Enqueues a report generation job. Returns jobId immediately — does NOT wait
 * for Modal to complete (fire-and-forget). Clients poll /api/reports/[id]/status.
 *
 * Flow: auth → validate report_type → freshness gate → DB insert → Modal trigger
 *
 * Decision refs: D-04, D-07, D-10 (see 13-CONTEXT.md)
 * Threat refs: T-13-10, T-13-13
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
  // T-13-10: auth required before any processing
  const user = await getCurrentUser();
  if (!user) {
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
  const sql = getSql();
  const rows = await sql<Array<{ id: string }>>`
    INSERT INTO report_jobs (report_type, status, params, user_id)
    VALUES (
      ${validatedType},
      'pending',
      ${JSON.stringify(validatedParams)},
      ${user.id}
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
  // MODAL_REPORT_URL is optional at this stage; warn if missing
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

/**
 * POST /api/reports/[id]/assemble
 * Internal endpoint called by Modal worker (server-to-server).
 *
 * Runs assembleAndRender() for a pending report job and returns the HTML.
 * Auth: shared secret via X-Internal-Secret header (T-W3P-01).
 * Not exposed to browsers — only Modal calls this endpoint.
 *
 * Flow: validate secret -> load job row -> assembleAndRender -> return HTML
 */

import { NextResponse } from 'next/server';
import { getSql } from '@/lib/crawler-db/connection';
import { assembleAndRender } from '@/lib/report-engine/assemble-and-render';
import type { ReportType } from '@/lib/report-engine/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const VALID_REPORT_TYPES: ReadonlySet<string> = new Set([
  'national_index',
  'state_index',
  'peer_brief',
  'monthly_pulse',
]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // T-W3P-01: validate shared secret — guard against empty string
  const secret = process.env.REPORT_INTERNAL_SECRET;
  const headerSecret = request.headers.get('x-internal-secret');
  if (!secret || secret.length === 0 || headerSecret !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: jobId } = await params;

  // Load job row — only process pending jobs
  const sql = getSql();
  const rows = await sql<
    Array<{ report_type: string; params: string | null }>
  >`
    SELECT report_type, params FROM report_jobs
    WHERE id = ${jobId} AND status = 'pending'
  `;

  if (rows.length === 0) {
    return NextResponse.json(
      { error: 'Job not found or not pending' },
      { status: 404 },
    );
  }

  const row = rows[0];
  const reportType = row.report_type;

  if (!VALID_REPORT_TYPES.has(reportType)) {
    return NextResponse.json(
      { error: `Invalid report_type: ${reportType}` },
      { status: 400 },
    );
  }

  let parsedParams: Record<string, unknown> = {};
  if (row.params) {
    try {
      parsedParams =
        typeof row.params === 'string'
          ? JSON.parse(row.params)
          : (row.params as Record<string, unknown>);
    } catch {
      parsedParams = {};
    }
  }

  try {
    const html = await assembleAndRender(
      reportType as ReportType,
      parsedParams,
      jobId,
    );
    return NextResponse.json({ html });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    // assembleAndRender already marks job as 'failed' — no extra DB write needed
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

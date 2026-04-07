/**
 * GET /api/reports/[id]/status
 * Phase 13-03: D-08 implementation
 *
 * Polls job state. Returns presigned_url only when status='complete' and
 * artifact_key is set — generated fresh on every call (never stored, per D-04).
 *
 * Ownership rule: user sees their own jobs; admin can see cron jobs (user_id IS NULL).
 *
 * Decision refs: D-04, D-08 (see 13-CONTEXT.md)
 * Threat refs: T-13-11
 */

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getSql } from '@/lib/crawler-db/connection';
import { generatePresignedUrl } from '@/lib/report-engine/presign';
import type { ReportJob } from '@/lib/report-engine/types';

export const dynamic = 'force-dynamic';

// TTL per D-04: 1 hour
const PRESIGNED_TTL_SECONDS = 3600;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // T-13-11: auth required before any DB query
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Next.js 15: params is a Promise — must await
  const { id } = await params;

  const sql = getSql();
  const rows = await sql<ReportJob[]>`
    SELECT * FROM report_jobs WHERE id = ${id} LIMIT 1
  `;

  const job = rows[0];
  if (!job) {
    return NextResponse.json({ error: 'Report job not found' }, { status: 404 });
  }

  // T-13-11: ownership guard
  // Both user.id and job.user_id are integers — compare with Number() for safety
  const isOwner = Number(job.user_id) === Number(user.id);
  const isAdminViewingCronJob = user.role === 'admin' && job.user_id == null;
  const isAdmin = user.role === 'admin';
  if (!isOwner && !isAdminViewingCronJob && !isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Generate presigned URL only when complete — per D-04 "generate at download time"
  let presignedUrl: string | null = null;
  if (job.status === 'complete' && job.artifact_key) {
    try {
      presignedUrl = await generatePresignedUrl(job.artifact_key, PRESIGNED_TTL_SECONDS);
    } catch (err) {
      console.error('[reports/status] Presign failed:', err instanceof Error ? err.message : err);
      // Don't crash the status endpoint — return null URL with a note
    }
  }

  return NextResponse.json({
    id: job.id,
    status: job.status,
    report_type: job.report_type,
    created_at: job.created_at,
    completed_at: job.completed_at,
    error: job.error ?? null,
    presigned_url: presignedUrl,
  });
}

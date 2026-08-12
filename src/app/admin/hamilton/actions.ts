"use server";

import { revalidatePath } from "next/cache";
import { getSql } from "@/lib/crawler-db/connection";
import { requireAuth } from "@/lib/auth";
import { cancelJob } from "@/lib/job-runner";
import { triggerReportJob } from "@/lib/report-job-runner";
import type { ReportType } from "@/lib/report-engine/types";

// Slug generation helper — title to URL-safe slug
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

/**
 * Publish a completed report job to the public catalog.
 * T-16-08: requireAuth enforced before any DB write.
 * T-16-11: generateSlug strips non-alphanumeric chars; parameterized query.
 */
export async function publishReport(
  jobId: string,
  title: string,
  reportType: ReportType,
  isPublic: boolean = true,
): Promise<{ success: boolean; slug?: string; error?: string }> {
  await requireAuth("edit");

  const slug = generateSlug(title);

  try {
    const sql = getSql();
    const rows = await sql<Array<{ slug: string }>>`
      INSERT INTO published_reports (job_id, report_type, slug, title, is_public)
      VALUES (${jobId}, ${reportType}, ${slug}, ${title}, ${isPublic})
      ON CONFLICT (slug) DO NOTHING
      RETURNING slug
    `;

    let finalSlug = rows[0]?.slug;

    if (!finalSlug) {
      // Slug collision — append timestamp
      const fallbackSlug = `${slug}-${Date.now()}`;
      await sql`
        INSERT INTO published_reports (job_id, report_type, slug, title, is_public)
        VALUES (${jobId}, ${reportType}, ${fallbackSlug}, ${title}, ${isPublic})
      `;
      finalSlug = fallbackSlug;
    }

    // Trigger ISR revalidation per D-04
    revalidatePath("/reports");
    revalidatePath(`/reports/${finalSlug}`, "page");
    revalidatePath("/admin/hamilton");

    return { success: true, slug: finalSlug };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

/**
 * Cancel a pending/assembling/rendering report job.
 * Sets status to 'failed' with a cancellation reason.
 */
export async function cancelReport(
  jobId: string,
): Promise<{ success: boolean; error?: string }> {
  await requireAuth("cancel_jobs");

  try {
    const sql = getSql();
    const [job] = await sql`
      SELECT id, status, ops_job_id
        FROM report_jobs
       WHERE id = ${jobId}
    `;
    if (!job || !["pending", "assembling", "rendering", "cancel_requested"].includes(String(job.status))) {
      return { success: false, error: "Job not found or already complete/failed" };
    }
    if (!job.ops_job_id) {
      return { success: false, error: "This legacy report has no cancellable Modal call ID" };
    }

    await sql`
      UPDATE report_jobs
         SET status = 'cancel_requested', cancel_requested_at = NOW()
       WHERE id = ${jobId}
    `;
    const cancelled = await cancelJob(Number(job.ops_job_id));
    if (!cancelled.success) {
      await sql`
        UPDATE report_jobs SET error = ${cancelled.error ?? "Modal cancellation failed"}
         WHERE id = ${jobId} AND status = 'cancel_requested'
      `;
      return cancelled;
    }
    await sql`
      UPDATE report_jobs
         SET status = 'cancelled', error = 'Cancelled by user', completed_at = NOW()
       WHERE id = ${jobId} AND status = 'cancel_requested'
    `;

    revalidatePath("/admin/hamilton");
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

/**
 * Cancel all non-terminal report jobs at once.
 */
export async function cancelAllPending(): Promise<{ success: boolean; count?: number; error?: string }> {
  await requireAuth("cancel_jobs");

  try {
    const sql = getSql();
    const rows = await sql`
      SELECT id FROM report_jobs
       WHERE status IN ('pending', 'assembling', 'rendering', 'cancel_requested')
    `;

    let count = 0;
    const errors: string[] = [];
    for (const row of rows) {
      const result = await cancelReport(String(row.id));
      if (result.success) count += 1;
      else errors.push(result.error ?? `Failed to cancel ${row.id}`);
    }

    revalidatePath("/admin/hamilton");
    return errors.length > 0
      ? { success: false, count, error: errors.join("; ") }
      : { success: true, count };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

/**
 * Retry a failed report job — creates a new job with the same type and params.
 * T-16-09: requireAuth first; WHERE status = 'failed' prevents misuse.
 * T-16-10: UUID mismatch returns no rows gracefully.
 */
export async function retryReport(
  jobId: string,
): Promise<{ success: boolean; newJobId?: string; error?: string }> {
  const user = await requireAuth("trigger_jobs");

  try {
    const sql = getSql();
    const rows = await sql<Array<{ report_type: string; params: unknown }>>`
      SELECT report_type, params FROM report_jobs
      WHERE id = ${jobId} AND status = 'failed'
      LIMIT 1
    `;

    if (!rows[0]) {
      return { success: false, error: "Job not found or not in failed state" };
    }

    const { report_type, params } = rows[0];
    const newRows = await sql<Array<{ id: string }>>`
      INSERT INTO report_jobs (report_type, status, params)
      VALUES (${report_type}, 'pending', ${JSON.stringify(params ?? {})})
      RETURNING id
    `;

    const newJobId = newRows[0]?.id;
    if (!newJobId) {
      return { success: false, error: "Failed to create retry job" };
    }

    const trigger = await triggerReportJob(
      newJobId,
      report_type as ReportType,
      (params ?? {}) as Record<string, unknown>,
      user.username,
      "admin",
    );
    if (!trigger.success) {
      revalidatePath("/admin/hamilton");
      return { success: false, error: trigger.error };
    }

    revalidatePath("/admin/hamilton");
    return { success: true, newJobId };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { getSql } from "@/lib/crawler-db/connection";
import { requireAuth } from "@/lib/auth";
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
  await requireAuth("trigger_jobs");

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
  await requireAuth("trigger_jobs");

  try {
    const sql = getSql();
    const rows = await sql`
      UPDATE report_jobs
      SET status = 'failed', error = 'Cancelled by user', completed_at = NOW()
      WHERE id = ${jobId} AND status IN ('pending', 'assembling', 'rendering')
      RETURNING id
    `;

    if (!rows[0]) {
      return { success: false, error: "Job not found or already complete/failed" };
    }

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
  await requireAuth("trigger_jobs");

  try {
    const sql = getSql();
    const rows = await sql`
      UPDATE report_jobs
      SET status = 'failed', error = 'Cancelled by user (bulk)', completed_at = NOW()
      WHERE status IN ('pending', 'assembling', 'rendering')
      RETURNING id
    `;

    revalidatePath("/admin/hamilton");
    return { success: true, count: rows.length };
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
  await requireAuth("trigger_jobs");

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

    // Fire-and-forget Modal trigger for the new job
    const modalUrl = process.env.MODAL_REPORT_URL;
    if (modalUrl) {
      fetch(modalUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: newJobId, html: "", report_type }),
      }).catch((err: unknown) => {
        console.error(
          "[retryReport] Modal trigger failed:",
          err instanceof Error ? err.message : String(err),
        );
      });
    }

    revalidatePath("/admin/hamilton");
    return { success: true, newJobId };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

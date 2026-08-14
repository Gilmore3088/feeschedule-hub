"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { getAutomationControl } from "@/lib/automation-control";
import { sql, withTransaction } from "@/lib/data-store/connection";

const idSchema = z.coerce.number().int().positive();
const noteSchema = z.string().trim().max(2_000).optional();

function formId(formData: FormData): number | null {
  const parsed = idSchema.safeParse(formData.get("submission_id"));
  return parsed.success ? parsed.data : null;
}

function formNotes(formData: FormData): string | null {
  const value = formData.get("review_notes");
  const parsed = noteSchema.safeParse(typeof value === "string" ? value : undefined);
  if (!parsed.success) return null;
  return parsed.data?.trim() || null;
}

function refreshTrustPaths(institutionId: number | null): void {
  revalidatePath("/admin");
  revalidatePath("/admin/quality");
  revalidatePath("/admin/data-quality");
  if (institutionId) {
    revalidatePath(`/admin/institution/${institutionId}`);
    revalidatePath(`/institution/${institutionId}`);
  }
}

async function submissionExists(id: number) {
  const rows = await sql<{
    id: number;
    institution_id: number | null;
    institution_name: string;
    source_url: string;
    review_status: string;
  }[]>`
    SELECT id, institution_id, institution_name, source_url, review_status
    FROM community_fee_submissions
    WHERE id = ${id}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function acceptSourceSubmission(formData: FormData): Promise<void> {
  const user = await requireAuth("approve");
  const id = formId(formData);
  if (!id) return;
  const notes = formNotes(formData);
  const automation = await getAutomationControl().catch(() => null);
  const resolution = automation?.enabled
    ? "manual_validation_needed"
    : "ready_for_validation_when_automation_resumes";
  const queueStatus = automation?.enabled
    ? "manual_validation_needed"
    : "ready_when_automation_resumes";
  const validationMode = automation?.enabled ? "automation_guarded" : "manual";

  try {
    const submission = await submissionExists(id);
    if (!submission) return;

    await withTransaction(async (tx) => {
      await tx`
        UPDATE community_fee_submissions
        SET review_status = 'accepted',
            reviewed_at = NOW(),
            reviewer_id = ${user.id},
            review_notes = ${notes},
            resolution = ${resolution},
            source_document_id = NULL,
            agent_run_id = NULL
        WHERE id = ${id}
      `;

      if (submission.institution_id) {
        await tx`
          UPDATE institution_sources
          SET fee_schedule_url = ${submission.source_url}
          WHERE id = ${submission.institution_id}
            AND (
              fee_schedule_url IS NULL
              OR btrim(fee_schedule_url) = ''
              OR fee_schedule_url <> ${submission.source_url}
            )
        `;

        await tx`
          INSERT INTO source_validation_queue
            (institution_id, submission_id, source_url, queue_status, validation_mode,
             created_by_user_id, notes)
          VALUES
            (${submission.institution_id}, ${id}, ${submission.source_url}, ${queueStatus},
             ${validationMode}, ${user.id}, ${notes})
          ON CONFLICT (submission_id)
          WHERE submission_id IS NOT NULL
          DO UPDATE SET
            source_url = EXCLUDED.source_url,
            queue_status = EXCLUDED.queue_status,
            validation_mode = EXCLUDED.validation_mode,
            created_by_user_id = EXCLUDED.created_by_user_id,
            notes = EXCLUDED.notes,
            updated_at = NOW()
        `;
      }

      await tx`
        INSERT INTO community_fee_submission_events
          (submission_id, actor_user_id, event_type, previous_status, new_status, notes, metadata)
        VALUES
          (${id}, ${user.id}, 'accepted', ${submission.review_status}, 'accepted', ${notes},
           ${sql.json({
             resolution,
             automation_enabled: automation?.enabled ?? false,
             institution_id: submission.institution_id,
             validation_queue_status: submission.institution_id ? queueStatus : null,
             provider_call_queued: false,
           })})
      `;
    });

    refreshTrustPaths(submission.institution_id);
  } catch (e) {
    console.error("acceptSourceSubmission failed:", e);
  }
}

export async function rejectSourceSubmission(formData: FormData): Promise<void> {
  const user = await requireAuth("approve");
  const id = formId(formData);
  if (!id) return;
  const notes = formNotes(formData);

  try {
    const submission = await submissionExists(id);
    if (!submission) return;

    await withTransaction(async (tx) => {
      await tx`
        UPDATE community_fee_submissions
        SET review_status = 'rejected',
            reviewed_at = NOW(),
            reviewer_id = ${user.id},
            review_notes = ${notes},
            resolution = 'rejected_not_official',
            source_document_id = NULL,
            agent_run_id = NULL
        WHERE id = ${id}
      `;
      await tx`
        INSERT INTO community_fee_submission_events
          (submission_id, actor_user_id, event_type, previous_status, new_status, notes, metadata)
        VALUES
          (${id}, ${user.id}, 'rejected', ${submission.review_status}, 'rejected', ${notes},
           ${sql.json({ institution_id: submission.institution_id })})
      `;
    });

    refreshTrustPaths(submission.institution_id);
  } catch (e) {
    console.error("rejectSourceSubmission failed:", e);
  }
}

export async function requestSourceSubmissionInfo(formData: FormData): Promise<void> {
  const user = await requireAuth("approve");
  const id = formId(formData);
  if (!id) return;
  const notes = formNotes(formData);

  try {
    const submission = await submissionExists(id);
    if (!submission) return;

    await withTransaction(async (tx) => {
      await tx`
        UPDATE community_fee_submissions
        SET review_status = 'needs_info',
            reviewed_at = NOW(),
            reviewer_id = ${user.id},
            review_notes = ${notes},
            resolution = 'needs_more_context'
        WHERE id = ${id}
      `;
      await tx`
        INSERT INTO community_fee_submission_events
          (submission_id, actor_user_id, event_type, previous_status, new_status, notes, metadata)
        VALUES
          (${id}, ${user.id}, 'needs_info', ${submission.review_status}, 'needs_info', ${notes},
           ${sql.json({ institution_id: submission.institution_id })})
      `;
    });

    refreshTrustPaths(submission.institution_id);
  } catch (e) {
    console.error("requestSourceSubmissionInfo failed:", e);
  }
}

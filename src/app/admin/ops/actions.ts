"use server";

import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { requireAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

const DB_PATH = path.join(process.cwd(), "data", "crawler.db");

function getWriteDb(): Database.Database {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = normal");
  db.pragma("cache_size = -32000");
  db.pragma("mmap_size = 268435456");
  db.pragma("temp_store = memory");
  return db;
}

const VALID_REASONS = [
  "wrong_url",
  "account_agreement",
  "login_required",
  "pdf_scanned",
  "pdf_complex",
  "html_dynamic",
  "multiple_links",
  "no_fees_found",
  "site_down",
] as const;

type FailureReason = (typeof VALID_REASONS)[number];

export async function classifyFailureReason(
  targetId: number,
  reason: FailureReason,
  note?: string
) {
  await requireAuth("edit");

  if (!VALID_REASONS.includes(reason)) {
    throw new Error(`Invalid failure reason: ${reason}`);
  }

  const db = getWriteDb();
  try {
    db.prepare(
      `UPDATE crawl_targets
       SET failure_reason = ?,
           failure_reason_note = ?,
           failure_reason_updated_at = datetime('now')
       WHERE id = ?`
    ).run(reason, note ?? null, targetId);
  } finally {
    db.close();
  }

  revalidatePath("/admin/ops");
}

export async function clearFailureReason(targetId: number) {
  await requireAuth("edit");

  const db = getWriteDb();
  try {
    db.prepare(
      `UPDATE crawl_targets
       SET failure_reason = NULL,
           failure_reason_note = NULL,
           failure_reason_updated_at = datetime('now')
       WHERE id = ?`
    ).run(targetId);
  } finally {
    db.close();
  }

  revalidatePath("/admin/ops");
}

export async function updateFeeScheduleUrl(
  targetId: number,
  url: string,
  documentType: "pdf" | "html",
  note?: string
) {
  await requireAuth("submit_url");

  // Validate URL
  try {
    new URL(url);
  } catch {
    throw new Error("Invalid URL format");
  }

  const db = getWriteDb();
  try {
    // Get current values for audit trail
    const current = db
      .prepare(
        "SELECT fee_schedule_url, document_type FROM crawl_targets WHERE id = ?"
      )
      .get(targetId) as { fee_schedule_url: string | null; document_type: string | null } | undefined;

    if (!current) {
      throw new Error("Institution not found");
    }

    const updateUrl = db.transaction(() => {
      // Record URL change
      if (current.fee_schedule_url !== url) {
        db.prepare(
          `INSERT INTO crawl_target_changes (crawl_target_id, field, old_value, new_value, note)
           VALUES (?, 'fee_schedule_url', ?, ?, ?)`
        ).run(targetId, current.fee_schedule_url, url, note ?? null);
      }

      // Record doc type change
      if (current.document_type !== documentType) {
        db.prepare(
          `INSERT INTO crawl_target_changes (crawl_target_id, field, old_value, new_value, note)
           VALUES (?, 'document_type', ?, ?, ?)`
        ).run(targetId, current.document_type, documentType, note ?? null);
      }

      // Update the target
      db.prepare(
        `UPDATE crawl_targets
         SET fee_schedule_url = ?,
             document_type = ?,
             consecutive_failures = 0,
             failure_reason = NULL,
             failure_reason_note = NULL
         WHERE id = ?`
      ).run(url, documentType, targetId);
    });

    updateUrl();
  } finally {
    db.close();
  }

  revalidatePath("/admin/ops");
  revalidatePath(`/admin/institutions/${targetId}`);
}

const MAX_PDF_SIZE = 10 * 1024 * 1024; // 10MB

export async function uploadPdf(
  targetId: number,
  formData: FormData
): Promise<{ jobId: number }> {
  await requireAuth("manual_entry");

  const file = formData.get("file") as File | null;
  if (!file) throw new Error("No file provided");

  if (file.size > MAX_PDF_SIZE) {
    throw new Error("File too large (max 10MB)");
  }

  if (!file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("Only PDF files are accepted");
  }

  // Save file
  const uploadDir = path.join(process.cwd(), "data", "uploads", String(targetId));
  fs.mkdirSync(uploadDir, { recursive: true });

  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = path.join(uploadDir, `${timestamp}_${safeName}`);

  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(filePath, buffer);

  // Create job
  const db = getWriteDb();
  try {
    const result = db
      .prepare(
        `INSERT INTO upload_jobs (crawl_target_id, file_path, file_name, status)
         VALUES (?, ?, ?, 'queued')`
      )
      .run(targetId, filePath, file.name);

    return { jobId: Number(result.lastInsertRowid) };
  } finally {
    db.close();
  }
}

export async function getUploadJobStatus(jobId: number) {
  await requireAuth("view");

  const db = getWriteDb();
  try {
    const job = db
      .prepare(
        "SELECT id, status, fee_count, error_message, created_at, completed_at FROM upload_jobs WHERE id = ?"
      )
      .get(jobId) as {
        id: number;
        status: string;
        fee_count: number | null;
        error_message: string | null;
        created_at: string;
        completed_at: string | null;
      } | undefined;

    return job ?? null;
  } finally {
    db.close();
  }
}

const MAX_BULK_ROWS = 500;

export async function bulkUpdateUrls(
  updates: { certNumber: string; url: string; documentType: string }[]
): Promise<{ updated: number; errors: { certNumber: string; reason: string }[] }> {
  await requireAuth("manage_users"); // admin only via bulk_approve-level permission

  if (updates.length > MAX_BULK_ROWS) {
    throw new Error(`Maximum ${MAX_BULK_ROWS} rows per batch`);
  }

  const errors: { certNumber: string; reason: string }[] = [];
  let updated = 0;

  const db = getWriteDb();
  try {
    const findTarget = db.prepare(
      "SELECT id, fee_schedule_url, document_type FROM crawl_targets WHERE cert_number = ?"
    );
    const updateTarget = db.prepare(
      `UPDATE crawl_targets
       SET fee_schedule_url = ?, document_type = ?,
           consecutive_failures = 0, failure_reason = NULL
       WHERE id = ?`
    );
    const insertChange = db.prepare(
      `INSERT INTO crawl_target_changes (crawl_target_id, field, old_value, new_value, note)
       VALUES (?, ?, ?, ?, 'CSV bulk upload')`
    );

    const bulkUpdate = db.transaction(() => {
      for (const row of updates) {
        // Validate URL
        try {
          new URL(row.url);
        } catch {
          errors.push({ certNumber: row.certNumber, reason: "Invalid URL" });
          continue;
        }

        const docType = row.documentType === "pdf" ? "pdf" : "html";

        const target = findTarget.get(row.certNumber) as {
          id: number;
          fee_schedule_url: string | null;
          document_type: string | null;
        } | undefined;

        if (!target) {
          errors.push({ certNumber: row.certNumber, reason: "Institution not found" });
          continue;
        }

        // Audit trail
        if (target.fee_schedule_url !== row.url) {
          insertChange.run(target.id, "fee_schedule_url", target.fee_schedule_url, row.url);
        }
        if (target.document_type !== docType) {
          insertChange.run(target.id, "document_type", target.document_type, docType);
        }

        updateTarget.run(row.url, docType, target.id);
        updated++;
      }
    });

    bulkUpdate();
  } finally {
    db.close();
  }

  revalidatePath("/admin/ops");
  return { updated, errors };
}

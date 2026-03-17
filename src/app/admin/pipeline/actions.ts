"use server";

import { revalidatePath } from "next/cache";
import { getWriteDb } from "@/lib/crawler-db/connection";
import { requireAuth } from "@/lib/auth";
import { spawnJob } from "@/lib/job-runner";

export async function runCrawlGaps(): Promise<{ success: boolean; jobId?: number; error?: string }> {
  const user = await requireAuth("trigger_jobs");
  try {
    const result = await spawnJob("crawl", ["--skip-with-fees", "--limit", "500"], user.username);
    revalidatePath("/admin/pipeline");
    return { success: true, jobId: result.jobId };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function runCategorize(): Promise<{ success: boolean; jobId?: number; error?: string }> {
  const user = await requireAuth("trigger_jobs");
  try {
    const result = await spawnJob("categorize", [], user.username);
    revalidatePath("/admin/pipeline");
    return { success: true, jobId: result.jobId };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function runAutoReview(): Promise<{ success: boolean; jobId?: number; error?: string }> {
  const user = await requireAuth("trigger_jobs");
  try {
    const result = await spawnJob("auto-review", [], user.username);
    revalidatePath("/admin/pipeline");
    return { success: true, jobId: result.jobId };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function runSmartPipeline(): Promise<{ success: boolean; jobId?: number; error?: string }> {
  const user = await requireAuth("trigger_jobs");
  try {
    const result = await spawnJob("run-pipeline", ["--limit", "100"], user.username);
    revalidatePath("/admin/pipeline");
    return { success: true, jobId: result.jobId };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function runOutlierDetect(): Promise<{ success: boolean; jobId?: number; error?: string }> {
  const user = await requireAuth("trigger_jobs");
  try {
    const result = await spawnJob("outlier-detect", [], user.username);
    revalidatePath("/admin/pipeline");
    return { success: true, jobId: result.jobId };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function runValidate(): Promise<{ success: boolean; jobId?: number; error?: string }> {
  const user = await requireAuth("trigger_jobs");
  try {
    const result = await spawnJob("validate", [], user.username);
    revalidatePath("/admin/pipeline");
    return { success: true, jobId: result.jobId };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function runEnrich(): Promise<{ success: boolean; jobId?: number; error?: string }> {
  const user = await requireAuth("trigger_jobs");
  try {
    const result = await spawnJob("enrich", [], user.username);
    revalidatePath("/admin/pipeline");
    return { success: true, jobId: result.jobId };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function runDiscover(state?: string): Promise<{ success: boolean; jobId?: number; error?: string }> {
  const user = await requireAuth("trigger_jobs");
  try {
    const args: string[] = [];
    if (state) args.push("--state", state);
    const result = await spawnJob("discover", args, user.username);
    revalidatePath("/admin/pipeline");
    return { success: true, jobId: result.jobId };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function runRefreshData(cadence: string = "daily"): Promise<{ success: boolean; jobId?: number; error?: string }> {
  const user = await requireAuth("trigger_jobs");
  try {
    const result = await spawnJob("refresh-data", ["--cadence", cadence], user.username);
    revalidatePath("/admin/pipeline");
    return { success: true, jobId: result.jobId };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function addInstitution(
  name: string,
  stateCode: string,
  charterType: "bank" | "credit_union",
  websiteUrl?: string,
  feeScheduleUrl?: string,
): Promise<{ success: boolean; id?: number; error?: string }> {
  await requireAuth("edit");
  if (!name || name.trim().length < 2) return { success: false, error: "Name is required" };
  if (!/^[A-Z]{2}$/.test(stateCode)) return { success: false, error: "Invalid state code" };

  const db = getWriteDb();
  try {
    const result = db.prepare(
      `INSERT INTO crawl_targets (institution_name, state_code, charter_type, website_url, fee_schedule_url, source, status)
       VALUES (?, ?, ?, ?, ?, 'manual', 'active')`
    ).run(name.trim(), stateCode, charterType, websiteUrl || null, feeScheduleUrl || null);
    revalidatePath("/admin/pipeline");
    return { success: true, id: Number(result.lastInsertRowid) };
  } catch (e) {
    return { success: false, error: String(e) };
  } finally {
    db.close();
  }
}

export async function setFeeScheduleUrl(
  institutionId: number,
  url: string
): Promise<{ success: boolean; error?: string }> {
  await requireAuth("edit");
  if (!url || !url.startsWith("http")) {
    return { success: false, error: "Invalid URL" };
  }

  const db = getWriteDb();
  try {
    const result = db
      .prepare("UPDATE crawl_targets SET fee_schedule_url = ? WHERE id = ?")
      .run(url, institutionId);
    if (result.changes === 0) {
      return { success: false, error: "Institution not found" };
    }
    revalidatePath("/admin/pipeline");
    return { success: true };
  } finally {
    db.close();
  }
}

export async function bulkImportUrls(
  csvText: string
): Promise<{ success: boolean; updated: number; errors: string[] }> {
  await requireAuth("edit");
  const lines = csvText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("institution_id"));

  const errors: string[] = [];
  const updates: { id: number; url: string }[] = [];

  for (const line of lines) {
    const parts = line.split(/[,\t]/).map((p) => p.trim());
    if (parts.length < 2) {
      errors.push(`Invalid line: ${line}`);
      continue;
    }
    const id = parseInt(parts[0], 10);
    const url = parts[1];
    if (isNaN(id)) {
      errors.push(`Invalid ID: ${parts[0]}`);
      continue;
    }
    if (!url.startsWith("http")) {
      errors.push(`Invalid URL for ID ${id}: ${url}`);
      continue;
    }
    updates.push({ id, url });
  }

  if (updates.length === 0) {
    return { success: false, updated: 0, errors: errors.length > 0 ? errors : ["No valid rows found"] };
  }

  const db = getWriteDb();
  try {
    const stmt = db.prepare("UPDATE crawl_targets SET fee_schedule_url = ? WHERE id = ?");
    const txn = db.transaction(() => {
      let count = 0;
      for (const u of updates) {
        const r = stmt.run(u.url, u.id);
        if (r.changes > 0) count++;
        else errors.push(`Institution ID ${u.id} not found`);
      }
      return count;
    });
    const updated = txn();
    revalidatePath("/admin/pipeline");
    return { success: true, updated, errors };
  } finally {
    db.close();
  }
}

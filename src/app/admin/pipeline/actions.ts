"use server";

import { revalidatePath } from "next/cache";
import { getWriteDb } from "@/lib/crawler-db/connection";

export async function setFeeScheduleUrl(
  institutionId: number,
  url: string
): Promise<{ success: boolean; error?: string }> {
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

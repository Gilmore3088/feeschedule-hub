"use server";

import Database from "better-sqlite3";
import path from "path";
import { requireAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { FEE_FAMILIES } from "@/lib/fee-taxonomy";

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

// Build valid categories set
const VALID_CATEGORIES = new Set(
  Object.values(FEE_FAMILIES).flat()
);

interface ManualFee {
  category: string;
  fee_name: string;
  amount: number;
  frequency: string;
  conditions: string | null;
}

// Reverse lookup: category -> family
const CATEGORY_TO_FAMILY: Record<string, string> = {};
for (const [family, cats] of Object.entries(FEE_FAMILIES)) {
  for (const cat of cats) {
    CATEGORY_TO_FAMILY[cat] = family;
  }
}

export async function submitManualFees(
  targetId: number,
  fees: ManualFee[]
) {
  await requireAuth("manual_entry");

  if (fees.length === 0) {
    throw new Error("No fees provided");
  }

  // Validate
  for (const fee of fees) {
    if (!VALID_CATEGORIES.has(fee.category)) {
      throw new Error(`Invalid fee category: ${fee.category}`);
    }
    if (isNaN(fee.amount) || fee.amount < 0) {
      throw new Error(`Invalid amount for ${fee.fee_name}`);
    }
  }

  const db = getWriteDb();
  try {
    // Verify institution exists
    const target = db
      .prepare("SELECT id FROM crawl_targets WHERE id = ?")
      .get(targetId) as { id: number } | undefined;

    if (!target) {
      throw new Error("Institution not found");
    }

    // Create a synthetic crawl_result for audit trail
    const resultId = db
      .prepare(
        `INSERT INTO crawl_results (crawl_run_id, crawl_target_id, status, document_url, fees_extracted)
         VALUES (0, ?, 'manual', 'manual-entry', ?)`
      )
      .run(targetId, fees.length).lastInsertRowid;

    // Insert fees
    const insertFee = db.prepare(
      `INSERT INTO extracted_fees
       (crawl_result_id, crawl_target_id, fee_name, amount, frequency,
        conditions, extraction_confidence, review_status,
        fee_family, fee_category, source)
       VALUES (?, ?, ?, ?, ?, ?, 1.0, 'staged', ?, ?, 'manual')`
    );

    const insertAll = db.transaction(() => {
      for (const fee of fees) {
        insertFee.run(
          resultId,
          targetId,
          fee.fee_name,
          fee.amount,
          fee.frequency,
          fee.conditions,
          CATEGORY_TO_FAMILY[fee.category] ?? null,
          fee.category
        );
      }
    });

    insertAll();
  } finally {
    db.close();
  }

  revalidatePath("/admin/ops");
  revalidatePath(`/admin/ops/entry/${targetId}`);
}

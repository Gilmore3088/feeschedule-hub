"use server";

import Database from "better-sqlite3";
import { revalidatePath } from "next/cache";
import path from "path";
import { getCurrentUser, hasPermission, type Permission } from "./auth";

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

async function requirePermission(permission: Permission) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  if (!hasPermission(user, permission)) throw new Error("Forbidden");
  return user;
}

// Status machine: which transitions are allowed
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending: ["staged", "flagged", "approved", "rejected"],
  staged: ["approved", "rejected"],
  flagged: ["approved", "rejected"],
};

function assertTransition(current: string, target: string) {
  const allowed = ALLOWED_TRANSITIONS[current];
  if (!allowed || !allowed.includes(target)) {
    throw new Error(
      `Cannot transition from '${current}' to '${target}'`
    );
  }
}

export async function approveFee(
  feeId: number,
  notes?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requirePermission("approve");
    const db = getWriteDb();
    try {
      const fee = db
        .prepare("SELECT id, review_status FROM extracted_fees WHERE id = ?")
        .get(feeId) as { id: number; review_status: string } | undefined;

      if (!fee) return { success: false, error: "Fee not found" };
      assertTransition(fee.review_status, "approved");

      db.prepare("UPDATE extracted_fees SET review_status = ? WHERE id = ?").run(
        "approved",
        feeId
      );
      db.prepare(
        `INSERT INTO fee_reviews (fee_id, action, user_id, username, previous_status, new_status, notes)
         VALUES (?, 'approve', ?, ?, ?, 'approved', ?)`
      ).run(feeId, user.id, user.username, fee.review_status, notes || null);

      revalidatePath("/admin/review");
      return { success: true };
    } finally {
      db.close();
    }
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function rejectFee(
  feeId: number,
  notes?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requirePermission("reject");
    const db = getWriteDb();
    try {
      const fee = db
        .prepare("SELECT id, review_status FROM extracted_fees WHERE id = ?")
        .get(feeId) as { id: number; review_status: string } | undefined;

      if (!fee) return { success: false, error: "Fee not found" };
      assertTransition(fee.review_status, "rejected");

      db.prepare("UPDATE extracted_fees SET review_status = ? WHERE id = ?").run(
        "rejected",
        feeId
      );
      db.prepare(
        `INSERT INTO fee_reviews (fee_id, action, user_id, username, previous_status, new_status, notes)
         VALUES (?, 'reject', ?, ?, ?, 'rejected', ?)`
      ).run(feeId, user.id, user.username, fee.review_status, notes || null);

      revalidatePath("/admin/review");
      return { success: true };
    } finally {
      db.close();
    }
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function editFee(
  feeId: number,
  updates: {
    fee_name?: string;
    amount?: number | null;
    frequency?: string | null;
    conditions?: string | null;
  },
  notes?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requirePermission("edit");
    const db = getWriteDb();
    try {
      const fee = db
        .prepare(
          "SELECT id, fee_name, amount, frequency, conditions, review_status FROM extracted_fees WHERE id = ?"
        )
        .get(feeId) as {
        id: number;
        fee_name: string;
        amount: number | null;
        frequency: string | null;
        conditions: string | null;
        review_status: string;
      } | undefined;

      if (!fee) return { success: false, error: "Fee not found" };
      if (fee.review_status === "approved" || fee.review_status === "rejected") {
        return { success: false, error: "Cannot edit a reviewed fee" };
      }

      const previousValues = JSON.stringify({
        fee_name: fee.fee_name,
        amount: fee.amount,
        frequency: fee.frequency,
        conditions: fee.conditions,
      });

      const setClauses: string[] = [];
      const params: unknown[] = [];

      if (updates.fee_name !== undefined) {
        setClauses.push("fee_name = ?");
        params.push(updates.fee_name);
      }
      if (updates.amount !== undefined) {
        setClauses.push("amount = ?");
        params.push(updates.amount);
      }
      if (updates.frequency !== undefined) {
        setClauses.push("frequency = ?");
        params.push(updates.frequency);
      }
      if (updates.conditions !== undefined) {
        setClauses.push("conditions = ?");
        params.push(updates.conditions);
      }

      if (setClauses.length === 0) {
        return { success: false, error: "No updates provided" };
      }

      params.push(feeId);
      db.prepare(
        `UPDATE extracted_fees SET ${setClauses.join(", ")} WHERE id = ?`
      ).run(...params);

      const newValues = JSON.stringify({
        fee_name: updates.fee_name ?? fee.fee_name,
        amount: updates.amount ?? fee.amount,
        frequency: updates.frequency ?? fee.frequency,
        conditions: updates.conditions ?? fee.conditions,
      });

      db.prepare(
        `INSERT INTO fee_reviews
         (fee_id, action, user_id, username, previous_status, new_status, previous_values, new_values, notes)
         VALUES (?, 'edit', ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        feeId,
        user.id,
        user.username,
        fee.review_status,
        fee.review_status,
        previousValues,
        newValues,
        notes || null
      );

      revalidatePath("/admin/review");
      return { success: true };
    } finally {
      db.close();
    }
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function bulkApproveStagedFees(
  notes?: string
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    const user = await requirePermission("bulk_approve");
    const db = getWriteDb();
    try {
      const staged = db
        .prepare(
          "SELECT id, review_status FROM extracted_fees WHERE review_status = 'staged'"
        )
        .all() as { id: number; review_status: string }[];

      if (staged.length === 0) {
        return { success: true, count: 0 };
      }

      const updateStmt = db.prepare(
        "UPDATE extracted_fees SET review_status = 'approved' WHERE id = ?"
      );
      const auditStmt = db.prepare(
        `INSERT INTO fee_reviews (fee_id, action, user_id, username, previous_status, new_status, notes)
         VALUES (?, 'bulk_approve', ?, ?, 'staged', 'approved', ?)`
      );

      const bulkNote = notes || `Bulk approved ${staged.length} staged fees`;

      const batchOp = db.transaction(() => {
        for (const fee of staged) {
          updateStmt.run(fee.id);
          auditStmt.run(fee.id, user.id, user.username, bulkNote);
        }
      });
      batchOp();

      revalidatePath("/admin/review");
      return { success: true, count: staged.length };
    } finally {
      db.close();
    }
  } catch (e) {
    return { success: false, count: 0, error: (e as Error).message };
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, hasPermission, type Permission } from "./auth";
import { getWriteDb } from "@/lib/crawler-db/connection";

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
      const txn = db.transaction(() => {
        const fee = db
          .prepare("SELECT id, review_status FROM extracted_fees WHERE id = ?")
          .get(feeId) as { id: number; review_status: string } | undefined;

        if (!fee) throw new Error("Fee not found");
        assertTransition(fee.review_status, "approved");

        db.prepare("UPDATE extracted_fees SET review_status = ? WHERE id = ?").run(
          "approved",
          feeId
        );
        db.prepare(
          `INSERT INTO fee_reviews (fee_id, action, user_id, username, previous_status, new_status, notes)
           VALUES (?, 'approve', ?, ?, ?, 'approved', ?)`
        ).run(feeId, user.id, user.username, fee.review_status, notes || null);
      });
      txn();

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
      const txn = db.transaction(() => {
        const fee = db
          .prepare("SELECT id, review_status FROM extracted_fees WHERE id = ?")
          .get(feeId) as { id: number; review_status: string } | undefined;

        if (!fee) throw new Error("Fee not found");
        assertTransition(fee.review_status, "rejected");

        db.prepare("UPDATE extracted_fees SET review_status = ? WHERE id = ?").run(
          "rejected",
          feeId
        );
        db.prepare(
          `INSERT INTO fee_reviews (fee_id, action, user_id, username, previous_status, new_status, notes)
           VALUES (?, 'reject', ?, ?, ?, 'rejected', ?)`
        ).run(feeId, user.id, user.username, fee.review_status, notes || null);
      });
      txn();

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
      const txn = db.transaction(() => {
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

        if (!fee) throw new Error("Fee not found");
        if (fee.review_status === "approved" || fee.review_status === "rejected") {
          throw new Error("Cannot edit a reviewed fee");
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
          throw new Error("No updates provided");
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
      });
      txn();

      revalidatePath("/admin/review");
      return { success: true };
    } finally {
      db.close();
    }
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function updateFeeCategory(
  feeId: number,
  category: string | null,
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requirePermission("edit");
    const db = getWriteDb();
    try {
      const txn = db.transaction(() => {
        const fee = db
          .prepare("SELECT id, fee_category, review_status FROM extracted_fees WHERE id = ?")
          .get(feeId) as { id: number; fee_category: string | null; review_status: string } | undefined;

        if (!fee) throw new Error("Fee not found");

        const previousCategory = fee.fee_category;
        db.prepare("UPDATE extracted_fees SET fee_category = ? WHERE id = ?").run(
          category,
          feeId,
        );

        db.prepare(
          `INSERT INTO fee_reviews (fee_id, action, user_id, username, previous_status, new_status, previous_values, new_values, notes)
           VALUES (?, 'recategorize', ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          feeId,
          user.id,
          user.username,
          fee.review_status,
          fee.review_status,
          JSON.stringify({ fee_category: previousCategory }),
          JSON.stringify({ fee_category: category }),
          `Category changed from ${previousCategory || "none"} to ${category || "none"}`,
        );
      });
      txn();

      revalidatePath("/admin/review");
      return { success: true };
    } finally {
      db.close();
    }
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function editAndApproveFee(
  feeId: number,
  updates: {
    amount?: number | null;
    fee_name?: string;
  },
  notes?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requirePermission("edit");
    const db = getWriteDb();
    try {
      const fee = db
        .prepare(
          "SELECT id, fee_name, amount, frequency, conditions, review_status FROM extracted_fees WHERE id = ?",
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
      });

      const batchOp = db.transaction(() => {
        const setClauses: string[] = [];
        const params: unknown[] = [];

        if (updates.amount !== undefined) {
          setClauses.push("amount = ?");
          params.push(updates.amount);
        }
        if (updates.fee_name !== undefined) {
          setClauses.push("fee_name = ?");
          params.push(updates.fee_name);
        }

        if (setClauses.length > 0) {
          setClauses.push("review_status = 'approved'");
          params.push(feeId);
          db.prepare(
            `UPDATE extracted_fees SET ${setClauses.join(", ")} WHERE id = ?`,
          ).run(...params);
        } else {
          db.prepare(
            "UPDATE extracted_fees SET review_status = 'approved' WHERE id = ?",
          ).run(feeId);
        }

        const newValues = JSON.stringify({
          fee_name: updates.fee_name ?? fee.fee_name,
          amount: updates.amount ?? fee.amount,
        });

        db.prepare(
          `INSERT INTO fee_reviews
           (fee_id, action, user_id, username, previous_status, new_status, previous_values, new_values, notes)
           VALUES (?, 'edit_approve', ?, ?, ?, 'approved', ?, ?, ?)`,
        ).run(
          feeId,
          user.id,
          user.username,
          fee.review_status,
          previousValues,
          newValues,
          notes || `Fixed and approved`,
        );
      });
      batchOp();

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

export async function bulkRejectFees(
  feeIds: number[],
  notes?: string,
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    const user = await requirePermission("reject");
    if (feeIds.length === 0) return { success: true, count: 0 };
    if (feeIds.length > 200) return { success: false, count: 0, error: "Too many fees (max 200)" };

    const db = getWriteDb();
    try {
      const selectStmt = db.prepare(
        "SELECT id, review_status FROM extracted_fees WHERE id = ?",
      );
      const updateStmt = db.prepare(
        "UPDATE extracted_fees SET review_status = 'rejected' WHERE id = ?",
      );
      const auditStmt = db.prepare(
        `INSERT INTO fee_reviews (fee_id, action, user_id, username, previous_status, new_status, notes)
         VALUES (?, 'bulk_reject', ?, ?, ?, 'rejected', ?)`,
      );

      const bulkNote = notes || `Bulk rejected ${feeIds.length} outlier fees`;
      let count = 0;

      const batchOp = db.transaction(() => {
        for (const feeId of feeIds) {
          const fee = selectStmt.get(feeId) as { id: number; review_status: string } | undefined;
          if (!fee) continue;
          if (fee.review_status === "approved" || fee.review_status === "rejected") continue;
          updateStmt.run(feeId);
          auditStmt.run(feeId, user.id, user.username, fee.review_status, bulkNote);
          count++;
        }
      });
      batchOp();

      revalidatePath("/admin/review");
      return { success: true, count };
    } finally {
      db.close();
    }
  } catch (e) {
    return { success: false, count: 0, error: (e as Error).message };
  }
}

export async function bulkEditAndApproveFees(
  updates: { feeId: number; amount: number }[],
  notes?: string,
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    const user = await requirePermission("edit");
    if (updates.length === 0) return { success: true, count: 0 };
    if (updates.length > 200) return { success: false, count: 0, error: "Too many fees (max 200)" };

    const db = getWriteDb();
    try {
      const selectStmt = db.prepare(
        "SELECT id, fee_name, amount, review_status FROM extracted_fees WHERE id = ?",
      );
      const updateStmt = db.prepare(
        "UPDATE extracted_fees SET amount = ?, review_status = 'approved' WHERE id = ?",
      );
      const auditStmt = db.prepare(
        `INSERT INTO fee_reviews
         (fee_id, action, user_id, username, previous_status, new_status, previous_values, new_values, notes)
         VALUES (?, 'edit_approve', ?, ?, ?, 'approved', ?, ?, ?)`,
      );

      const bulkNote = notes || `Bulk fixed and approved ${updates.length} outlier fees`;
      let count = 0;

      const batchOp = db.transaction(() => {
        for (const { feeId, amount } of updates) {
          const fee = selectStmt.get(feeId) as {
            id: number; fee_name: string; amount: number | null; review_status: string;
          } | undefined;
          if (!fee) continue;
          if (fee.review_status === "approved" || fee.review_status === "rejected") continue;
          updateStmt.run(amount, feeId);
          auditStmt.run(
            feeId, user.id, user.username, fee.review_status,
            JSON.stringify({ amount: fee.amount }),
            JSON.stringify({ amount }),
            bulkNote,
          );
          count++;
        }
      });
      batchOp();

      revalidatePath("/admin/review");
      return { success: true, count };
    } finally {
      db.close();
    }
  } catch (e) {
    return { success: false, count: 0, error: (e as Error).message };
  }
}

export async function bulkApproveFees(
  feeIds: number[],
  notes?: string,
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    const user = await requirePermission("approve");
    if (feeIds.length === 0) return { success: true, count: 0 };
    if (feeIds.length > 200) return { success: false, count: 0, error: "Too many fees (max 200)" };

    const db = getWriteDb();
    try {
      const selectStmt = db.prepare(
        "SELECT id, review_status FROM extracted_fees WHERE id = ?",
      );
      const updateStmt = db.prepare(
        "UPDATE extracted_fees SET review_status = 'approved' WHERE id = ?",
      );
      const auditStmt = db.prepare(
        `INSERT INTO fee_reviews (fee_id, action, user_id, username, previous_status, new_status, notes)
         VALUES (?, 'bulk_approve', ?, ?, ?, 'approved', ?)`,
      );

      const bulkNote = notes || `Bulk approved ${feeIds.length} fees`;
      let count = 0;

      const batchOp = db.transaction(() => {
        for (const feeId of feeIds) {
          const fee = selectStmt.get(feeId) as { id: number; review_status: string } | undefined;
          if (!fee) continue;
          if (fee.review_status === "approved" || fee.review_status === "rejected") continue;
          updateStmt.run(feeId);
          auditStmt.run(feeId, user.id, user.username, fee.review_status, bulkNote);
          count++;
        }
      });
      batchOp();

      revalidatePath("/admin/review");
      return { success: true, count };
    } finally {
      db.close();
    }
  } catch (e) {
    return { success: false, count: 0, error: (e as Error).message };
  }
}

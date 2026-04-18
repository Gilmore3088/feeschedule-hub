"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, hasPermission, type Permission } from "./auth";
import { sql } from "@/lib/crawler-db/connection";

async function requirePermission(permission: Permission) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  if (!hasPermission(user, permission)) throw new Error("Forbidden");
  return user;
}

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending: ["staged", "flagged", "approved", "rejected"],
  staged: ["approved", "rejected"],
  flagged: ["approved", "rejected"],
  approved: ["staged"],
  rejected: ["staged"],
};

function assertTransition(current: string, target: string) {
  const allowed = ALLOWED_TRANSITIONS[current];
  if (!allowed || !allowed.includes(target)) {
    throw new Error(`Cannot transition from '${current}' to '${target}'`);
  }
}

export async function approveFee(
  feeId: number,
  notes?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requirePermission("approve");
    await sql.begin(async (tx: any) => {
      await tx`SET LOCAL app.allow_legacy_writes = 'true'`;
      const [fee] = await tx`
        SELECT id, review_status FROM extracted_fees WHERE id = ${feeId}
      `;
      if (!fee) throw new Error("Fee not found");
      assertTransition(fee.review_status, "approved");

      await tx`UPDATE extracted_fees SET review_status = 'approved' WHERE id = ${feeId}`;
      await tx`
        INSERT INTO fee_reviews (fee_id, action, user_id, username, previous_status, new_status, notes)
        VALUES (${feeId}, 'approve', ${user.id}, ${user.username}, ${fee.review_status}, 'approved', ${notes || null})
      `;
    });

    revalidatePath("/admin/review");
    return { success: true };
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
    await sql.begin(async (tx: any) => {
      await tx`SET LOCAL app.allow_legacy_writes = 'true'`;
      const [fee] = await tx`
        SELECT id, review_status FROM extracted_fees WHERE id = ${feeId}
      `;
      if (!fee) throw new Error("Fee not found");
      assertTransition(fee.review_status, "rejected");

      await tx`UPDATE extracted_fees SET review_status = 'rejected' WHERE id = ${feeId}`;
      await tx`
        INSERT INTO fee_reviews (fee_id, action, user_id, username, previous_status, new_status, notes)
        VALUES (${feeId}, 'reject', ${user.id}, ${user.username}, ${fee.review_status}, 'rejected', ${notes || null})
      `;
    });

    revalidatePath("/admin/review");
    return { success: true };
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
    await sql.begin(async (tx: any) => {
      await tx`SET LOCAL app.allow_legacy_writes = 'true'`;
      const [fee] = await tx`
        SELECT id, fee_name, amount, frequency, conditions, review_status
        FROM extracted_fees WHERE id = ${feeId}
      `;
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
      const params: (string | number | null)[] = [];

      if (updates.fee_name !== undefined) {
        setClauses.push(`fee_name = $${params.length + 1}`);
        params.push(updates.fee_name);
      }
      if (updates.amount !== undefined) {
        setClauses.push(`amount = $${params.length + 1}`);
        params.push(updates.amount);
      }
      if (updates.frequency !== undefined) {
        setClauses.push(`frequency = $${params.length + 1}`);
        params.push(updates.frequency);
      }
      if (updates.conditions !== undefined) {
        setClauses.push(`conditions = $${params.length + 1}`);
        params.push(updates.conditions);
      }

      if (setClauses.length === 0) throw new Error("No updates provided");

      params.push(feeId);
      await tx.unsafe(
        `UPDATE extracted_fees SET ${setClauses.join(", ")} WHERE id = $${params.length}`,
        params
      );

      const newValues = JSON.stringify({
        fee_name: updates.fee_name ?? fee.fee_name,
        amount: updates.amount ?? fee.amount,
        frequency: updates.frequency ?? fee.frequency,
        conditions: updates.conditions ?? fee.conditions,
      });

      await tx`
        INSERT INTO fee_reviews
        (fee_id, action, user_id, username, previous_status, new_status, previous_values, new_values, notes)
        VALUES (${feeId}, 'edit', ${user.id}, ${user.username}, ${fee.review_status}, ${fee.review_status}, ${previousValues}, ${newValues}, ${notes || null})
      `;
    });

    revalidatePath("/admin/review");
    return { success: true };
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
    await sql.begin(async (tx: any) => {
      await tx`SET LOCAL app.allow_legacy_writes = 'true'`;
      const [fee] = await tx`
        SELECT id, fee_category, review_status FROM extracted_fees WHERE id = ${feeId}
      `;
      if (!fee) throw new Error("Fee not found");

      const previousCategory = fee.fee_category;
      await tx`UPDATE extracted_fees SET fee_category = ${category} WHERE id = ${feeId}`;
      await tx`
        INSERT INTO fee_reviews (fee_id, action, user_id, username, previous_status, new_status, previous_values, new_values, notes)
        VALUES (${feeId}, 'recategorize', ${user.id}, ${user.username}, ${fee.review_status}, ${fee.review_status},
                ${JSON.stringify({ fee_category: previousCategory })},
                ${JSON.stringify({ fee_category: category })},
                ${`Category changed from ${previousCategory || "none"} to ${category || "none"}`})
      `;
    });

    revalidatePath("/admin/review");
    return { success: true };
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
    const [fee] = await sql`
      SELECT id, fee_name, amount, frequency, conditions, review_status
      FROM extracted_fees WHERE id = ${feeId}
    `;
    if (!fee) return { success: false, error: "Fee not found" };
    if (fee.review_status === "approved" || fee.review_status === "rejected") {
      return { success: false, error: "Cannot edit a reviewed fee" };
    }

    const previousValues = JSON.stringify({
      fee_name: fee.fee_name,
      amount: fee.amount,
    });

    await sql.begin(async (tx: any) => {
      await tx`SET LOCAL app.allow_legacy_writes = 'true'`;
      const setClauses: string[] = [];
      const params: (string | number | null)[] = [];

      if (updates.amount !== undefined) {
        setClauses.push(`amount = $${params.length + 1}`);
        params.push(updates.amount);
      }
      if (updates.fee_name !== undefined) {
        setClauses.push(`fee_name = $${params.length + 1}`);
        params.push(updates.fee_name);
      }

      if (setClauses.length > 0) {
        setClauses.push("review_status = 'approved'");
        params.push(feeId);
        await tx.unsafe(
          `UPDATE extracted_fees SET ${setClauses.join(", ")} WHERE id = $${params.length}`,
          params
        );
      } else {
        await tx`UPDATE extracted_fees SET review_status = 'approved' WHERE id = ${feeId}`;
      }

      const newValues = JSON.stringify({
        fee_name: updates.fee_name ?? fee.fee_name,
        amount: updates.amount ?? fee.amount,
      });

      await tx`
        INSERT INTO fee_reviews
        (fee_id, action, user_id, username, previous_status, new_status, previous_values, new_values, notes)
        VALUES (${feeId}, 'edit_approve', ${user.id}, ${user.username}, ${fee.review_status}, 'approved',
                ${previousValues}, ${newValues}, ${notes || "Fixed and approved"})
      `;
    });

    revalidatePath("/admin/review");
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function bulkApproveStagedFees(
  notes?: string
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    const user = await requirePermission("bulk_approve");
    const staged = await sql`
      SELECT id, review_status FROM extracted_fees WHERE review_status = 'staged'
    `;

    if (staged.length === 0) return { success: true, count: 0 };

    const bulkNote = notes || `Bulk approved ${staged.length} staged fees`;

    await sql.begin(async (tx: any) => {
      await tx`SET LOCAL app.allow_legacy_writes = 'true'`;
      for (const fee of staged) {
        await tx`UPDATE extracted_fees SET review_status = 'approved' WHERE id = ${fee.id}`;
        await tx`
          INSERT INTO fee_reviews (fee_id, action, user_id, username, previous_status, new_status, notes)
          VALUES (${fee.id}, 'bulk_approve', ${user.id}, ${user.username}, 'staged', 'approved', ${bulkNote})
        `;
      }
    });

    revalidatePath("/admin/review");
    return { success: true, count: staged.length };
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

    const bulkNote = notes || `Bulk rejected ${feeIds.length} outlier fees`;
    let count = 0;

    await sql.begin(async (tx: any) => {
      await tx`SET LOCAL app.allow_legacy_writes = 'true'`;
      for (const feeId of feeIds) {
        const [fee] = await tx`
          SELECT id, review_status FROM extracted_fees WHERE id = ${feeId}
        `;
        if (!fee) continue;
        if (fee.review_status === "approved" || fee.review_status === "rejected") continue;
        await tx`UPDATE extracted_fees SET review_status = 'rejected' WHERE id = ${feeId}`;
        await tx`
          INSERT INTO fee_reviews (fee_id, action, user_id, username, previous_status, new_status, notes)
          VALUES (${feeId}, 'bulk_reject', ${user.id}, ${user.username}, ${fee.review_status}, 'rejected', ${bulkNote})
        `;
        count++;
      }
    });

    revalidatePath("/admin/review");
    return { success: true, count };
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

    const bulkNote = notes || `Bulk fixed and approved ${updates.length} outlier fees`;
    let count = 0;

    await sql.begin(async (tx: any) => {
      await tx`SET LOCAL app.allow_legacy_writes = 'true'`;
      for (const { feeId, amount } of updates) {
        const [fee] = await tx`
          SELECT id, fee_name, amount, review_status FROM extracted_fees WHERE id = ${feeId}
        `;
        if (!fee) continue;
        if (fee.review_status === "approved" || fee.review_status === "rejected") continue;
        await tx`UPDATE extracted_fees SET amount = ${amount}, review_status = 'approved' WHERE id = ${feeId}`;
        await tx`
          INSERT INTO fee_reviews
          (fee_id, action, user_id, username, previous_status, new_status, previous_values, new_values, notes)
          VALUES (${feeId}, 'edit_approve', ${user.id}, ${user.username}, ${fee.review_status}, 'approved',
                  ${JSON.stringify({ amount: fee.amount })}, ${JSON.stringify({ amount })}, ${bulkNote})
        `;
        count++;
      }
    });

    revalidatePath("/admin/review");
    return { success: true, count };
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

    const bulkNote = notes || `Bulk approved ${feeIds.length} fees`;
    let count = 0;

    await sql.begin(async (tx: any) => {
      await tx`SET LOCAL app.allow_legacy_writes = 'true'`;
      for (const feeId of feeIds) {
        const [fee] = await tx`
          SELECT id, review_status FROM extracted_fees WHERE id = ${feeId}
        `;
        if (!fee) continue;
        if (fee.review_status === "approved" || fee.review_status === "rejected") continue;
        await tx`UPDATE extracted_fees SET review_status = 'approved' WHERE id = ${feeId}`;
        await tx`
          INSERT INTO fee_reviews (fee_id, action, user_id, username, previous_status, new_status, notes)
          VALUES (${feeId}, 'bulk_approve', ${user.id}, ${user.username}, ${fee.review_status}, 'approved', ${bulkNote})
        `;
        count++;
      }
    });

    revalidatePath("/admin/review");
    return { success: true, count };
  } catch (e) {
    return { success: false, count: 0, error: (e as Error).message };
  }
}

export async function bulkApproveByConfidence(
  minConfidence: number,
  notes?: string,
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    const user = await requirePermission("bulk_approve");
    if (minConfidence < 0.5 || minConfidence > 1) {
      return { success: false, count: 0, error: "Confidence must be between 0.5 and 1.0" };
    }

    const staged = await sql`
      SELECT id FROM extracted_fees WHERE review_status = 'staged' AND extraction_confidence >= ${minConfidence}
    `;

    if (staged.length === 0) return { success: true, count: 0 };

    const bulkNote = notes || `Confidence batch: approved ${staged.length} fees >= ${(minConfidence * 100).toFixed(0)}%`;

    await sql.begin(async (tx: any) => {
      await tx`SET LOCAL app.allow_legacy_writes = 'true'`;
      for (const fee of staged) {
        await tx`UPDATE extracted_fees SET review_status = 'approved' WHERE id = ${fee.id}`;
        await tx`
          INSERT INTO fee_reviews (fee_id, action, user_id, username, previous_status, new_status, notes)
          VALUES (${fee.id}, 'confidence_approve', ${user.id}, ${user.username}, 'staged', 'approved', ${bulkNote})
        `;
      }
    });

    revalidatePath("/admin/review");
    return { success: true, count: staged.length };
  } catch (e) {
    return { success: false, count: 0, error: (e as Error).message };
  }
}

export async function bulkRejectByInstitution(
  institutionId: number,
  notes?: string,
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    const user = await requirePermission("reject");
    const fees = await sql`
      SELECT id, review_status FROM extracted_fees
      WHERE crawl_target_id = ${institutionId} AND review_status IN ('staged', 'flagged', 'pending')
    `;

    if (fees.length === 0) return { success: true, count: 0 };

    const bulkNote = notes || `Rejected all ${fees.length} non-reviewed fees for institution #${institutionId}`;

    await sql.begin(async (tx: any) => {
      await tx`SET LOCAL app.allow_legacy_writes = 'true'`;
      for (const fee of fees) {
        await tx`UPDATE extracted_fees SET review_status = 'rejected' WHERE id = ${fee.id}`;
        await tx`
          INSERT INTO fee_reviews (fee_id, action, user_id, username, previous_status, new_status, notes)
          VALUES (${fee.id}, 'institution_reject', ${user.id}, ${user.username}, ${fee.review_status}, 'rejected', ${bulkNote})
        `;
      }
    });

    revalidatePath("/admin/review");
    return { success: true, count: fees.length };
  } catch (e) {
    return { success: false, count: 0, error: (e as Error).message };
  }
}

export async function unstageFee(
  feeId: number,
  notes: string,
): Promise<{ success: boolean; error?: string }> {
  if (!notes || notes.trim().length < 3) {
    return { success: false, error: "Notes are required when unstaging a fee" };
  }
  try {
    const user = await requirePermission("edit");
    await sql.begin(async (tx: any) => {
      await tx`SET LOCAL app.allow_legacy_writes = 'true'`;
      const [fee] = await tx`
        SELECT id, review_status FROM extracted_fees WHERE id = ${feeId}
      `;
      if (!fee) throw new Error("Fee not found");
      if (fee.review_status !== "approved" && fee.review_status !== "rejected") {
        throw new Error("Can only unstage approved or rejected fees");
      }

      await tx`UPDATE extracted_fees SET review_status = 'staged' WHERE id = ${feeId}`;
      await tx`
        INSERT INTO fee_reviews (fee_id, action, user_id, username, previous_status, new_status, notes)
        VALUES (${feeId}, 'unstage', ${user.id}, ${user.username}, ${fee.review_status}, 'staged', ${notes})
      `;
    });

    revalidatePath("/admin/review");
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function bulkUpdateFeeCategory(
  feeIds: number[],
  newCategory: string,
  notes?: string,
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    const user = await requirePermission("edit");
    if (feeIds.length === 0) return { success: true, count: 0 };
    if (feeIds.length > 200) return { success: false, count: 0, error: "Too many fees (max 200)" };

    const bulkNote = notes || `Bulk recategorized ${feeIds.length} fees to ${newCategory}`;
    let count = 0;

    await sql.begin(async (tx: any) => {
      await tx`SET LOCAL app.allow_legacy_writes = 'true'`;
      for (const feeId of feeIds) {
        const [fee] = await tx`
          SELECT id, fee_category, review_status FROM extracted_fees WHERE id = ${feeId}
        `;
        if (!fee) continue;
        if (fee.fee_category === newCategory) continue;

        await tx`UPDATE extracted_fees SET fee_category = ${newCategory} WHERE id = ${feeId}`;
        await tx`
          INSERT INTO fee_reviews (fee_id, action, user_id, username, previous_status, new_status, previous_values, new_values, notes)
          VALUES (${feeId}, 'bulk_recategorize', ${user.id}, ${user.username}, ${fee.review_status}, ${fee.review_status},
                  ${JSON.stringify({ fee_category: fee.fee_category })},
                  ${JSON.stringify({ fee_category: newCategory })},
                  ${bulkNote})
        `;
        count++;
      }
    });

    revalidatePath("/admin/review");
    revalidatePath("/admin/review/categories");
    return { success: true, count };
  } catch (e) {
    return { success: false, count: 0, error: (e as Error).message };
  }
}

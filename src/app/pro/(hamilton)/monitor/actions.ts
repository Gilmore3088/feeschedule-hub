"use server";

/**
 * Monitor Screen — Server Actions for watchlist mutations.
 * All mutations scoped to userId — no cross-user access possible.
 */

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/crawler-db/connection";

/**
 * Add an institution to the user's watchlist.
 * Creates a watchlist row if one does not yet exist.
 * Deduplicates — adding an already-tracked institution is a no-op.
 */
export async function addToWatchlist(
  userId: number,
  institutionId: string
): Promise<void> {
  if (!institutionId.trim()) return;

  const existing = await sql`
    SELECT id, institution_ids
    FROM hamilton_watchlists
    WHERE user_id = ${userId}
    LIMIT 1
  `;

  if (existing.length === 0) {
    await sql`
      INSERT INTO hamilton_watchlists
        (user_id, institution_ids, fee_categories, regions, peer_set_ids)
      VALUES
        (${userId}, ${JSON.stringify([institutionId])}::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb)
    `;
  } else {
    const currentIds: string[] = Array.isArray(existing[0].institution_ids)
      ? (existing[0].institution_ids as string[])
      : [];

    if (currentIds.includes(institutionId)) {
      // Already tracked — no-op
      return;
    }

    const updatedIds = [...currentIds, institutionId];
    await sql`
      UPDATE hamilton_watchlists
      SET institution_ids = ${JSON.stringify(updatedIds)}::jsonb,
          updated_at = NOW()
      WHERE user_id = ${userId}
    `;
  }

  revalidatePath("/pro/monitor");
}

/**
 * Remove an institution from the user's watchlist.
 * No-op if the institution is not currently tracked.
 */
export async function removeFromWatchlist(
  userId: number,
  institutionId: string
): Promise<void> {
  const existing = await sql`
    SELECT institution_ids
    FROM hamilton_watchlists
    WHERE user_id = ${userId}
    LIMIT 1
  `;

  if (existing.length === 0) return;

  const currentIds: string[] = Array.isArray(existing[0].institution_ids)
    ? (existing[0].institution_ids as string[])
    : [];

  const updatedIds = currentIds.filter((id) => id !== institutionId);

  await sql`
    UPDATE hamilton_watchlists
    SET institution_ids = ${JSON.stringify(updatedIds)}::jsonb,
        updated_at = NOW()
    WHERE user_id = ${userId}
  `;

  revalidatePath("/pro/monitor");
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { sql } from "@/lib/crawler-db/connection";

const idSchema = z.string().uuid();
const noteSchema = z.string().trim().max(2000).optional();

type ActionResult =
  | { success: true; promoted_fee_published_id?: number | null }
  | { success: false; error: string };

/**
 * Confirm a Knox rejection. Records the human verdict in knox_overrides and
 * logs an agent_events audit row. No changes to fees_published.
 */
export async function confirmRejection(
  messageId: string,
  note?: string
): Promise<ActionResult> {
  const user = await requireAuth("approve");
  const parsedId = idSchema.safeParse(messageId);
  if (!parsedId.success) return { success: false, error: "invalid message id" };
  const parsedNote = noteSchema.safeParse(note);
  if (!parsedNote.success) return { success: false, error: "invalid note" };

  try {
    const msg = await sql<{
      payload: Record<string, unknown>;
    }[]>`
      SELECT payload FROM agent_messages
      WHERE message_id = ${messageId}
        AND sender_agent = 'knox'
        AND intent = 'reject'
      LIMIT 1
    `;
    if (msg.length === 0) {
      return { success: false, error: "rejection not found" };
    }
    const feeVerifiedRaw = msg[0].payload?.["fee_verified_id"];
    const feeVerifiedId =
      typeof feeVerifiedRaw === "string" || typeof feeVerifiedRaw === "number"
        ? Number(feeVerifiedRaw)
        : null;

    await sql.begin(async (tx: any) => {
      await tx`
        INSERT INTO knox_overrides
          (rejection_msg_id, fee_verified_id, decision, reviewer_id, note)
        VALUES
          (${messageId}, ${feeVerifiedId}, 'confirm', ${user.id}, ${parsedNote.data ?? null})
      `;
      await tx`
        INSERT INTO agent_events
          (agent_name, action, tool_name, entity, entity_id, status, input_payload)
        VALUES
          ('_human_review', 'knox_confirm', 'knox_review_ui',
           'agent_messages', ${messageId}, 'success',
           ${sql.json({
             reviewer_id: user.id,
             fee_verified_id: feeVerifiedId,
             note: parsedNote.data ?? null,
           })})
      `;
    });

    revalidatePath("/admin/agents/knox/reviews");
    revalidatePath(`/admin/agents/knox/reviews/${messageId}`);
    return { success: true };
  } catch (e) {
    console.error("confirmRejection failed:", e);
    const msg = e instanceof Error ? e.message : String(e);
    // Unique-index violation -> already reviewed.
    if (msg.includes("knox_overrides_rejection_msg_unique")) {
      return { success: false, error: "already reviewed" };
    }
    return { success: false, error: msg };
  }
}

/**
 * Override a Knox rejection: re-promote the referenced fee_verified row to
 * fees_published by completing the adversarial handshake on Knox's behalf.
 *
 * We DO NOT duplicate the promote_to_tier3 write path. Instead:
 *   1. Insert a new agent_messages row  sender='knox' intent='accept'
 *      referencing the same fee_verified_id (V4 handshake requirement).
 *   2. Call promote_to_tier3(fee_verified_id, adversarial_event_id) which
 *      performs the fees_published INSERT inside its own transaction if both
 *      darwin+knox accepts exist; otherwise it raises.
 *   3. Record the verdict in knox_overrides with the resulting
 *      promoted_fee_published_id (or NULL if promotion was blocked).
 */
export async function overrideRejection(
  messageId: string,
  note: string
): Promise<ActionResult> {
  const user = await requireAuth("approve");
  const parsedId = idSchema.safeParse(messageId);
  if (!parsedId.success) return { success: false, error: "invalid message id" };
  if (!note || note.trim().length < 3) {
    return { success: false, error: "override note is required" };
  }
  const parsedNote = noteSchema.safeParse(note);
  if (!parsedNote.success) return { success: false, error: "invalid note" };

  try {
    const msg = await sql<{
      correlation_id: string;
      payload: Record<string, unknown>;
    }[]>`
      SELECT correlation_id, payload FROM agent_messages
      WHERE message_id = ${messageId}
        AND sender_agent = 'knox'
        AND intent = 'reject'
      LIMIT 1
    `;
    if (msg.length === 0) {
      return { success: false, error: "rejection not found" };
    }
    const correlationId = msg[0].correlation_id;
    const feeVerifiedRaw = msg[0].payload?.["fee_verified_id"];
    const feeVerifiedId =
      typeof feeVerifiedRaw === "string" || typeof feeVerifiedRaw === "number"
        ? Number(feeVerifiedRaw)
        : null;

    if (!feeVerifiedId || Number.isNaN(feeVerifiedId)) {
      return {
        success: false,
        error: "rejection has no fee_verified_id; cannot override",
      };
    }

    let publishedId: number | null = null;

    await sql.begin(async (tx: any) => {
      // Ensure the human verdict is recorded first; unique index guarantees
      // idempotency even if the promotion step throws.
      await tx`
        INSERT INTO knox_overrides
          (rejection_msg_id, fee_verified_id, decision, reviewer_id, note)
        VALUES
          (${messageId}, ${feeVerifiedId}, 'override', ${user.id}, ${parsedNote.data ?? null})
      `;

      // Write a human-attested knox 'accept' so the 62b V4 handshake check
      // in promote_to_tier3 passes. Recipient stays 'darwin' per the existing
      // convention.
      const acceptRows = await tx<{ message_id: string }[]>`
        INSERT INTO agent_messages
          (sender_agent, recipient_agent, intent, state,
           correlation_id, payload, round_number)
        VALUES
          ('knox', 'darwin', 'accept', 'resolved',
           ${correlationId},
           ${sql.json({
             fee_verified_id: feeVerifiedId,
             source: "human_override",
             reviewer_id: user.id,
             overrides_rejection_msg_id: messageId,
           })},
           1)
        RETURNING message_id
      `;
      const acceptMsgId = acceptRows[0]?.message_id;

      // Adversarial event to anchor the promotion. promote_to_tier3 accepts a
      // UUID referencing an agent_events row.
      const adv = await tx<{ event_id: string }[]>`
        INSERT INTO agent_events
          (agent_name, action, tool_name, entity, entity_id, status,
           correlation_id, input_payload)
        VALUES
          ('_human_review', 'knox_override', 'knox_review_ui',
           'agent_messages', ${messageId}, 'success',
           ${correlationId},
           ${sql.json({
             reviewer_id: user.id,
             fee_verified_id: feeVerifiedId,
             note: parsedNote.data ?? null,
             accept_message_id: acceptMsgId,
           })})
        RETURNING event_id
      `;
      const adversarialEventId = adv[0]?.event_id;

      try {
        const res = await tx<{ published_id: string }[]>`
          SELECT promote_to_tier3(${feeVerifiedId}::bigint, ${adversarialEventId}::uuid) AS published_id
        `;
        publishedId = res[0]?.published_id ? Number(res[0].published_id) : null;
        if (publishedId !== null) {
          await tx`
            UPDATE knox_overrides
               SET promoted_fee_published_id = ${publishedId}
             WHERE rejection_msg_id = ${messageId}
          `;
        }
      } catch (err) {
        // Handshake still incomplete (typically: darwin has not posted 'accept').
        // The knox_overrides row + the human-attested knox 'accept' remain so
        // the next darwin pass can complete promotion without re-review.
        console.warn(
          "overrideRejection: promote_to_tier3 blocked:",
          err instanceof Error ? err.message : String(err)
        );
      }
    });

    revalidatePath("/admin/agents/knox/reviews");
    revalidatePath(`/admin/agents/knox/reviews/${messageId}`);
    return { success: true, promoted_fee_published_id: publishedId };
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    if (errMsg.includes("knox_overrides_rejection_msg_unique")) {
      return { success: false, error: "already reviewed" };
    }
    console.error("overrideRejection failed:", e);
    return { success: false, error: errMsg };
  }
}

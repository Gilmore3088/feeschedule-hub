/**
 * Hamilton Chat Memory — Supabase conversation persistence.
 *
 * Tables:
 *   hamilton_conversations — one row per conversation session
 *   hamilton_messages     — one row per turn (user or assistant)
 *
 * All queries use the shared postgres sql client from crawler-db/connection.
 * UUID primary keys match Supabase gen_random_uuid() convention.
 *
 * Security: loadConversationHistory is scoped to (conversation_id, user_id)
 * to prevent cross-user history access (T-17-04).
 */

import { sql } from "@/lib/crawler-db/connection";

export interface ConversationSummary {
  id: string;
  title: string | null;
  updatedAt: string;
}

/**
 * Create Hamilton tables if they do not already exist.
 * Safe to call repeatedly (IF NOT EXISTS).
 * Called at cold start in the API route — errors are swallowed to keep
 * the route alive even if the DB schema hasn't been applied yet.
 */
export async function ensureHamiltonTables(): Promise<void> {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS hamilton_conversations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id INTEGER NOT NULL,
        title TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS hamilton_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID NOT NULL REFERENCES hamilton_conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        token_count INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_hamilton_conv_user
        ON hamilton_conversations(user_id, updated_at DESC)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_hamilton_msg_conv
        ON hamilton_messages(conversation_id, created_at ASC)
    `;
  } catch (err) {
    console.error("[hamilton] ensureHamiltonTables failed:", err);
  }
}

/**
 * Create a new conversation for a user. Returns the UUID string of the new row.
 */
export async function createConversation(userId: number): Promise<string> {
  const [row] = await sql`
    INSERT INTO hamilton_conversations (user_id)
    VALUES (${userId})
    RETURNING id
  ` as Array<{ id: string }>;

  return row.id;
}

/**
 * Append a message to a conversation. Also bumps updated_at on the parent conversation.
 */
export async function appendMessage(
  conversationId: string,
  role: "user" | "assistant",
  content: string,
  tokenCount?: number
): Promise<void> {
  await sql`
    INSERT INTO hamilton_messages (conversation_id, role, content, token_count)
    VALUES (${conversationId}, ${role}, ${content}, ${tokenCount ?? null})
  `;

  await sql`
    UPDATE hamilton_conversations
    SET updated_at = NOW()
    WHERE id = ${conversationId}
  `;
}

/**
 * Load the last `limit` messages for a conversation in chronological order.
 *
 * T-17-04: scoped to (conversation_id, user_id) to prevent cross-user access.
 * Returns plain objects — the API route converts to UIMessage shape.
 */
export async function loadConversationHistory(
  conversationId: string,
  userId: number,
  limit = 20
): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  // Verify the conversation belongs to this user (T-17-04)
  const [conv] = await sql`
    SELECT id FROM hamilton_conversations
    WHERE id = ${conversationId} AND user_id = ${userId}
  ` as Array<{ id: string }>;

  if (!conv) return [];

  const rows = await sql`
    SELECT role, content
    FROM hamilton_messages
    WHERE conversation_id = ${conversationId}
    ORDER BY created_at ASC
    LIMIT ${limit}
  ` as Array<{ role: "user" | "assistant"; content: string }>;

  return rows;
}

/**
 * List conversations for a user, ordered by most recently updated.
 */
export async function listConversations(
  userId: number,
  limit = 30
): Promise<ConversationSummary[]> {
  const rows = await sql`
    SELECT id, title, updated_at
    FROM hamilton_conversations
    WHERE user_id = ${userId}
    ORDER BY updated_at DESC
    LIMIT ${limit}
  ` as Array<{ id: string; title: string | null; updated_at: string }>;

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    updatedAt: r.updated_at,
  }));
}

/**
 * Update the title of a conversation (e.g., auto-generated from the first user message).
 */
export async function updateConversationTitle(
  conversationId: string,
  title: string
): Promise<void> {
  await sql`
    UPDATE hamilton_conversations
    SET title = ${title}, updated_at = NOW()
    WHERE id = ${conversationId}
  `;
}

/**
 * GET /api/hamilton/conversations/[id]/messages
 *
 * Returns messages for a specific conversation.
 * T-17-07: Auth-gated + conversation ownership verified via user_id scope in DB.
 */

import { getCurrentUser } from "@/lib/auth";
import { loadConversationHistory } from "@/lib/hamilton/chat-memory";

// UUID v4 validation regex (T-17-07)
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  if (user.role !== "analyst" && user.role !== "admin") {
    return Response.json({ error: "Insufficient role" }, { status: 403 });
  }

  const { id } = await params;

  // Validate UUID format to prevent injection (T-17-07)
  if (!id || !UUID_REGEX.test(id)) {
    return Response.json({ error: "Invalid conversation ID" }, { status: 400 });
  }

  try {
    // loadConversationHistory is scoped to user_id — prevents cross-user access (T-17-07)
    const messages = await loadConversationHistory(id, user.id, 50);
    return Response.json({ messages });
  } catch {
    return Response.json(
      { error: "Failed to load conversation history" },
      { status: 500 }
    );
  }
}

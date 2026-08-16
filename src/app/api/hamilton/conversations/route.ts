import { withApiRoutePolicy } from "@/lib/api-hardening/route-wrapper";
/**
 * GET /api/hamilton/conversations
 *
 * Returns the authenticated user's Hamilton conversation list.
 * Auth-gated: analyst or admin only.
 */

import { getCurrentUser } from "@/lib/auth";
import { listConversations, createConversation } from "@/lib/hamilton/chat-memory";

async function handleGET() {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  if (user.role !== "analyst" && user.role !== "admin") {
    return Response.json({ error: "Insufficient role" }, { status: 403 });
  }

  try {
    const conversations = await listConversations(user.id, 30);
    return Response.json({ conversations });
  } catch {
    return Response.json(
      { error: "Failed to load conversations" },
      { status: 500 }
    );
  }
}

async function handlePOST() {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  if (user.role !== "analyst" && user.role !== "admin") {
    return Response.json({ error: "Insufficient role" }, { status: 403 });
  }

  try {
    const id = await createConversation(user.id);
    return Response.json({ id }, { status: 201 });
  } catch {
    return Response.json(
      { error: "Failed to create conversation" },
      { status: 500 }
    );
  }
}

export const GET = withApiRoutePolicy("api.hamilton.conversations", "GET", handleGET);
export const POST = withApiRoutePolicy("api.hamilton.conversations", "POST", handlePOST);

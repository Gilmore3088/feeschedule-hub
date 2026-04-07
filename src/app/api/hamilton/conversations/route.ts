/**
 * GET /api/hamilton/conversations
 *
 * Returns the authenticated user's Hamilton conversation list.
 * Auth-gated: analyst or admin only.
 */

import { getCurrentUser } from "@/lib/auth";
import { listConversations, createConversation } from "@/lib/hamilton/chat-memory";

export async function GET() {
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

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  if (user.role !== "analyst" && user.role !== "admin") {
    return Response.json({ error: "Insufficient role" }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const title = typeof body.title === "string" ? body.title : "New conversation";
    const id = await createConversation(user.id, title);
    return Response.json({ id }, { status: 201 });
  } catch {
    return Response.json(
      { error: "Failed to create conversation" },
      { status: 500 }
    );
  }
}

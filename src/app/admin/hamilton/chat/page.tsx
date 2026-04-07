export const dynamic = "force-dynamic";
export const metadata = { title: "Hamilton Chat — Bank Fee Index Admin" };

import { requireAuth } from "@/lib/auth";
import { ensureHamiltonTables, listConversations } from "@/lib/hamilton/chat-memory";
import { HamiltonChat } from "./hamilton-chat";

export default async function HamiltonChatPage() {
  // "research" permission is held by analyst and admin roles
  const user = await requireAuth("research");

  // Idempotent table creation — fire-and-forget, non-blocking
  ensureHamiltonTables().catch(() => {});

  const conversations = await listConversations(user.id, 30).catch(() => []);

  return (
    <div className="admin-content">
      <HamiltonChat initialConversations={conversations} userId={user.id} />
    </div>
  );
}

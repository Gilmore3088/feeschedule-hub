import { requireAuth } from "@/lib/auth";
import { getAgent } from "@/lib/research/agents";
import { notFound } from "next/navigation";
import { listConversations, ensureResearchTables } from "@/lib/research/history";
import { ResearchChat } from "./research-chat";

export default async function AgentChatPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = await params;
  const agent = getAgent(agentId);
  if (!agent || !agent.requiresAuth) notFound();

  const user = await requireAuth("view");

  // Check role access
  const roleOrder: Record<string, number> = { viewer: 0, premium: 1, analyst: 2, admin: 3 };
  const requiredLevel = roleOrder[agent.requiredRole ?? "viewer"] ?? 0;
  const userLevel = roleOrder[user.role] ?? 0;
  if (userLevel < requiredLevel) notFound();

  ensureResearchTables();
  const conversations = listConversations(user.id, agentId, 20);

  return (
    <div className="admin-content">
      <ResearchChat
        agentId={agentId}
        agentName={agent.name}
        agentDescription={agent.description}
        exampleQuestions={agent.exampleQuestions}
        conversations={conversations.map((c) => ({
          id: c.id,
          title: c.title ?? "Untitled",
          updatedAt: c.updated_at,
        }))}
      />
    </div>
  );
}

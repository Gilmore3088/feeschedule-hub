import { streamText, convertToModelMessages, stepCountIs, type UIMessage } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { getAgent } from "@/lib/research/agents";
import { getCurrentUser } from "@/lib/auth";
import {
  checkPublicRateLimit,
  checkAdminRateLimit,
} from "@/lib/research/rate-limit";

export const maxDuration = 30;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  const agent = getAgent(agentId);

  if (!agent) {
    return Response.json({ error: "Unknown agent" }, { status: 404 });
  }

  // Auth check for admin agents
  if (agent.requiresAuth) {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Authentication required" }, { status: 401 });
    }

    const roleOrder = { viewer: 0, analyst: 1, admin: 2 };
    const requiredLevel = roleOrder[agent.requiredRole ?? "viewer"];
    const userLevel = roleOrder[user.role];
    if (userLevel < requiredLevel) {
      return Response.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    // Admin rate limiting
    const rateResult = checkAdminRateLimit(
      user.id,
      user.role as "analyst" | "admin"
    );
    if (!rateResult.allowed) {
      return Response.json(
        { error: "Rate limit exceeded", resetAt: rateResult.resetAt },
        { status: 429 }
      );
    }
  } else {
    // Public rate limiting by IP
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";

    const rateResult = checkPublicRateLimit(ip);
    if (!rateResult.allowed) {
      return Response.json(
        { error: "Rate limit exceeded. Please try again later.", resetAt: rateResult.resetAt },
        { status: 429 }
      );
    }
  }

  const { messages }: { messages: UIMessage[] } = await request.json();

  const result = streamText({
    model: anthropic(agent.model),
    system: agent.systemPrompt,
    messages: await convertToModelMessages(messages),
    tools: agent.tools,
    maxOutputTokens: agent.maxTokens,
    stopWhen: stepCountIs(agent.maxSteps),
  });

  return result.toUIMessageStreamResponse();
}

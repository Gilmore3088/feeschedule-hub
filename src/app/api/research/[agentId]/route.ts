import { streamText, convertToModelMessages, stepCountIs, type UIMessage } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { getAgent } from "@/lib/research/agents";
import { getCurrentUser, type User } from "@/lib/auth";
import {
  checkPublicRateLimit,
  checkAdminRateLimit,
} from "@/lib/research/rate-limit";
import { getDailyCostCents, logUsage } from "@/lib/research/history";

export const maxDuration = 30;

// Daily cost circuit breaker thresholds (in cents)
const DAILY_COST_LIMIT_CENTS = 5000; // $50/day

// Cost per 1M tokens (in cents) for estimation
const COST_PER_M_INPUT: Record<string, number> = {
  "claude-sonnet-4-5-20250514": 300,
  "claude-opus-4-5-20250514": 1500,
};
const COST_PER_M_OUTPUT: Record<string, number> = {
  "claude-sonnet-4-5-20250514": 1500,
  "claude-opus-4-5-20250514": 7500,
};

function estimateCostCents(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const inputRate = COST_PER_M_INPUT[model] ?? 300;
  const outputRate = COST_PER_M_OUTPUT[model] ?? 1500;
  return Math.round(
    (inputTokens * inputRate + outputTokens * outputRate) / 1_000_000
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  const agent = getAgent(agentId);

  if (!agent) {
    return Response.json({ error: "Unknown agent" }, { status: 404 });
  }

  // Check API key
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "AI service not configured. Set ANTHROPIC_API_KEY." },
      { status: 503 }
    );
  }

  // Daily cost circuit breaker
  try {
    const dailyCost = getDailyCostCents();
    if (dailyCost >= DAILY_COST_LIMIT_CENTS) {
      return Response.json(
        { error: "Daily cost limit reached. AI research is temporarily disabled." },
        { status: 503 }
      );
    }
  } catch {
    // Tables may not exist yet — allow through
  }

  let user: User | null = null;
  let ip = "unknown";

  // Auth check for admin agents
  if (agent.requiresAuth) {
    user = await getCurrentUser();
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
    ip =
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

  let messages: UIMessage[];
  try {
    const body = await request.json();
    messages = body.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      return Response.json({ error: "Messages required" }, { status: 400 });
    }
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    const result = streamText({
      model: anthropic(agent.model),
      system: agent.systemPrompt,
      messages: await convertToModelMessages(messages),
      tools: agent.tools,
      maxOutputTokens: agent.maxTokens,
      stopWhen: stepCountIs(agent.maxSteps),
      onFinish: async ({ usage }) => {
        // Log usage for cost tracking
        try {
          const inputTokens = usage?.inputTokens ?? 0;
          const outputTokens = usage?.outputTokens ?? 0;
          const costCents = estimateCostCents(
            agent.model,
            inputTokens,
            outputTokens
          );
          logUsage(
            user?.id ?? null,
            user ? null : ip,
            agentId,
            inputTokens,
            outputTokens,
            costCents
          );
        } catch {
          // Non-critical — don't fail the response
        }
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "An unexpected error occurred";

    // Detect specific Anthropic errors
    if (message.includes("authentication") || message.includes("API key")) {
      return Response.json(
        { error: "AI service authentication failed. Check API key." },
        { status: 503 }
      );
    }
    if (message.includes("rate") || message.includes("429")) {
      return Response.json(
        { error: "AI service rate limited. Please try again in a moment." },
        { status: 429 }
      );
    }

    return Response.json(
      { error: "Failed to process your question. Please try again." },
      { status: 500 }
    );
  }
}

import { streamText, convertToModelMessages, stepCountIs, type UIMessage } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { getHamilton, type HamiltonRole } from "@/lib/research/agents";
import { getCurrentUser, type User } from "@/lib/auth";
import {
  checkPublicRateLimit,
  checkAdminRateLimit,
} from "@/lib/research/rate-limit";
import { getDailyCostCents, logUsage } from "@/lib/research/history";
import {
  detectSkill,
  buildSkillInjection,
  buildSkillExecution,
  isSkillOptIn,
  findOfferedSkill,
} from "@/lib/research/skills";
import { canAccessPremium } from "@/lib/access";

export const maxDuration = 30;

// Daily cost circuit breaker thresholds (in cents)
const DAILY_COST_LIMIT_CENTS = 5000; // $50/day

// Cost per 1M tokens (in cents) for estimation
const COST_PER_M_INPUT: Record<string, number> = {
  "claude-haiku-4-5-20251001": 80,
  "claude-sonnet-4-5-20250929": 300,
  "claude-opus-4-5-20250514": 1500,
};
const COST_PER_M_OUTPUT: Record<string, number> = {
  "claude-haiku-4-5-20251001": 400,
  "claude-sonnet-4-5-20250929": 1500,
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

export async function POST(request: Request) {
  // Check API key
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "AI service not configured. Set ANTHROPIC_API_KEY." },
      { status: 503 }
    );
  }

  // Daily cost circuit breaker
  try {
    const dailyCost = await getDailyCostCents();
    if (dailyCost >= DAILY_COST_LIMIT_CENTS) {
      return Response.json(
        { error: "Daily cost limit reached. AI research is temporarily disabled." },
        { status: 503 }
      );
    }
  } catch {
    // Tables may not exist yet — allow through
  }

  // Resolve role from session
  let user: User | null = null;
  let ip = "unknown";
  let role: HamiltonRole = "consumer";

  user = await getCurrentUser();

  if (user) {
    if (user.role === "admin" || user.role === "analyst") {
      role = "admin";
    } else if (user.role === "premium") {
      role = "pro";
    } else {
      role = "consumer";
    }
  }

  // Auth enforcement based on resolved role
  if (role === "admin") {
    // Admin/analyst — rate limit by user
    const rateResult = checkAdminRateLimit(
      user!.id,
      user!.role as "premium" | "analyst" | "admin"
    );
    if (!rateResult.allowed) {
      return Response.json(
        { error: "Rate limit exceeded", resetAt: rateResult.resetAt },
        { status: 429 }
      );
    }
  } else if (role === "pro") {
    // Pro — check active subscription
    if (!canAccessPremium(user)) {
      return Response.json({ error: "Active subscription required" }, { status: 403 });
    }
    const rateResult = checkAdminRateLimit(user!.id, "premium");
    if (!rateResult.allowed) {
      return Response.json(
        { error: "Rate limit exceeded", resetAt: rateResult.resetAt },
        { status: 429 }
      );
    }
  } else {
    // Consumer (unauthenticated or viewer) — rate limit by IP
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

  const agent = await getHamilton(role);

  // Auto-detect and inject domain skill based on the user's latest message
  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
  const lastUserText =
    lastUserMessage?.parts
      ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join(" ") || "";

  let systemPrompt = agent.systemPrompt;

  // Check if user is opting in to a previously offered skill deliverable
  if (lastUserText && isSkillOptIn(lastUserText)) {
    const assistantTexts = messages
      .filter((m) => m.role === "assistant")
      .flatMap((m) =>
        (m.parts ?? [])
          .filter((p): p is { type: "text"; text: string } => p.type === "text")
          .map((p) => ({ text: p.text }))
      );
    const offeredSkill = findOfferedSkill(assistantTexts);
    if (offeredSkill) {
      systemPrompt += buildSkillExecution(offeredSkill);
    }
  } else {
    // Detect skill match and offer it (without injecting the full template)
    const matchedSkill = lastUserText ? detectSkill(lastUserText) : null;
    if (matchedSkill) {
      systemPrompt += buildSkillInjection(matchedSkill);
    }
  }

  try {
    const result = streamText({
      model: anthropic(agent.model),
      system: systemPrompt,
      messages: await convertToModelMessages(messages),
      tools: agent.tools,
      maxOutputTokens: agent.maxTokens,
      stopWhen: stepCountIs(agent.maxSteps),
      onFinish: async ({ usage }) => {
        try {
          const inputTokens = usage?.inputTokens ?? 0;
          const outputTokens = usage?.outputTokens ?? 0;
          const costCents = estimateCostCents(agent.model, inputTokens, outputTokens);
          await logUsage(
            user?.id ?? null,
            user ? null : ip,
            "hamilton",
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

/**
 * POST /api/hamilton/chat
 *
 * Hamilton unified research chat endpoint.
 * Streaming AI SDK response — follows the same auth + rate-limit + cost-breaker
 * pattern as /api/research/[agentId]/route.ts.
 *
 * Auth: analyst or admin role required (T-17-02)
 * Memory: optional conversation_id for session continuity (T-17-04, T-17-05)
 * Cost guard: daily circuit breaker at $50 (shared with research agents)
 * Tool loop cap: stepCountIs(10) (T-17-03)
 */

import { streamText, convertToModelMessages, stepCountIs, type UIMessage } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { getCurrentUser } from "@/lib/auth";
import { checkAdminRateLimit } from "@/lib/research/rate-limit";
import { getDailyCostCents, logUsage } from "@/lib/research/history";
import { buildHamiltonTools, buildHamiltonSystemPrompt } from "@/lib/hamilton/hamilton-agent";
import {
  ensureHamiltonTables,
  loadConversationHistory,
  appendMessage,
} from "@/lib/hamilton/chat-memory";

export const maxDuration = 60;

const DAILY_COST_LIMIT_CENTS = 5000; // $50/day
const HAMILTON_MODEL = "claude-sonnet-4-5-20250929";

// Cost per 1M tokens (in cents)
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

// UUID v4 validation regex (T-17-05)
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  // Ensure Hamilton tables exist (idempotent, non-blocking on cold start)
  ensureHamiltonTables().catch(() => {});

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
        { error: "Daily cost limit reached. Hamilton is temporarily unavailable." },
        { status: 503 }
      );
    }
  } catch {
    // Non-critical — continue if cost check fails
  }

  // Auth check: analyst or admin only (T-17-02)
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  if (user.role !== "analyst" && user.role !== "admin") {
    return Response.json(
      { error: "Hamilton requires analyst or admin role" },
      { status: 403 }
    );
  }

  // Rate limiting
  const rateResult = await checkAdminRateLimit(
    user.id,
    user.role as "analyst" | "admin"
  );
  if (!rateResult.allowed) {
    return Response.json(
      { error: "Rate limit exceeded", resetAt: rateResult.resetAt },
      { status: 429 }
    );
  }

  // Parse request body
  let messages: UIMessage[];
  let conversationId: string | undefined;

  try {
    const body = await request.json();
    messages = body.messages;
    conversationId = body.conversation_id;

    if (!Array.isArray(messages) || messages.length === 0) {
      return Response.json({ error: "Messages required" }, { status: 400 });
    }
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  // T-17-05: Validate conversation_id UUID format
  if (conversationId !== undefined) {
    if (typeof conversationId !== "string" || !UUID_REGEX.test(conversationId)) {
      return Response.json(
        { error: "Invalid conversation_id format" },
        { status: 400 }
      );
    }
  }

  // Prepend conversation history for session continuity (T-17-04: user_id scoped)
  if (conversationId) {
    try {
      const history = await loadConversationHistory(
        conversationId,
        user.id,
        20
      );
      // Inject prior turns as UIMessage objects before the new messages
      if (history.length > 0) {
        const priorMessages: UIMessage[] = history.map((h, i) => ({
          id: `history-${i}`,
          role: h.role,
          parts: [{ type: "text" as const, text: h.content }],
        }));
        messages = [...priorMessages, ...messages];
      }
    } catch {
      // Non-critical — continue without history if load fails
    }
  }

  try {
    const result = streamText({
      model: anthropic(HAMILTON_MODEL),
      system: buildHamiltonSystemPrompt(),
      messages: await convertToModelMessages(messages),
      tools: buildHamiltonTools(),
      maxOutputTokens: 3000,
      stopWhen: stepCountIs(10),
      onFinish: async ({ usage, text }) => {
        try {
          const inputTokens = usage?.inputTokens ?? 0;
          const outputTokens = usage?.outputTokens ?? 0;
          const costCents = estimateCostCents(HAMILTON_MODEL, inputTokens, outputTokens);

          await logUsage(user.id, null, "hamilton-chat", inputTokens, outputTokens, costCents);

          // Persist messages to conversation if conversation_id provided
          if (conversationId) {
            // Find the latest user message to persist
            const lastUserMsg = [...messages]
              .reverse()
              .find((m) => m.role === "user");
            const userText = lastUserMsg?.parts
              ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
              .map((p) => p.text)
              .join(" ") ?? "";

            if (userText) {
              await appendMessage(conversationId, "user", userText).catch(() => {});
            }
            if (text) {
              await appendMessage(conversationId, "assistant", text, outputTokens).catch(() => {});
            }
          }
        } catch {
          // Non-critical — don't fail the stream
        }
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (err) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred";
    const stack = err instanceof Error ? err.stack : "";
    console.error("[hamilton/chat] Error:", message, "\nStack:", stack);

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
      { error: `Hamilton error: ${message}` },
      { status: 500 }
    );
  }
}

/**
 * POST /api/hamilton/simulate
 *
 * Generates Hamilton's interpretation of a fee change scenario.
 * Called ONLY on slider commit (onValueCommit), NOT on every drag.
 *
 * Request body:
 *   feeCategory: string
 *   currentFee: number
 *   proposedFee: number
 *   distributionData: DistributionData (p25/median/p75/min/max/approved_count)
 *   institutionContext: { name?: string; type?: string; assetTier?: string; fedDistrict?: number | null }
 *
 * Response: data stream — plain text prose interpretation
 * Only the interpretation field streams. Structured fields (tradeoffs, recommendedPosition)
 * are computed client-side in simulation.ts.
 *
 * Auth: premium/admin required
 * Cost: daily circuit breaker ($50 shared with other Hamilton routes)
 */

import { streamText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { getCurrentUser } from "@/lib/auth";
import { canAccessPremium } from "@/lib/access";
import { getDailyCostCents, logUsage } from "@/lib/research/history";
import type { DistributionData } from "@/lib/hamilton/simulation";

export const maxDuration = 30;

const HAMILTON_MODEL = "claude-sonnet-4-5-20250929";
const DAILY_COST_LIMIT_CENTS = 5000; // $50/day

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

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !canAccessPremium(user)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const dailyCost = await getDailyCostCents().catch(() => 0);
  if (dailyCost >= DAILY_COST_LIMIT_CENTS) {
    return new Response("Daily cost limit reached", { status: 429 });
  }

  let body: {
    feeCategory: string;
    currentFee: number;
    proposedFee: number;
    distributionData: DistributionData;
    institutionContext: {
      name?: string;
      type?: string;
      assetTier?: string;
      fedDistrict?: number | null;
    };
  };

  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { feeCategory, currentFee, proposedFee, distributionData, institutionContext } = body;

  if (!feeCategory || typeof currentFee !== "number" || typeof proposedFee !== "number") {
    return new Response("Missing required fields: feeCategory, currentFee, proposedFee", {
      status: 400,
    });
  }

  const { median_amount, p25_amount, p75_amount, approved_count } = distributionData;
  const direction =
    proposedFee > currentFee
      ? "increasing"
      : proposedFee < currentFee
      ? "decreasing"
      : "maintaining";
  const changeDollars = Math.abs(proposedFee - currentFee).toFixed(2);
  const displayCategory = feeCategory.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const systemPrompt = `You are Hamilton, a senior banking fee strategist. You provide precise, authoritative analysis of fee change scenarios.

Your response MUST be plain prose — NO markdown headers, NO bullet points, NO lists.
Write 3–4 sentences maximum. Be specific about dollar amounts, percentile positions, and peer context.
Tone: McKinsey-grade strategic advisor. Confident, not hedging. Data-grounded, not generic.`;

  const institutionLine = institutionContext.name
    ? `Institution: ${institutionContext.name}${institutionContext.type ? ` (${institutionContext.type}` : ""}${institutionContext.assetTier ? `, ${institutionContext.assetTier}` : ""}${institutionContext.type ? ")" : ""}`
    : "";

  const userPrompt = `${institutionLine}

Fee category: ${displayCategory}
Current fee: $${currentFee.toFixed(2)}
Proposed fee: $${proposedFee.toFixed(2)} (${direction} by $${changeDollars})

Market distribution (${approved_count} approved observations):
- P25: $${p25_amount?.toFixed(2) ?? "N/A"}
- Median: $${median_amount?.toFixed(2) ?? "N/A"}
- P75: $${p75_amount?.toFixed(2) ?? "N/A"}

Provide a concise strategic interpretation of this fee change. What does this positioning mean competitively? What is the key risk or opportunity?`.trim();

  const result = await streamText({
    model: anthropic(HAMILTON_MODEL),
    system: systemPrompt,
    prompt: userPrompt,
    maxOutputTokens: 300,
    onFinish: ({ usage }) => {
      const inputRate = COST_PER_M_INPUT[HAMILTON_MODEL] ?? 300;
      const outputRate = COST_PER_M_OUTPUT[HAMILTON_MODEL] ?? 1500;
      const inputTokens = usage?.inputTokens ?? 0;
      const outputTokens = usage?.outputTokens ?? 0;
      const costCents = Math.round(
        (inputTokens * inputRate + outputTokens * outputRate) / 1_000_000
      );
      logUsage(user.id, null, "hamilton-simulate", inputTokens, outputTokens, costCents).catch(
        () => {}
      );
    },
  });

  return result.toTextStreamResponse();
}

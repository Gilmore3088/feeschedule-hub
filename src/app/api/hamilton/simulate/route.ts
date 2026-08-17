import { withApiRoutePolicy } from "@/lib/api-hardening/route-wrapper";
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
 *   peerContext: optional label/source/fallback metadata for the selected peer baseline
 *
 * Response: data stream — plain text prose interpretation
 * Only the interpretation field streams. Structured fields (tradeoffs, recommendedPosition)
 * are computed client-side in simulation.ts.
 *
 * Auth: premium/admin required
 * Cost: daily circuit breaker ($50 shared with other Hamilton routes)
 */

import { streamText } from "ai";
import { guardProviderCall, recordProviderUsage } from "@/lib/ai-provider-usage";
import { getAnthropicLanguageModel } from "@/lib/ai-provider";
import { getCurrentUser } from "@/lib/auth";
import { canAccessPremium } from "@/lib/access";
import { logUsage } from "@/lib/research/history";
import type { DistributionData } from "@/lib/hamilton/simulation";
import { getRequestSubjectKey } from "@/lib/api-hardening/audit";

export const maxDuration = 30;

const HAMILTON_MODEL = "claude-sonnet-4-5-20250929";

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

async function handlePOST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !canAccessPremium(user)) {
    return new Response("Unauthorized", { status: 401 });
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
    peerContext?: {
      label?: string | null;
      source?: string | null;
      fallbackReason?: string | null;
    };
  };

  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { feeCategory, currentFee, proposedFee, distributionData, institutionContext, peerContext } = body;

  if (!feeCategory || typeof currentFee !== "number" || typeof proposedFee !== "number") {
    return new Response("Missing required fields: feeCategory, currentFee, proposedFee", {
      status: 400,
    });
  }

  const { median_amount, p25_amount, p75_amount, approved_count } = distributionData;
  const peerLabel = peerContext?.label || distributionData.peer_label || "verified peer baseline";
  const peerSource = peerContext?.source || distributionData.peer_source || "unknown";
  const peerFallbackReason = peerContext?.fallbackReason || distributionData.peer_fallback_reason || null;
  const direction =
    proposedFee > currentFee
      ? "increasing"
      : proposedFee < currentFee
      ? "decreasing"
      : "maintaining";
  const changeDollars = Math.abs(proposedFee - currentFee).toFixed(2);
  const displayCategory = feeCategory.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const systemPrompt = `You are Hamilton, a senior banking fee strategist at Fee Insight, working from the Bank Fee Index dataset. You provide precise, authoritative analysis of fee change scenarios grounded in peer positioning and market context.

Your response MUST be plain prose — NO markdown headers, NO bullet points, NO lists.
Write 3–4 sentences maximum. Reference the percentile positions and peer distribution data provided.

REQUIRED framing — address these dimensions:
- Peer positioning: Where this fee sits relative to P25/median/P75 and what that signals competitively
- Complaint and attrition risk: At above-P75 positioning, note elevated CFPB complaint exposure and peer migration patterns at similar fee levels
- Revenue direction: Characterize as revenue-positive, revenue-neutral, or revenue-compressing — do NOT quantify with dollar amounts
- Regulatory awareness: Note any known regulatory scrutiny for this fee category if relevant

Do NOT provide concrete dollar revenue projections. No "you'll lose $X million" or "revenue impact: -$500K". Frame revenue impact directionally only.

Tone: Top-tier consulting strategic advisor. Confident, not hedging. Data-grounded, not generic.`;

  const institutionLine = institutionContext.name
    ? `Institution: ${institutionContext.name}${institutionContext.type ? ` (${institutionContext.type}` : ""}${institutionContext.assetTier ? `, ${institutionContext.assetTier}` : ""}${institutionContext.type ? ")" : ""}`
    : "";

  const userPrompt = `${institutionLine}

Fee category: ${displayCategory}
Current fee: $${currentFee.toFixed(2)}
Proposed fee: $${proposedFee.toFixed(2)} (${direction} by $${changeDollars})

Peer baseline: ${peerLabel} (${peerSource})
${peerFallbackReason ? `Peer fallback: ${peerFallbackReason}` : ""}
Peer distribution (${approved_count} approved observations):
- P25: $${p25_amount?.toFixed(2) ?? "N/A"}
- Median: $${median_amount?.toFixed(2) ?? "N/A"}
- P75: $${p75_amount?.toFixed(2) ?? "N/A"}

Provide a concise strategic interpretation of this fee change. What does this positioning mean competitively? What is the key risk or opportunity?`.trim();

  const providerContext = {
    provider: "anthropic" as const,
    model: HAMILTON_MODEL,
    agent: "hamilton",
    operation: "simulate_fee_change",
    routeId: "api.hamilton.simulate",
    userId: user.id,
    subjectKey: getRequestSubjectKey(request),
  };
  let providerStartedAt: number;
  try {
    providerStartedAt = await guardProviderCall(providerContext);
  } catch (error) {
    return new Response(
      error instanceof Error ? error.message : "Automation is stopped",
      { status: 423 },
    );
  }

  let providerFailed = false;
  const result = await streamText({
    model: getAnthropicLanguageModel(HAMILTON_MODEL),
    system: systemPrompt,
    prompt: userPrompt,
    maxOutputTokens: 300,
    onFinish: async ({ usage }) => {
      const inputRate = COST_PER_M_INPUT[HAMILTON_MODEL] ?? 300;
      const outputRate = COST_PER_M_OUTPUT[HAMILTON_MODEL] ?? 1500;
      const inputTokens = usage?.inputTokens ?? 0;
      const outputTokens = usage?.outputTokens ?? 0;
      const costCents = Math.round(
        (inputTokens * inputRate + outputTokens * outputRate) / 1_000_000
      );
      if (!providerFailed) {
        await recordProviderUsage(
          providerContext,
          "completed",
          { inputTokens, outputTokens },
          { latencyMs: Date.now() - providerStartedAt },
        );
      }
      logUsage(user.id, null, "hamilton-simulate", inputTokens, outputTokens, costCents).catch(
        () => {}
      );
    },
    onError: async ({ error }) => {
      providerFailed = true;
      await recordProviderUsage(providerContext, "failed", {}, {
        latencyMs: Date.now() - providerStartedAt,
        error: error instanceof Error ? error.message : String(error),
      });
    },
  });

  return result.toTextStreamResponse();
}

export const POST = withApiRoutePolicy("api.hamilton.simulate", "POST", handlePOST);

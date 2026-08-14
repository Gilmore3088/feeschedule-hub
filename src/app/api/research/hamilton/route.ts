import { streamText, generateText, convertToModelMessages, stepCountIs, type UIMessage } from "ai";
import {
  guardProviderCall,
  ProviderCircuitOpenError,
  recordProviderUsage,
  trackAnthropicRequest,
} from "@/lib/ai-provider-usage";
import {
  getAnthropicLanguageModel,
  hasAnthropicApiKey,
  MISSING_ANTHROPIC_API_KEY_MESSAGE,
} from "@/lib/ai-provider";
import { getHamilton, buildAnalyzeModeSuffix, buildMonitorModeSuffix, type HamiltonRole } from "@/lib/research/agents";
import { evaluateCitationDensity } from "@/lib/hamilton/citation-gate";
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
import {
  getFeesByInstitution,
  getFinancialsByInstitution,
  getInstitutionById,
} from "@/lib/data-store";
import {
  getInstitutionPeerRanking,
  getInstitutionRevenueTrend,
} from "@/lib/data-store/call-reports";
import { getInstitutionFeeScheduleEvidence } from "@/lib/data-store/institution";
import { getFeePublicationStatusLabel } from "@/lib/institution-quality";

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

async function buildSelectedInstitutionContext(institutionId: number): Promise<string | null> {
  const [inst, fees, financials, revenueTrend, peerRanking, evidence] = await Promise.all([
    getInstitutionById(institutionId),
    getFeesByInstitution(institutionId).catch(() => []),
    getFinancialsByInstitution(institutionId).catch(() => []),
    getInstitutionRevenueTrend(institutionId).catch(() => []),
    getInstitutionPeerRanking(institutionId).catch(() => null),
    getInstitutionFeeScheduleEvidence(institutionId).catch(() => null),
  ]);

  if (!inst) return null;

  const visibleFees = fees.filter((fee) => fee.review_status !== "rejected");
  const verifiedFees = visibleFees.filter((fee) => fee.review_status === "approved");
  const provisionalFees = visibleFees.filter((fee) => fee.review_status !== "approved");
  const feeRows = [...verifiedFees.slice(0, 12), ...provisionalFees.slice(0, 12)].map((fee) => ({
    name: fee.fee_name,
    category: fee.fee_category ?? null,
    amount: fee.amount,
    frequency: fee.frequency,
    conditions: fee.conditions,
    status: fee.review_status === "approved" ? "verified" : "provisional",
    confidence: fee.extraction_confidence,
  }));
  const pipelineFeeRows =
    feeRows.length === 0 && evidence
      ? [
          ...evidence.verified_fee_preview
            .filter((fee) => fee.review_status !== "rejected")
            .map((fee) => ({
              name: fee.fee_name,
              category: fee.canonical_fee_key,
              amount: fee.amount,
              frequency: fee.frequency,
              conditions: null,
              status: "provisional",
              confidence: fee.extraction_confidence,
              pipeline_stage: "verified_unpublished",
            })),
          ...evidence.raw_fee_preview.map((fee) => ({
            name: fee.fee_name,
            category: null,
            amount: fee.amount,
            frequency: fee.frequency,
            conditions: fee.conditions,
            status: "provisional",
            confidence: fee.extraction_confidence,
            pipeline_stage: "raw_unverified",
          })),
        ].slice(0, 18)
      : [];
  const latestFinancial = financials[0] ?? null;
  const status = inst.fee_publication_status ?? "unavailable";

  return `\n\nSELECTED INSTITUTION CONTEXT FROM URL (treat this as the active institution; do not ask the user to identify it again):
- Institution ID: ${inst.id}
- Name: ${inst.institution_name}
- Location: ${[inst.city, inst.state_code].filter(Boolean).join(", ") || "unknown"}
- Charter: ${inst.charter_type ?? "unknown"}
- Asset tier: ${inst.asset_size_tier ?? "unknown"}; assets: ${inst.asset_size ?? "unknown"}
- Fed district: ${inst.fed_district ?? "unknown"}
- Public fee publication status: ${getFeePublicationStatusLabel(status)} (${status})
- Verified fee count: ${inst.published_fee_count ?? 0}
- Provisional fee count: ${inst.provisional_fee_count ?? 0}
- Quality label: ${inst.quality_label ?? "unknown"}
- Quality signals: ${(inst.quality_signals ?? []).map((signal) => `${signal.code}: ${signal.label}`).join("; ") || "none"}
- Latest source status: ${inst.latest_source_status ?? "unknown"}; collected at: ${inst.latest_source_collected_at ?? "unknown"}
- Visible fee rows sample: ${JSON.stringify(feeRows.length > 0 ? feeRows : pipelineFeeRows)}
- Latest financial record: ${latestFinancial ? JSON.stringify({
    report_date: latestFinancial.report_date,
    source: latestFinancial.source,
    total_assets: latestFinancial.total_assets,
    total_deposits: latestFinancial.total_deposits,
    service_charge_income: latestFinancial.service_charge_income,
    total_revenue: latestFinancial.total_revenue,
    fee_income_ratio: latestFinancial.fee_income_ratio,
    roa: latestFinancial.roa,
    branch_count: latestFinancial.branch_count,
  }) : "none"}
- Revenue trend: ${JSON.stringify(revenueTrend.slice(0, 8))}
- Peer ranking: ${peerRanking ? JSON.stringify(peerRanking) : "none"}

Analysis rules for this selected institution:
- Separate verified evidence from provisional evidence.
- Do not use provisional fee rows in verified benchmark or score conclusions unless explicitly labeled as provisional/directional.
- When data quality is weak, state the gap and give concrete diligence steps instead of filling in generic analysis.
- Prefer investor-grade, consulting-grade synthesis: implications, peer positioning, risks, data caveats, and next decisions.\n`;
}

export async function POST(request: Request) {
  // Check API key
  if (!hasAnthropicApiKey()) {
    return Response.json(
      { error: MISSING_ANTHROPIC_API_KEY_MESSAGE },
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
  let mode: string | undefined;
  let analysisFocus: string | undefined;
  let institutionId: number | null = null;
  let intent: string | null = null;
  let evidencePolicy: string | null = null;
  // Opt-in citation-density gate. Default false preserves the streaming chat
  // UX (useChat); callers that need a vetted report (report runner, export)
  // set `gate_citations: true` and receive a buffered JSON response that can
  // be `{ status: "ok" }` or `{ status: "refused", reason: "insufficient_citations" }`.
  let gateCitations = false;
  try {
    const body = await request.json();
    messages = body.messages;
    mode = body.mode;
    analysisFocus = body.analysisFocus;
    intent = typeof body.intent === "string" ? body.intent : null;
    evidencePolicy =
      typeof body.evidencePolicy === "string" ? body.evidencePolicy : null;
    gateCitations = body.gate_citations === true;
    if (body.institutionId !== undefined && body.institutionId !== null) {
      const parsed = Number(body.institutionId);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        return Response.json({ error: "Invalid institutionId" }, { status: 400 });
      }
      institutionId = parsed;
    }
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

  if (institutionId !== null) {
    const selectedInstitutionContext = await buildSelectedInstitutionContext(institutionId);
    if (!selectedInstitutionContext) {
      return Response.json({ error: "Institution not found" }, { status: 404 });
    }
    systemPrompt += selectedInstitutionContext;
    systemPrompt += `\nURL-SEEDED WORKFLOW:
- Intent: ${intent ?? "analyze"}
- Evidence policy: ${evidencePolicy ?? "provisional-first"}
- If evidence is empty, answer with an insufficient-evidence diligence path. Do not produce a generic competitive brief, pricing recommendation, or false benchmark conclusion.\n`;
  }

  // Inject the authenticated user's institution context so Hamilton doesn't
  // ask "what's your institution?" for every analysis (the screenshot showed
  // the user as Space Coast FCU in the left rail but Hamilton requesting
  // identification in the response). Only injected when we actually have it
  // — for anonymous/public users this block is omitted, preserving the
  // model's current generic-mode behavior.
  if (user && (user.institution_name || user.display_name)) {
    const inst = user.institution_name?.trim() || user.display_name;
    const tier = user.asset_tier ? ` (asset tier ${user.asset_tier})` : "";
    const charter = user.institution_type ? `, ${user.institution_type.replace(/_/g, " ")}` : "";
    const district = user.fed_district ? `, Fed district ${user.fed_district}` : "";
    const state = user.state_code ? `, ${user.state_code}` : "";
    systemPrompt += `\n\nUSER INSTITUTION CONTEXT (do not ask the user to identify themselves — already known):
- Institution: ${inst}${charter}${tier}${district}${state}
- Use this institution as the implicit subject of any benchmarking, peer comparison, or positioning analysis unless the user names a different one.\n`;
  }

  // Analyze mode: override output structure with structured analysis sections (ARCH-05)
  // VALID_FOCUS guards against prompt injection — only known tab values reach the system prompt.
  if (mode === "analyze") {
    const VALID_FOCUS = new Set(["Pricing", "Risk", "Peer Position", "Trend"]);
    const focus = VALID_FOCUS.has(analysisFocus ?? "") ? (analysisFocus as string) : "Pricing";
    systemPrompt += buildAnalyzeModeSuffix(focus);
  }

  // Monitor mode: concise surveillance-oriented responses (Phase 46)
  if (mode === "monitor") {
    systemPrompt += buildMonitorModeSuffix();
  }

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

  const providerContext = {
    provider: "anthropic" as const,
    model: agent.model,
    agent: "hamilton",
    operation: gateCitations ? "research_with_citation_gate" : "research_stream",
  };
  let providerStartedAt: number | null = null;
  let providerFailed = false;

  try {
    // Buffered (gated) path: for report-generation callers. Trades off
    // streaming UX for a deterministic post-generation citation check. If
    // the gate refuses, we return the structured empty-state shape instead
    // of a partial report. Tokens are still logged via logUsage so cost
    // attribution is unchanged.
    if (gateCitations) {
      const result = await trackAnthropicRequest(
        providerContext,
        async () => generateText({
          model: getAnthropicLanguageModel(agent.model),
          system: systemPrompt,
          messages: await convertToModelMessages(messages),
          tools: agent.tools,
          maxOutputTokens: agent.maxTokens,
          stopWhen: stepCountIs(agent.maxSteps),
        }),
      );

      const inputTokens = result.usage?.inputTokens ?? 0;
      const outputTokens = result.usage?.outputTokens ?? 0;
      const costCents = estimateCostCents(agent.model, inputTokens, outputTokens);
      try {
        await logUsage(
          user?.id ?? null,
          user ? null : ip,
          "hamilton",
          inputTokens,
          outputTokens,
          costCents,
        );
      } catch {
        // Non-critical — don't fail the response
      }

      const gate = evaluateCitationDensity(result.text ?? "");
      if (gate.status === "refused") {
        return Response.json(
          {
            status: "refused",
            reason: gate.reason,
            metrics: gate.metrics,
            suggestion: gate.suggestion,
            claims_without_citations: gate.claims_without_citations,
          },
          { status: 200 },
        );
      }

      return Response.json({
        status: "ok",
        text: result.text,
        metrics: gate.metrics,
      });
    }

    providerStartedAt = await guardProviderCall(providerContext);
    const result = streamText({
      model: getAnthropicLanguageModel(agent.model),
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
          if (!providerFailed && providerStartedAt !== null) {
            await recordProviderUsage(
              providerContext,
              "completed",
              { inputTokens, outputTokens },
              { latencyMs: Date.now() - providerStartedAt },
            );
          }
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
      onError: async ({ error }) => {
        providerFailed = true;
        await recordProviderUsage(providerContext, "failed", {}, {
          latencyMs: providerStartedAt === null ? undefined : Date.now() - providerStartedAt,
          error: error instanceof Error ? error.message : String(error),
        });
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "An unexpected error occurred";

    if (providerStartedAt !== null && !providerFailed) {
      providerFailed = true;
      await recordProviderUsage(providerContext, "failed", {}, {
        latencyMs: Date.now() - providerStartedAt,
        error: message,
      });
    }

    if (err instanceof ProviderCircuitOpenError || message.includes("Emergency stop")) {
      return Response.json({ error: message }, { status: 423 });
    }

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

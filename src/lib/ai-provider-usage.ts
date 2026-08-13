import { sql } from "./crawler-db/connection";
import {
  assertAutomationEnabled,
  EmergencyStopActiveError,
  engageEmergencyStop,
} from "./automation-control";

type ProviderStatus = "completed" | "failed" | "blocked";

export interface ProviderUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
}

export interface ProviderCallContext {
  provider: "anthropic" | string;
  model: string;
  agent: string;
  operation: string;
  agentRunId?: number;
  requestCount?: number;
  metadata?: Record<string, unknown>;
}

interface AnthropicUsageShape {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
}

const ANTHROPIC_RATES_MICROUSD_PER_TOKEN = [
  { match: "haiku", input: 0.8, output: 4 },
  { match: "sonnet", input: 3, output: 15 },
  { match: "opus", input: 15, output: 75 },
] as const;

const PROVIDER_CREDIT_ERROR_MARKERS = [
  "credit balance is too low",
  "insufficient credits",
  "purchase credits",
  "plans & billing",
] as const;

function nonNegative(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
}

function normalizeUsage(usage: AnthropicUsageShape | null | undefined): ProviderUsage {
  return {
    inputTokens: nonNegative(usage?.input_tokens ?? usage?.inputTokens),
    outputTokens: nonNegative(usage?.output_tokens ?? usage?.outputTokens),
    cacheReadInputTokens: nonNegative(usage?.cache_read_input_tokens),
    cacheCreationInputTokens: nonNegative(usage?.cache_creation_input_tokens),
  };
}

function providerErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isProviderCreditError(error: unknown): boolean {
  const message = providerErrorMessage(error).toLowerCase();
  return PROVIDER_CREDIT_ERROR_MARKERS.some((marker) => message.includes(marker));
}

async function engageProviderCreditStop(context: ProviderCallContext): Promise<void> {
  try {
    await engageEmergencyStop(
      "provider-guard",
      `Anthropic API credit balance is too low; automation paused after ${context.agent} ${context.operation}`,
    );
  } catch (stopError) {
    console.error("Failed to engage emergency stop after provider credit error", stopError);
  }
}

async function maybeEngageProviderCreditStop(
  context: ProviderCallContext,
  status: ProviderStatus,
  error: string | undefined,
): Promise<void> {
  if (status !== "failed") return;
  if (context.provider !== "anthropic") return;
  if (!error || !isProviderCreditError(error)) return;
  await engageProviderCreditStop(context);
}

export function estimateAnthropicCostMicrousd(
  model: string,
  usage: ProviderUsage,
): number | null {
  const rate = ANTHROPIC_RATES_MICROUSD_PER_TOKEN.find((candidate) =>
    model.toLowerCase().includes(candidate.match),
  );
  if (!rate) return null;
  const input = nonNegative(usage.inputTokens);
  const output = nonNegative(usage.outputTokens);
  const cacheRead = nonNegative(usage.cacheReadInputTokens);
  const cacheCreate = nonNegative(usage.cacheCreationInputTokens);
  return Math.round(
    (input * rate.input)
    + (output * rate.output)
    + (cacheRead * rate.input * 0.1)
    + (cacheCreate * rate.input * 1.25),
  );
}

export async function recordProviderUsage(
  context: ProviderCallContext,
  status: ProviderStatus,
  usage: ProviderUsage = {},
  options: { latencyMs?: number; error?: string } = {},
): Promise<void> {
  const estimatedCost = context.provider === "anthropic"
    ? estimateAnthropicCostMicrousd(context.model, usage)
    : null;
  try {
    await sql`
      INSERT INTO ai_api_usage_events
        (provider, model, agent_name, operation, status, request_count,
         input_tokens, output_tokens, cache_read_input_tokens,
         cache_creation_input_tokens, estimated_cost_microusd, latency_ms,
         agent_run_id, error_summary, metadata)
      VALUES
        (${context.provider}, ${context.model}, ${context.agent}, ${context.operation},
         ${status}, ${context.requestCount ?? 1}, ${nonNegative(usage.inputTokens)},
         ${nonNegative(usage.outputTokens)}, ${nonNegative(usage.cacheReadInputTokens)},
         ${nonNegative(usage.cacheCreationInputTokens)}, ${estimatedCost},
         ${options.latencyMs ?? null}, ${context.agentRunId ?? null},
         ${options.error?.slice(0, 1000) ?? null},
         ${JSON.stringify(context.metadata ?? {})})
    `;
  } catch (error) {
    console.error("AI provider usage write failed", error);
  }
  await maybeEngageProviderCreditStop(context, status, options.error);
}

export async function guardProviderCall(
  context: ProviderCallContext,
): Promise<number> {
  const startedAt = Date.now();
  try {
    await assertAutomationEnabled(`${context.agent} ${context.operation}`);
    return startedAt;
  } catch (error) {
    if (error instanceof EmergencyStopActiveError) {
      await recordProviderUsage(context, "blocked", {}, { error: error.message });
    }
    throw error;
  }
}

export async function trackAnthropicRequest<T>(
  context: Omit<ProviderCallContext, "provider">,
  request: () => PromiseLike<T>,
): Promise<T> {
  const fullContext: ProviderCallContext = { ...context, provider: "anthropic" };
  const startedAt = Date.now();
  try {
    await assertAutomationEnabled(`${context.agent} ${context.operation}`);
  } catch (error) {
    if (error instanceof EmergencyStopActiveError) {
      await recordProviderUsage(fullContext, "blocked", {}, { error: error.message });
    }
    throw error;
  }

  try {
    const response = await request();
    const usage = (response as { usage?: AnthropicUsageShape }).usage;
    await recordProviderUsage(
      fullContext,
      "completed",
      normalizeUsage(usage),
      { latencyMs: Date.now() - startedAt },
    );
    return response;
  } catch (error) {
    const message = providerErrorMessage(error);
    await recordProviderUsage(fullContext, "failed", {}, {
      latencyMs: Date.now() - startedAt,
      error: message,
    });
    throw error;
  }
}

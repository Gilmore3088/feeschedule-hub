/**
 * LLM helper for the classify stage — a faithful TypeScript port of Darwin's
 * batch classifier (claude-haiku-4-5, forced tool_use, canonical-key taxonomy).
 */

import Anthropic from "@anthropic-ai/sdk";
import { CANONICAL_FEE_KEYS } from "./taxonomy";

export const CLASSIFY_MODEL = "claude-haiku-4-5-20251001";
// Stronger model used to adjudicate names the cheap model wasn't confident about.
export const ESCALATION_MODEL = "claude-sonnet-4-5-20250929";

// USD per 1M tokens [input, output]. Mirrors Darwin's pricing table.
const PRICING: Record<string, [number, number]> = {
  "claude-haiku-4-5-20251001": [0.8, 4.0],
  "claude-sonnet-4-5-20250929": [3.0, 15.0],
};

export function estimateCostCents(model: string, inTok: number, outTok: number): number {
  const [inP, outP] = PRICING[model] ?? [3.0, 15.0];
  return Math.round(((inTok / 1_000_000) * inP + (outTok / 1_000_000) * outP) * 100);
}

export interface Classification {
  fee_name: string;
  canonical_fee_key: string | null;
  confidence: number;
}

// Darwin classifies 50 names per LLM call; larger batches truncate the output.
const LLM_BATCH_SIZE = 50;

const SYSTEM_PROMPT =
  "You are a bank fee taxonomy specialist. For each fee name, identify the canonical " +
  "fee category from the approved taxonomy. Only use canonical keys from the provided list. " +
  "If a fee does not match any canonical category, respond with null and confidence 0.0. " +
  "Never infer NSF from overdraft or vice versa — they are distinct regulatory categories.";

let _client: Anthropic | null = null;
export function getAnthropic(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

/**
 * Classify a batch of (already normalized) fee names. Forces the model through a
 * tool schema so the output is structured. Returns the raw classifications plus
 * the estimated cost; validation/promotion is the caller's job.
 */
/**
 * Classify fee names, chunking into LLM_BATCH_SIZE calls so large drains don't
 * truncate the model output. Aggregates results + cost across chunks.
 */
export async function classifyFeeNames(
  names: string[],
  model: string = CLASSIFY_MODEL,
): Promise<{ results: Classification[]; costCents: number }> {
  const results: Classification[] = [];
  let costCents = 0;
  for (let i = 0; i < names.length; i += LLM_BATCH_SIZE) {
    const chunk = await classifyChunk(names.slice(i, i + LLM_BATCH_SIZE), model);
    results.push(...chunk.results);
    costCents += chunk.costCents;
  }
  return { results, costCents };
}

async function classifyChunk(
  names: string[],
  model: string,
): Promise<{ results: Classification[]; costCents: number }> {
  if (names.length === 0) return { results: [], costCents: 0 };

  const userPrompt =
    "Classify each of the following bank fee names using only keys from the approved taxonomy.\n\n" +
    `Approved canonical keys:\n${CANONICAL_FEE_KEYS.join(", ")}\n\n` +
    `Fee names to classify:\n${names.map((n) => `- ${n}`).join("\n")}`;

  const resp = await getAnthropic().messages.create({
    model,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    tools: [
      {
        name: "classify_fees",
        description:
          "Return classification results for each fee name provided. Use only " +
          "canonical_fee_key values from the approved taxonomy list. Set " +
          "canonical_fee_key to null and confidence to 0.0 if no match found.",
        input_schema: {
          type: "object",
          properties: {
            classifications: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  fee_name: { type: "string" },
                  canonical_fee_key: { type: ["string", "null"] },
                  confidence: { type: "number", minimum: 0, maximum: 1 },
                },
                required: ["fee_name", "canonical_fee_key", "confidence"],
              },
            },
          },
          required: ["classifications"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "classify_fees" },
    messages: [{ role: "user", content: userPrompt }],
  });

  const toolUse = resp.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );
  const results = toolUse
    ? ((toolUse.input as { classifications?: Classification[] }).classifications ?? [])
    : [];
  const costCents = estimateCostCents(model, resp.usage.input_tokens, resp.usage.output_tokens);
  return { results, costCents };
}

/**
 * Fee extraction LLM for the extract stage. Pulls every explicitly-listed fee
 * out of a fee-schedule page's text. Mirrors the pipeline's extraction
 * discipline: extract only what is written; never infer (NSF and overdraft are
 * distinct and must not be cross-inferred).
 */

import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropic, estimateCostCents, CLASSIFY_MODEL } from "./llm";

export interface ExtractedFee {
  fee_name: string;
  amount: number | null;
  frequency: string | null;
}

const SYSTEM_PROMPT =
  "You are a bank fee schedule extraction specialist. Extract every fee that is " +
  "explicitly listed in the provided text. Do not infer fees that are not written. " +
  "NSF and overdraft are distinct regulatory categories — never infer one from the " +
  "other. Capture the exact fee name, the dollar amount if stated (otherwise null), " +
  "and the frequency/period if stated (e.g. monthly, per item, per occurrence).";

export async function extractFeesFromText(
  pageText: string,
  institutionName?: string,
): Promise<{ fees: ExtractedFee[]; costCents: number }> {
  const trimmed = pageText.trim();
  if (trimmed.length === 0) return { fees: [], costCents: 0 };

  const userPrompt =
    (institutionName ? `Institution: ${institutionName}\n\n` : "") +
    "Extract all explicitly listed fees from this fee-schedule text:\n\n" +
    trimmed.slice(0, 24_000);

  const resp = await getAnthropic().messages.create({
    model: CLASSIFY_MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    tools: [
      {
        name: "record_fees",
        description: "Record every fee explicitly listed in the fee schedule text.",
        input_schema: {
          type: "object",
          properties: {
            fees: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  fee_name: { type: "string" },
                  amount: { type: ["number", "null"] },
                  frequency: { type: ["string", "null"] },
                },
                required: ["fee_name", "amount", "frequency"],
              },
            },
          },
          required: ["fees"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "record_fees" },
    messages: [{ role: "user", content: userPrompt }],
  });

  const toolUse = resp.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );
  const fees = toolUse ? ((toolUse.input as { fees?: ExtractedFee[] }).fees ?? []) : [];
  const costCents = estimateCostCents(CLASSIFY_MODEL, resp.usage.input_tokens, resp.usage.output_tokens);
  return { fees: sanitize(fees), costCents };
}

function sanitize(fees: ExtractedFee[]): ExtractedFee[] {
  return fees
    .filter((f) => typeof f.fee_name === "string" && f.fee_name.trim().length > 0)
    .map((f) => ({
      fee_name: f.fee_name.trim().slice(0, 300),
      amount: typeof f.amount === "number" && Number.isFinite(f.amount) ? f.amount : null,
      frequency: typeof f.frequency === "string" ? f.frequency.trim().slice(0, 100) : null,
    }));
}

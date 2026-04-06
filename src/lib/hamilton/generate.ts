/**
 * Hamilton AI Analyst — Section Generator
 * Calls Claude with strict data grounding and voice enforcement.
 */

import Anthropic from "@anthropic-ai/sdk";
import { HAMILTON_VOICE } from "./voice";
import type { SectionInput, SectionOutput } from "./types";

const MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 1500;
const REQUEST_TIMEOUT_MS = 60_000;

function buildUserMessage(input: SectionInput): string {
  const lines: string[] = [];

  lines.push(`SECTION TYPE: ${input.type}`);
  lines.push(`SECTION TITLE: ${input.title}`);

  if (input.context) {
    lines.push(`\nCONTEXT:\n${input.context}`);
  }

  lines.push("\nDATA (use only these figures — do not invent, estimate, or extrapolate any statistic not present below):");
  lines.push("```json");
  lines.push(JSON.stringify(input.data, null, 2));
  lines.push("```");

  lines.push("\nWrite the Hamilton narrative section now. Begin directly with the analysis — no preamble, no title repetition.");

  return lines.join("\n");
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter((w) => w.length > 0).length;
}

/**
 * Generate a single Hamilton narrative section grounded in source data.
 *
 * @param input - Section type, title, and source data
 * @returns Structured section output with usage metrics
 * @throws Error if API key is missing or the Claude API call fails
 */
export async function generateSection(input: SectionInput): Promise<SectionOutput> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set — Hamilton cannot generate sections without API access");
  }

  const client = new Anthropic({ apiKey });

  const userMessage = buildUserMessage(input);

  let response: Anthropic.Message;
  try {
    response = await client.messages.create(
      {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: HAMILTON_VOICE.systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      },
      { timeout: REQUEST_TIMEOUT_MS }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Hamilton section generation failed [type=${input.type}]: ${message}`);
  }

  const narrative = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  if (!narrative) {
    throw new Error(`Hamilton returned empty response for section type '${input.type}'`);
  }

  return {
    narrative,
    wordCount: countWords(narrative),
    model: MODEL,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  };
}

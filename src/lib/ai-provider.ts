import Anthropic from "@anthropic-ai/sdk";
import { anthropic as createAnthropicLanguageModel } from "@ai-sdk/anthropic";

export const MISSING_ANTHROPIC_API_KEY_MESSAGE =
  "AI service not configured. Set ANTHROPIC_API_KEY.";

export function hasAnthropicApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

export function assertAnthropicApiKey(context = "Anthropic provider"): string {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(`${context}: ${MISSING_ANTHROPIC_API_KEY_MESSAGE}`);
  }
  return apiKey;
}

export function getAnthropicMessagesClient(context?: string): Anthropic {
  return new Anthropic({ apiKey: assertAnthropicApiKey(context) });
}

export function getAnthropicLanguageModel(model: string) {
  return createAnthropicLanguageModel(model);
}

type AnthropicTextBlock = {
  type: "text";
  text: string;
};

function isAnthropicTextBlock(block: unknown): block is AnthropicTextBlock {
  return (
    typeof block === "object" &&
    block !== null &&
    (block as { type?: unknown }).type === "text" &&
    typeof (block as { text?: unknown }).text === "string"
  );
}

export function extractAnthropicText(response: { content?: unknown }): string {
  if (!Array.isArray(response.content)) {
    return "";
  }

  return response.content
    .filter(isAnthropicTextBlock)
    .map((block) => block.text)
    .join("");
}

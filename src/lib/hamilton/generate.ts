/**
 * Hamilton AI Analyst — Section Generator
 * Calls Claude with strict data grounding and voice enforcement.
 */

import Anthropic from "@anthropic-ai/sdk";
import { HAMILTON_VOICE } from "./voice";
import type { SectionInput, SectionOutput, ThesisInput, ThesisOutput } from "./types";

const MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 1500;
const REQUEST_TIMEOUT_MS = 60_000;
const THESIS_TIMEOUT_MS = 90_000;

/**
 * Format the optional context field for injection into the user message.
 * V3: No hard word limit enforced here — budget is set by voice prompt (150-200 words).
 */
function formatContext(input: SectionInput): string {
  return input.context ?? '';
}

function buildUserMessage(input: SectionInput): string {
  const lines: string[] = [];

  lines.push(`SECTION TYPE: ${input.type}`);
  lines.push(`SECTION TITLE: ${input.title}`);

  const context = formatContext(input);
  if (context) {
    lines.push(`\nCONTEXT:\n${context}`);
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

// ─── Global Thesis Generator (Phase 33, D-01) ─────────────────────────────────

function buildThesisPrompt(input: ThesisInput): string {
  const isQuarterly = input.scope === 'quarterly';

  const tensionCount = isQuarterly ? '3-5' : '1-2';
  const extraFields = isQuarterly
    ? `  "contrarian_insight": "<one non-obvious finding the reader does not expect>",\n`
    : '';

  const revenueLine = input.data.revenue_snapshot
    ? `REVENUE DATA (this leads):
Total service charges: $${input.data.revenue_snapshot.total_service_charges.toLocaleString()} (${input.data.revenue_snapshot.latest_quarter})
YoY change: ${input.data.revenue_snapshot.yoy_change_pct !== null ? `${input.data.revenue_snapshot.yoy_change_pct.toFixed(1)}%` : 'unavailable'}
Banks: $${input.data.revenue_snapshot.bank_service_charges.toLocaleString()} | Credit unions: $${input.data.revenue_snapshot.cu_service_charges.toLocaleString()}

`
    : '';

  const derivedLine =
    input.data.derived_tensions.length > 0
      ? `DATA TENSIONS (pre-computed from analytics):
${input.data.derived_tensions.map((t) => `- ${t}`).join('\n')}

`
      : '';

  const macroLine = input.data.fred_snapshot
    ? `MACRO CONTEXT:
Fed funds rate: ${input.data.fred_snapshot.fed_funds_rate ?? 'N/A'}% | Unemployment: ${input.data.fred_snapshot.unemployment_rate ?? 'N/A'}% | CPI YoY: ${input.data.fred_snapshot.cpi_yoy_pct ?? 'N/A'}%

`
    : '';

  const beigeLine =
    input.data.beige_book_themes.length > 0
      ? `BEIGE BOOK THEMES (${input.data.beige_book_themes.length} districts):
${input.data.beige_book_themes.slice(0, 3).map((t, i) => `District ${i + 1}: ${t.slice(0, 200)}`).join('\n')}

`
      : '';

  return `THESIS GENERATION REQUEST
SCOPE: ${input.scope}
QUARTER: ${input.data.quarter}
INSTITUTIONS COVERED: ${input.data.total_institutions.toLocaleString()}

REASONING INSTRUCTION:
Think through 5-8 sentences internally about the data. Then output only the 2-3 most decisive insights for each JSON field. The reader sees your conclusions, not your reasoning process.

TENSION INSTRUCTION:
Frame every key insight as a tension between two competing forces. Write "Pricing converges while revenue diverges" not "Fees are clustered and revenue is declining." Pattern: [force A] while [force B] — [implication].

${revenueLine}TOP FEE CATEGORIES (by institution coverage):
\`\`\`json
${JSON.stringify(input.data.top_categories, null, 2)}
\`\`\`

${derivedLine}${macroLine}${beigeLine}OUTPUT: Return ONLY valid JSON. No markdown. No preamble. No trailing text. The JSON must match this shape exactly:
{
  "core_thesis": "<1-2 sentences: the single most important strategic finding this quarter>",
  "tensions": [
    {
      "force_a": "<competing force>",
      "force_b": "<opposing force>",
      "implication": "<what this opposition means for bank strategy>"
    }
  ],  // ${tensionCount} tensions required
  "revenue_model": "<2-3 sentences on revenue dynamics — if revenue data exists, lead with specific figures>",
  "competitive_dynamic": "<2-3 sentences on bank vs credit union or tier-based competitive dynamics>",
${extraFields}  "narrative_summary": "<exactly 150 words, flowing prose, injected into report sections as shared context — frame as a thesis statement a bank executive would read before each section>"
}`;
}

/**
 * Generate the global thesis for a report.
 * Called once before section generation; result is injected into every section's context.
 *
 * Per D-01: receives condensed ThesisSummaryPayload, not the full assembler payload.
 * Per D-05: MAX_TOKENS = 1500, think-then-compress reasoning.
 * Per D-08: scope parameter adapts prompt depth (quarterly = full, others = lighter).
 */
export async function generateGlobalThesis(input: ThesisInput): Promise<ThesisOutput> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set — Hamilton cannot generate thesis without API access');
  }

  const client = new Anthropic({ apiKey });
  const userMessage = buildThesisPrompt(input);

  let response: Anthropic.Message;
  try {
    response = await client.messages.create(
      {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: HAMILTON_VOICE.systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      },
      { timeout: THESIS_TIMEOUT_MS },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Hamilton thesis generation failed [scope=${input.scope}]: ${message}`);
  }

  const raw = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  if (!raw) {
    throw new Error(`Hamilton returned empty thesis response [scope=${input.scope}]`);
  }

  let parsed: Omit<ThesisOutput, 'model' | 'usage'>;
  try {
    parsed = JSON.parse(raw) as Omit<ThesisOutput, 'model' | 'usage'>;
  } catch {
    throw new Error(
      `Hamilton thesis generation returned unparseable JSON [scope=${input.scope}]: ${raw.slice(0, 200)}`,
    );
  }

  // Lighter scopes do not request contrarian_insight — set to null if absent
  const contrarian_insight = parsed.contrarian_insight ?? null;

  return {
    core_thesis: parsed.core_thesis,
    tensions: parsed.tensions ?? [],
    revenue_model: parsed.revenue_model,
    competitive_dynamic: parsed.competitive_dynamic,
    contrarian_insight,
    narrative_summary: parsed.narrative_summary,
    model: MODEL,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  };
}

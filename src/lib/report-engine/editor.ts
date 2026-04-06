/**
 * Editor Review Module — Second Claude pass on Hamilton drafts.
 *
 * The editor is a critic, not a writer (per D-12).
 * It uses a distinct system prompt and a cheap haiku model.
 * Flagged sections with severity 'major' block the job from reaching 'complete'.
 *
 * Threat T-13-08: JSON parse failure defaults to approved=false (fail-safe).
 */

import Anthropic from "@anthropic-ai/sdk";
import { HAMILTON_RULES, HAMILTON_FORBIDDEN } from "../hamilton/voice";
import type { SectionType, ValidatedSection } from "../hamilton/types";

// Cost-efficient pattern-matching model (not the expensive Hamilton writer model — per plan)
const EDITOR_MODEL = "claude-haiku-4-20250514";
const MAX_TOKENS = 1000;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FlaggedSection {
  sectionType: SectionType;
  reason: string;
  severity: "minor" | "major";
}

export interface EditorReviewResult {
  /** False if any flaggedSection has severity='major', or if Claude response is unparseable. */
  approved: boolean;
  flaggedSections: FlaggedSection[];
  /** One-sentence overall assessment from the editor. */
  reviewNote: string;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

// ─── System Prompt ─────────────────────────────────────────────────────────────

const RULES_LIST = HAMILTON_RULES.map((rule, i) => `${i + 1}. ${rule}`).join("\n");
const FORBIDDEN_LIST = HAMILTON_FORBIDDEN.map((term) => `- "${term}"`).join("\n");

const EDITOR_SYSTEM_PROMPT = `You are the editorial director at Bank Fee Index. Your job is to review AI-generated research sections before publication to bank executives.

Review each section for:
1. Unsupported claims — any statistic in the narrative not present in the source data
2. Voice drift — phrases that violate Hamilton's style rules (listed below)
3. Forbidden phrases — any use of prohibited language

Hamilton style rules:
${RULES_LIST}

Forbidden phrases:
${FORBIDDEN_LIST}

Respond ONLY with valid JSON matching this schema:
{
  "flaggedSections": [
    {
      "sectionType": "<section type string>",
      "reason": "<specific problem>",
      "severity": "minor" | "major"
    }
  ],
  "reviewNote": "<one sentence overall assessment>"
}

major = unsupported statistics or claims. minor = style/voice issues.
If no issues found, return {"flaggedSections": [], "reviewNote": "All sections approved."}.`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildUserMessage(sections: ValidatedSection[]): string {
  const lines: string[] = [
    `Review the following ${sections.length} Hamilton narrative section(s) for publication quality:\n`,
  ];

  sections.forEach((section, index) => {
    lines.push(`--- SECTION ${index + 1} ---`);
    lines.push(`Type: ${section.input.type}`);
    lines.push(`Title: ${section.input.title}`);
    lines.push(`Narrative:\n${section.narrative}`);
    lines.push(`Source data available: ${JSON.stringify(section.input.data)}`);
    lines.push("");
  });

  return lines.join("\n");
}

function parseSafely(text: string): { flaggedSections: FlaggedSection[]; reviewNote: string } | null {
  try {
    const parsed = JSON.parse(text) as { flaggedSections: FlaggedSection[]; reviewNote: string };
    if (!Array.isArray(parsed.flaggedSections) || typeof parsed.reviewNote !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

// ─── Main Function ─────────────────────────────────────────────────────────────

/**
 * Run the editorial review pass on a set of Hamilton-generated sections.
 *
 * Returns approved=false if:
 *   - Any flagged section has severity='major' (unsupported claim)
 *   - The Claude response cannot be parsed as valid JSON (T-13-08 fail-safe)
 */
export async function runEditorReview(
  sections: ValidatedSection[]
): Promise<EditorReviewResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set — editor review requires API access");
  }

  const client = new Anthropic({ apiKey });

  const userMessage = buildUserMessage(sections);

  const response = await client.messages.create({
    model: EDITOR_MODEL,
    max_tokens: MAX_TOKENS,
    system: EDITOR_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const rawText = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  // T-13-08: JSON parse failure → fail-safe approved=false
  const parsed = parseSafely(rawText);
  if (!parsed) {
    return {
      approved: false,
      flaggedSections: [
        {
          sectionType: "overview" as SectionType,
          reason: "Editor response unparseable — review manually before publishing",
          severity: "major",
        },
      ],
      reviewNote: "Editor response could not be parsed as valid JSON.",
      model: EDITOR_MODEL,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }

  const hasMajorFlag = parsed.flaggedSections.some((f) => f.severity === "major");

  return {
    approved: !hasMajorFlag,
    flaggedSections: parsed.flaggedSections,
    reviewNote: parsed.reviewNote,
    model: EDITOR_MODEL,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  };
}

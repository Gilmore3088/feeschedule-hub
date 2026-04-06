/**
 * Editor review module tests — second Claude pass on Hamilton drafts.
 * Uses vi.mock to avoid real API calls.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ValidatedSection } from "../hamilton/types";

// mockCreate is defined at module scope so it can be configured in each test
const mockCreate = vi.fn();

// Mock Anthropic SDK — must be hoisted (vi.mock is hoisted by vitest)
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockCreate };
    },
  };
});

// Import after mock is set up
import { runEditorReview } from "./editor";

// Helper to build a minimal ValidatedSection
function makeSection(type: ValidatedSection["input"]["type"]): ValidatedSection {
  return {
    narrative: "National overdraft fees average $27.50, rising 3.2% year-over-year.",
    wordCount: 11,
    model: "claude-sonnet-4-20250514",
    usage: { inputTokens: 100, outputTokens: 50 },
    validation: {
      passed: true,
      inventedNumbers: [],
      checkedCount: 2,
      sourceValues: [27.5, 3.2],
    },
    input: {
      type,
      title: "Overdraft fees rise above national median",
      data: { median_amount: 27.5, yoy_pct: 3.2 },
    },
  };
}

describe("runEditorReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Restore ANTHROPIC_API_KEY for each test
    process.env.ANTHROPIC_API_KEY = "test-key";
  });

  it("returns approved=false when any flaggedSection has severity major", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            flaggedSections: [
              {
                sectionType: "overview",
                reason: "Statistic '$35.00 average' not present in source data",
                severity: "major",
              },
            ],
            reviewNote: "One unsupported statistic found in overview section.",
          }),
        },
      ],
      usage: { input_tokens: 200, output_tokens: 80 },
      model: "claude-haiku-4-20250514",
    });

    const sections: ValidatedSection[] = [makeSection("overview")];
    const result = await runEditorReview(sections);

    expect(result.approved).toBe(false);
    expect(result.flaggedSections).toHaveLength(1);
    expect(result.flaggedSections[0].severity).toBe("major");
    expect(result.reviewNote).toBe("One unsupported statistic found in overview section.");
  });

  it("returns approved=true when flaggedSections is empty", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            flaggedSections: [],
            reviewNote: "All sections approved.",
          }),
        },
      ],
      usage: { input_tokens: 150, output_tokens: 30 },
      model: "claude-haiku-4-20250514",
    });

    const sections: ValidatedSection[] = [makeSection("findings")];
    const result = await runEditorReview(sections);

    expect(result.approved).toBe(true);
    expect(result.flaggedSections).toHaveLength(0);
    expect(result.reviewNote).toBe("All sections approved.");
  });

  it("returns approved=true when all flags are minor severity", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            flaggedSections: [
              {
                sectionType: "trend_analysis",
                reason: "Phrase 'quite significant' detected (forbidden)",
                severity: "minor",
              },
              {
                sectionType: "recommendation",
                reason: "Section title states topic rather than conclusion",
                severity: "minor",
              },
            ],
            reviewNote: "Minor voice drift detected; no unsupported claims.",
          }),
        },
      ],
      usage: { input_tokens: 180, output_tokens: 60 },
      model: "claude-haiku-4-20250514",
    });

    const sections: ValidatedSection[] = [
      makeSection("trend_analysis"),
      makeSection("recommendation"),
    ];
    const result = await runEditorReview(sections);

    expect(result.approved).toBe(true);
    expect(result.flaggedSections).toHaveLength(2);
    expect(result.flaggedSections.every((f) => f.severity === "minor")).toBe(true);
    expect(result.reviewNote).toBe("Minor voice drift detected; no unsupported claims.");
  });
});

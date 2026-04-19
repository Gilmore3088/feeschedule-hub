/**
 * Tests for the Hamilton citation-density gate.
 */

import { describe, it, expect } from "vitest";
import {
  countCitations,
  countClaims,
  evaluateCitationDensity,
  isCitation,
  isClaim,
  splitIntoSentences,
} from "./citation-gate";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const WELL_CITED_REPORT = `## Overview
Per fees_published, the national median overdraft fee is $35 across 1,284 institutions.
JPMorgan Chase charges $34 for overdraft, aligning with the national median.
According to Call Reports, total service charge revenue fell 3.6% year over year.
The 75th percentile sits at $38 per fees_published, while the 25th percentile holds at $30.
FRED series FEDFUNDS shows a 5.3% federal funds rate as of the latest release.
Bank of America maintains a $35 overdraft fee, per the pipeline.
Fifth Third Bank reports a $37 NSF fee via fees_published.
Beige Book commentary cites tightening consumer credit in 6 of 12 districts.`;

const THIN_REPORT = `## Overview
Overdraft fees are very high across the industry.
Banks are charging around $35 on average.
Credit unions are charging less.
Fees have been rising for many years.
Consumers pay billions annually.
The largest banks charge the most.
Mid-tier banks are in between.
Small banks vary widely.
Many institutions have not changed their fees recently.
Revenue is declining overall.`;

const PROSE_ONLY_INTRO = `## Introduction
Overdraft pricing continues to shape bank profitability, and Hamilton has been tracking the category for the past year.
The industry remains in flux.

## Findings
Per fees_published, the median overdraft fee is $35 across 1,284 institutions.
Per fees_published, JPMorgan Chase charges $34 per overdraft.
According to Call Reports, service charge revenue declined 3.6% year over year.
Per fees_published, the 75th percentile holds at $38.
Per fees_published, Bank of America sits at $35 for overdraft.
Per fees_published, Fifth Third charges $37 for NSF.`;

// ─── splitIntoSentences ───────────────────────────────────────────────────────

describe("splitIntoSentences", () => {
  it("should_split_on_terminal_punctuation", () => {
    const result = splitIntoSentences("First sentence. Second sentence. Third one.");
    // The lede rule marks early sentences as exempt — test the split count here.
    expect(result).toHaveLength(3);
  });

  it("should_skip_code_fences", () => {
    const md = `Prose before.\n\n\`\`\`js\nconst x = 42;\n\`\`\`\n\nProse after.`;
    const result = splitIntoSentences(md);
    const text = result.map((s) => s.text).join(" ");
    expect(text).not.toContain("const x");
  });

  it("should_mark_introduction_sections_as_exempt", () => {
    const md = `## Introduction\nThe median fee is $35.\n\n## Findings\nThe median fee is $35.`;
    const result = splitIntoSentences(md);
    const introSentence = result.find((s) => s.text.includes("median"));
    expect(introSentence?.isExempt).toBe(true);
  });

  it("should_strip_list_markers", () => {
    const md = `- First point with $35 fee.\n- Second point with $40 fee.`;
    const result = splitIntoSentences(md);
    expect(result.map((s) => s.text)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("First point"),
        expect.stringContaining("Second point"),
      ]),
    );
    expect(result[0].text.startsWith("-")).toBe(false);
  });
});

// ─── isClaim ──────────────────────────────────────────────────────────────────

describe("isClaim", () => {
  it("should_detect_currency_claims", () => {
    expect(isClaim("The median fee is $35.")).toBe(true);
  });

  it("should_detect_percentage_claims", () => {
    expect(isClaim("Revenue fell 3.6% year over year.")).toBe(true);
  });

  it("should_detect_large_integer_claims", () => {
    expect(isClaim("The pipeline covers 1,284 institutions.")).toBe(true);
  });

  it("should_not_flag_qualitative_prose", () => {
    expect(isClaim("Hamilton monitors the landscape carefully.")).toBe(false);
  });

  it("should_flag_comparative_with_ranking_word", () => {
    expect(isClaim("The median fee is higher than the average across charters.")).toBe(true);
  });

  it("should_not_flag_standalone_comparative_without_numeric", () => {
    expect(isClaim("Fees are higher this quarter.")).toBe(false);
  });
});

// ─── isCitation ───────────────────────────────────────────────────────────────

describe("isCitation", () => {
  it("should_detect_markdown_footnote", () => {
    expect(isCitation("The median is $35.[^1]")).toBe(true);
  });

  it("should_detect_bracketed_source_tag", () => {
    expect(isCitation("The median is $35 [source: fees_published].")).toBe(true);
  });

  it("should_detect_phrased_attribution", () => {
    expect(isCitation("Per fees_published, the median is $35.")).toBe(true);
    expect(isCitation("According to Call Reports, revenue fell.")).toBe(true);
  });

  it("should_detect_named_data_source", () => {
    expect(isCitation("FRED series FEDFUNDS shows a 5.3% rate.")).toBe(true);
    expect(isCitation("Beige Book commentary notes tighter credit.")).toBe(true);
  });

  it("should_detect_named_institution_with_figure", () => {
    expect(isCitation("JPMorgan Chase charges $35 for overdraft.")).toBe(true);
  });

  it("should_not_flag_plain_prose", () => {
    expect(isCitation("The market is shifting toward lower friction.")).toBe(false);
  });
});

// ─── countClaims / countCitations ─────────────────────────────────────────────

describe("countClaims and countCitations", () => {
  it("should_count_claims_in_a_dense_report", () => {
    const count = countClaims(WELL_CITED_REPORT);
    expect(count).toBeGreaterThanOrEqual(6);
  });

  it("should_count_citations_in_a_dense_report", () => {
    const count = countCitations(WELL_CITED_REPORT);
    expect(count).toBeGreaterThanOrEqual(6);
  });

  it("should_return_zero_citations_for_a_thin_report", () => {
    expect(countCitations(THIN_REPORT)).toBe(0);
  });
});

// ─── evaluateCitationDensity ──────────────────────────────────────────────────

describe("evaluateCitationDensity", () => {
  it("should_pass_when_density_and_count_are_met", () => {
    const result = evaluateCitationDensity(WELL_CITED_REPORT);
    expect(result.status).toBe("pass");
    if (result.status === "pass") {
      expect(result.metrics.citations).toBeGreaterThanOrEqual(5);
      expect(result.metrics.density).toBeGreaterThanOrEqual(0.5);
    }
  });

  it("should_refuse_a_thin_report", () => {
    const result = evaluateCitationDensity(THIN_REPORT);
    expect(result.status).toBe("refused");
    if (result.status === "refused") {
      expect(result.reason).toBe("insufficient_citations");
      expect(result.metrics.citations).toBeLessThan(5);
      expect(result.claims_without_citations.length).toBeGreaterThan(0);
      expect(result.suggestion).toMatch(/citation|claim|data source/i);
    }
  });

  it("should_refuse_when_claims_exist_but_no_citations", () => {
    const markdown = `## Findings\nThe median fee is $35. The top quartile is $40.`;
    const result = evaluateCitationDensity(markdown, { countMin: 1, densityMin: 0.5 });
    expect(result.status).toBe("refused");
  });

  it("should_exempt_introduction_paragraphs_from_claim_count", () => {
    const result = evaluateCitationDensity(PROSE_ONLY_INTRO);
    // Introduction lines with a qualitative only structure must NOT bring the
    // claim count down — the six cited claims in Findings should carry it.
    expect(result.status).toBe("pass");
  });

  it("should_respect_custom_threshold_overrides", () => {
    const result = evaluateCitationDensity(WELL_CITED_REPORT, {
      densityMin: 0.99,
      countMin: 50,
    });
    expect(result.status).toBe("refused");
  });

  it("should_refuse_an_empty_report", () => {
    const result = evaluateCitationDensity("");
    expect(result.status).toBe("refused");
    if (result.status === "refused") {
      expect(result.metrics.claims).toBe(0);
      expect(result.metrics.citations).toBe(0);
    }
  });

  it("should_cap_the_uncited_claims_example_list", () => {
    const lines = Array.from({ length: 20 }, (_, i) => `Claim ${i} with value of $${10 + i}.`);
    const result = evaluateCitationDensity(`## Findings\n${lines.join("\n")}`, {
      maxExamples: 3,
    });
    expect(result.status).toBe("refused");
    if (result.status === "refused") {
      expect(result.claims_without_citations).toHaveLength(3);
    }
  });
});

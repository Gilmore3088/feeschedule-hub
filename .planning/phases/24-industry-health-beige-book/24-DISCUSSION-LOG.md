# Phase 24: Industry Health & Beige Book - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-04-07
**Phase:** 24-industry-health-beige-book
**Areas discussed:** Health metrics shape, Beige Book summarization, Growth computation method, Theme extraction approach

---

## Health Metrics Shape

### Q1: Should industry health metrics reuse Phase 23's RichIndicator shape?

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse RichIndicator (Recommended) | Same shape: current, history[], trend, asOf. Consistent API for Hamilton. | Yes |
| Simpler aggregate shape | Just bank_avg, cu_avg, national_avg, period. No history or trend. | |
| You decide | Claude picks the shape. | |

**User's choice:** Reuse RichIndicator
**Notes:** None

### Q2: Where should industry health functions live?

| Option | Description | Selected |
|--------|-------------|----------|
| New file: health.ts (Recommended) | Distinct domain from per-institution financials. | Yes |
| Extend financial.ts | Keep financial data together. | |
| You decide | Claude picks. | |

**User's choice:** New file: health.ts
**Notes:** None

---

## Beige Book Summarization

### Q3: How should Beige Book content be condensed?

| Option | Description | Selected |
|--------|-------------|----------|
| LLM-generated at query time | Call Claude API per query. Accurate but costly and slow. | |
| Pre-computed and stored (Recommended) | Run LLM during ingestion. Store summaries. Zero query latency. | Yes |
| Rule-based extraction | First 2-3 sentences from Summary section. Free but crude. | |
| You decide | Claude picks. | |

**User's choice:** Pre-computed and stored
**Notes:** None

### Q4: LLM or rule-based for pre-computed summaries?

| Option | Description | Selected |
|--------|-------------|----------|
| LLM during ingestion (Recommended) | Claude Haiku generates summaries. ~$0.12 per edition. | Yes |
| Rule-based: first 2-3 sentences | Free but quality depends on opening sentences. | |
| You decide | Claude picks. | |

**User's choice:** LLM during ingestion
**Notes:** None

---

## Growth Computation Method

### Q5: How should YoY growth be computed?

| Option | Description | Selected |
|--------|-------------|----------|
| SQL with quarter matching (Recommended) | DATE_TRUNC + LAG or self-join. Handles missing quarters. | Yes |
| TypeScript post-processing | Query all totals, compute in TS. More testable. | |
| You decide | Claude picks. | |

**User's choice:** SQL with quarter matching
**Notes:** None

### Q6: What defines an 'active' institution?

| Option | Description | Selected |
|--------|-------------|----------|
| Has financials in the period (Recommended) | Row in institution_financials for that quarter. | Yes |
| Has crawl_target entry | Count all crawl_targets. Simpler but inaccurate. | |
| You decide | Claude picks. | |

**User's choice:** Has financials in the period
**Notes:** None

---

## Theme Extraction Approach

### Q7: How should national themes be extracted?

| Option | Description | Selected |
|--------|-------------|----------|
| LLM during ingestion (Recommended) | Second LLM pass reads all 12 summaries, extracts 4 themes. ~$0.02. | Yes |
| Keyword/section-based | Map section names to theme categories. Free but crude. | |
| You decide | Claude picks. | |

**User's choice:** LLM during ingestion
**Notes:** None

---

## Claude's Discretion

- Import pattern for RichIndicator
- Test file organization
- DB storage format for Beige Book summaries
- Haiku prompt design for summarization and theme extraction

## Deferred Ideas

- National surveys, BLS data, additional FED data sources -- belongs in Phase 27 (External Intelligence)

---
phase: 34-voice-v3-section-generator-v2
plan: "01"
subsystem: hamilton
tags:
  - hamilton
  - voice
  - report-engine
  - section-generator
  - fred
  - beige-book
dependency_graph:
  requires:
    - 33-03 (thesis injection shell)
  provides:
    - VOICE-01 (consistent word-budget rule in HAMILTON_RULES)
    - SECTION-01 (fred_snapshot in executive_summary + revenue_reality payloads)
    - SECTION-02 (beige_book_themes in executive_summary payload)
    - SECTION-03 (word-count range assertions in generate.test.ts)
  affects:
    - src/lib/hamilton/voice.ts
    - src/lib/report-engine/assemble-and-render.ts
    - src/lib/hamilton/generate.test.ts
tech_stack:
  added: []
  patterns:
    - Cross-source data injection: payload.fred + payload.district_headlines sliced into section data objects
    - CROSS-SOURCE INSTRUCTION block appended to context string for sections receiving macro data
key_files:
  created: []
  modified:
    - src/lib/hamilton/voice.ts
    - src/lib/report-engine/assemble-and-render.ts
    - src/lib/hamilton/generate.test.ts
decisions:
  - "Replaced NARRATIVE STRUCTURE line to include situation/complication/finding/implication keywords — fixes pre-existing voice.test.ts failure where test checked for those exact words"
  - "HARD CONSTRAINT updated: 'Output only the 2-3 most decisive sentences' removed, replaced with 'Output exactly 150-200 words' — now consistent with Rule 6"
  - "beige_book_themes sliced to 5 entries per T-34-01 threat mitigation"
metrics:
  duration: "~15 minutes"
  completed: "2026-04-07"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 3
---

# Phase 34 Plan 01: Voice v3 Word-Budget Fix + Section Payload Enrichment Summary

Fix the voice v3 word-budget conflict (Rule 6 vs HARD CONSTRAINT), inject FRED/Beige Book data into section payloads for executive_summary and revenue_reality, add CROSS-SOURCE INSTRUCTIONs, and add word-count range assertions to the test suite.

## What Was Built

**HAMILTON_VERSION bumped to 3.1.0** with three targeted changes to `voice.ts`:

1. Rule 6 rewritten from "Maximum 3 sentences per section" to a word-budget directive ("150-200 words per section") — eliminates the direct contradiction between the sentence-cap and the HARD CONSTRAINT word budget.
2. HARD CONSTRAINT updated: removed "Output only the 2-3 most decisive sentences", replaced with "Output exactly 150-200 words". Both the rule and the constraint now point at the same budget.
3. NARRATIVE STRUCTURE line expanded to include the situation/complication/finding/implication arc wording — this also fixes a pre-existing `voice.test.ts` failure where the test checked for those exact keywords.

**Section payload enrichment** in `assemble-and-render.ts`:

- `executive_summary`: adds `fred_snapshot` (fed_funds_rate, unemployment_rate, cpi_yoy_pct, as_of) and `beige_book_themes` (up to 5 district headlines formatted as "District N: headline") to the data object.
- `revenue_reality` ("Where the Money Actually Comes From"): adds `fred_snapshot` (fed_funds_rate, cpi_yoy_pct, as_of).
- Context strings for both sections appended with a CROSS-SOURCE INSTRUCTION block that forces at least one FRED indicator and (for executive_summary) at least one Beige Book theme reference.

**Word-count test suite** in `generate.test.ts`: new describe block "generateSection word count range (SECTION-03)" with 4 tests verifying `countWords()` measurement accuracy at 150, 175, 120, and 220 words.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | `5ae7692` | feat(34-01): fix voice Rule 6 word-budget conflict + enrich section payloads |
| Task 2 | `944e6aa` | test(34-01): add word-count range assertions to generate.test.ts (SECTION-03) |

## Test Results

- `npx vitest run src/lib/hamilton/` — 44 passed, 0 failures
- `types.test.ts` reports "No test suite found" — pre-existing issue (file contains only TypeScript `satisfies` type assertions, no vitest blocks); not caused by this plan
- `npx tsc --noEmit` — 0 errors in modified files (pre-existing errors in `src/lib/crawler-db/*.test.ts` unrelated to this plan)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed pre-existing voice.test.ts failure ("systemPrompt references narrative structure")**
- **Found during:** Task 1, when running voice tests to verify changes
- **Issue:** `voice.test.ts` lines 56-59 check for the words "situation", "complication", "finding", "implication" in `HAMILTON_SYSTEM_PROMPT`. The NARRATIVE STRUCTURE line used "Insight" and "Evidence" but not those exact terms.
- **Fix:** Rewrote the NARRATIVE STRUCTURE line to explicitly include all four terms in the situation/complication/finding/implication arc — semantically consistent with the existing structure pattern.
- **Files modified:** `src/lib/hamilton/voice.ts`
- **Commit:** `5ae7692`

## Known Stubs

None — all data fields wired to live payload objects. `fred_snapshot` will be `null` when `payload.fred` is null (graceful degradation already present in assembler pattern). `beige_book_themes` will be an empty array `[]` when `payload.district_headlines` is empty — Claude receives an empty array and the CROSS-SOURCE INSTRUCTION remains in the context, which is acceptable.

## Threat Flags

None — changes are additive (new keys in existing data objects). FRED data is public economic data (T-34-02: accept). Beige Book headlines sliced to 5 entries per T-34-01 mitigation already specified in plan.

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| `src/lib/hamilton/voice.ts` exists | FOUND |
| `src/lib/report-engine/assemble-and-render.ts` exists | FOUND |
| `src/lib/hamilton/generate.test.ts` exists | FOUND |
| `34-01-SUMMARY.md` exists | FOUND |
| Commit `5ae7692` exists | FOUND |
| Commit `944e6aa` exists | FOUND |

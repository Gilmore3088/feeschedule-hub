---
phase: 33-global-thesis-engine
plan: "02"
subsystem: hamilton
tags: [thesis, report-assembly, ai-generation, data-condensation]
dependency_graph:
  requires:
    - 33-01  # ThesisInput, ThesisOutput, ThesisSummaryPayload types + voice v3
  provides:
    - buildThesisSummary()  # pure condensation function for assemblers
    - generateGlobalThesis()  # Claude thesis generation entry point
  affects:
    - src/lib/hamilton/index.ts  # new public exports
    - src/lib/report-assemblers/national-quarterly.ts  # buildThesisSummary added
tech_stack:
  added: []
  patterns:
    - TDD with vi.mock for Anthropic SDK stubbing
    - vi.mock with class-based constructor for new-able mocks
    - Pure condensation function separated from AI call (D-01 compliance)
key_files:
  created:
    - src/lib/report-assemblers/national-quarterly.test.ts
    - src/lib/hamilton/generate.test.ts
  modified:
    - src/lib/report-assemblers/national-quarterly.ts
    - src/lib/hamilton/generate.ts
    - src/lib/hamilton/index.ts
decisions:
  - Used class-based vi.mock constructor (not vi.fn().mockImplementation) to make Anthropic mock new-able
  - formatContext returns empty string when no context; buildUserMessage conditionally omits CONTEXT block
  - CONTEXT block only injected into user message when non-empty (cleaner prompts for no-context calls)
metrics:
  duration_minutes: 15
  completed_date: "2026-04-08"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 3
  tests_added: 19
requirements:
  - THESIS-01
  - THESIS-03
---

# Phase 33 Plan 02: Thesis Condensation + Generation Summary

**One-liner:** Pure `buildThesisSummary()` condenser + `generateGlobalThesis()` Claude caller with scope-aware prompting, 90s timeout, and JSON parse error surfacing.

## What Was Built

### Task 1 — buildThesisSummary() (national-quarterly.ts)

Pure function added to `src/lib/report-assemblers/national-quarterly.ts`. Takes a full `NationalQuarterlyPayload` and returns a `~5KB ThesisSummaryPayload`.

Key behaviors:
- Top 10 categories by `institution_count` descending (spreads copy with `[...payload.categories]` to avoid mutating source)
- `revenue_snapshot` and `fred_snapshot` mapped directly; `null` propagated when source is `null`
- `beige_book_themes` from `district_headlines.map(h => h.headline)`
- `derived_tensions`: 0-3 pre-computed strings, each guarded by null check on its data source

**Condensation ratio (rough estimate):**
- Full `NationalQuarterlyPayload` with 49 categories: ~25-40KB JSON
- `ThesisSummaryPayload` with 10 categories + snapshots: ~4-6KB JSON
- Reduction: ~80% by row count; all analytics fields replaced by 3 pre-computed strings

### Task 2 — generateGlobalThesis() + generate.ts changes

**MAX_TOKENS:** Changed from 500 to 1500 (confirmed: `grep "MAX_TOKENS = 1500"` returns match).

**formatContext() rewrite:** Removed 75-word hard limit. Now returns `input.context ?? ''`. `buildUserMessage` conditionally includes the `CONTEXT:` block only when the string is non-empty (cleaner prompts when no context provided).

**generateGlobalThesis():**
- Calls Claude with `THESIS_TIMEOUT_MS = 90_000` (vs 60s for sections)
- `buildThesisPrompt()` adapts for scope: quarterly gets `contrarian_insight` field + 3-5 tensions; lighter scopes get 1-2 tensions only
- Includes think-then-compress instruction (D-05) and tension model instruction (D-10)
- JSON parse failure throws: `Hamilton thesis generation returned unparseable JSON [scope=X]: <first 200 chars>` (T-33-06)
- Beige Book headlines sliced to 200 chars each in prompt (T-33-03)
- `contrarian_insight` defaults to `null` when absent in parsed response (lighter scopes)

**index.ts:** `generateGlobalThesis` and all thesis types (`ThesisScope`, `ThesisTension`, `ThesisOutput`, `ThesisInput`, `ThesisSummaryPayload`) re-exported from public API.

## Test Results

```
Test Files  2 passed (2)
     Tests  19 passed (19)
```

- `national-quarterly.test.ts`: 11 tests — top-10 sort, field mapping, null propagation, derived tension count, immutability
- `generate.test.ts`: 8 tests — quarterly full output, lighter scope null contrarian_insight, unparseable JSON error, missing API key, API failure, empty response, no HARD LIMIT in message, CONTEXT block omitted when empty

## Confirmed Verification Checks

| Check | Result |
|-------|--------|
| `grep "MAX_TOKENS = 1500" src/lib/hamilton/generate.ts` | 1 match |
| `grep "HARD LIMIT" src/lib/hamilton/generate.ts` | 0 matches |
| `grep "buildThesisSummary" src/lib/report-assemblers/national-quarterly.ts` | export present |
| `grep "generateGlobalThesis" src/lib/hamilton/index.ts` | export present |
| `npx tsc --noEmit` on modified files | 0 new errors |

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | `e81f2ce` | feat(33-02): add buildThesisSummary() to national-quarterly.ts |
| 2 | `2dfe093` | feat(33-02): add generateGlobalThesis() + raise MAX_TOKENS + remove 75-word limit |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] vi.fn().mockImplementation not constructable**
- **Found during:** Task 2 RED phase
- **Issue:** `vi.fn().mockImplementation(() => ...)` produces an arrow function, not a real constructor. `new Anthropic(...)` in `generate.ts` threw "is not a constructor".
- **Fix:** Replaced with a real `class MockAnthropic` inside the `vi.mock` factory, making it properly `new`-able.
- **Files modified:** `src/lib/hamilton/generate.test.ts`

**2. [Rule 2 - Missing Critical Functionality] CONTEXT block conditionally omitted**
- **Found during:** Task 2 implementation
- **Issue:** Plan specified `formatContext` returns empty string when no context; original `buildUserMessage` always pushed the CONTEXT block even when empty, producing a noisy `CONTEXT:\n` line in the prompt.
- **Fix:** Added `if (context)` guard in `buildUserMessage` so the block is omitted entirely when context is empty. Added a test case for this behavior.
- **Files modified:** `src/lib/hamilton/generate.ts`, `src/lib/hamilton/generate.test.ts`

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. `generateGlobalThesis` calls the Anthropic API (existing surface). Beige Book text injection mitigated by 200-char slice per T-33-03.

## Known Stubs

None. Both functions are fully implemented. `generateGlobalThesis` requires a live `ANTHROPIC_API_KEY` at runtime — this is expected and documented.

## Self-Check: PASSED

---
phase: 33-global-thesis-engine
plan: "03"
subsystem: report-engine
tags: [hamilton, thesis, report-orchestration, national-quarterly]
dependency_graph:
  requires: [33-01, 33-02]
  provides: [thesis-aware-report-orchestration]
  affects: [src/lib/report-engine/assemble-and-render.ts]
tech_stack:
  added: []
  patterns: [thesis-before-sections, graceful-degradation, context-injection]
key_files:
  modified:
    - src/lib/report-engine/assemble-and-render.ts
decisions:
  - "Removed V3_CONTEXT constant — word budget is now governed by HAMILTON_VOICE system prompt (D-06)"
  - "thesisContext is empty string on failure — no crash, no fallback text injected into sections"
  - "ThesisOutput imported as type-only to keep import clean"
metrics:
  duration: ~8 minutes
  completed: 2026-04-07
  tasks_completed: 1
  tasks_total: 1
  files_modified: 1
---

# Phase 33 Plan 03: Thesis Injection into National Report Orchestration — Summary

**One-liner:** Wired generateGlobalThesis() into the national_index report path so all 6 Hamilton sections receive the thesis narrative_summary as shared context before parallel generation.

## What Was Built

The final integration task for Phase 33. `assemble-and-render.ts` now calls `generateGlobalThesis()` (Plan 02) before the `Promise.allSettled` block, then injects the resulting `narrative_summary` into every section's `context` field via a `thesisContext` prefix string.

## Verification Evidence

### thesisContext appears in all 6 section calls (grep output)

```
14: import { generateSection, generateGlobalThesis } from '@/lib/hamilton/generate';
16: import { assembleNationalQuarterly, buildThesisSummary } from '@/lib/report-assemblers/national-quarterly';
24: import type { SectionOutput, ThesisOutput } from '@/lib/hamilton/types';
139: let thesis: ThesisOutput | null = null;
141:   const summary = buildThesisSummary(payload);
142:   thesis = await generateGlobalThesis({ scope: 'quarterly', data: summary });
150: const thesisContext = thesis?.narrative_summary
170:   context: `${thesisContext}Write 2-3 punchy sentences...`        (executive_summary)
182:   context: `${thesisContext}Analyze fee clustering...`            (fee_differentiation)
194:   context: `${thesisContext}Compare bank vs CU fee strategies...` (banks_vs_credit_unions)
205:   context: `${thesisContext}Frame revenue as concentrated...`     (revenue_reality)
216:   context: `${thesisContext}Discuss the lack of standardized...`  (industry_blind_spot)
226:   context: `${thesisContext}Write 5 concrete predictions...`      (future_strategy)
```

`grep -c "thesisContext" src/lib/report-engine/assemble-and-render.ts` = **7** (1 definition + 6 uses)

### V3_CONTEXT removed

`grep "V3_CONTEXT" src/lib/report-engine/assemble-and-render.ts` = **0 matches**

### monthly_pulse and peer_brief untouched

`grep -A5 "case 'monthly_pulse'" ... | grep "thesisContext"` = NOT FOUND
`grep -A5 "case 'peer_brief'" ... | grep "thesisContext"` = NOT FOUND

### TypeScript

`npx tsc --noEmit` — **zero errors in assemble-and-render.ts**. Pre-existing errors in test mock files (`call-reports.test.ts`, `complaints.test.ts`, etc.) are unrelated to this plan.

### Vitest

219 tests run in this worktree. 216 pass. 3 pre-existing failures in `voice.test.ts` (narrative structure assertion) and `fees.test.ts` (winsorization logic) — both files untouched by this plan.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. The thesis context injection is fully wired. If `thesis` is null (API failure), `thesisContext` is an empty string and sections generate normally.

## Threat Flags

No new network endpoints, auth paths, file access patterns, or schema changes introduced. T-33-07, T-33-08, T-33-09 from plan's threat model are addressed:
- T-33-07: narrative_summary labeled "GLOBAL THESIS" in context, not user-controlled
- T-33-08: accepted — thesis is 1 extra API call, sections still run in parallel after
- T-33-09: mitigated — try/catch around entire thesis block, graceful null fallback

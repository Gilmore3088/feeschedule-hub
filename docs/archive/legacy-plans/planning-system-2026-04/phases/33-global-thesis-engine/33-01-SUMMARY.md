---
phase: 33-global-thesis-engine
plan: "01"
subsystem: hamilton
tags: [types, voice, thesis, contracts]
dependency_graph:
  requires: []
  provides: [ThesisScope, ThesisTension, ThesisOutput, ThesisInput, ThesisSummaryPayload, HAMILTON_VERSION_3]
  affects: [src/lib/hamilton/generate.ts, src/lib/hamilton/voice.ts]
tech_stack:
  added: []
  patterns: [satisfies operator for compile-time type assertions, readonly const rules array]
key_files:
  created:
    - src/lib/hamilton/types.test.ts
  modified:
    - src/lib/hamilton/types.ts
    - src/lib/hamilton/voice.ts
decisions:
  - "contrarian_insight typed as string | null to model lighter-scope omission without a separate type union"
  - "Two new voice rules inserted at index 3-4 (after implication rule, before 3-sentence rule) to preserve logical rule ordering"
  - "HARD CONSTRAINT updated from sentence-count to word-count to allow internal reasoning with compressed output"
metrics:
  duration_minutes: 12
  completed_date: "2026-04-07"
  tasks_completed: 2
  files_modified: 3
---

# Phase 33 Plan 01: Thesis Type Contracts and Hamilton Voice v3 Summary

**One-liner:** Thesis type contracts (5 interfaces/types) and Hamilton voice v3 with revenue-first and tension-model rules embedded in system prompt.

## Tasks Completed

| Task | Commit | Files |
|------|--------|-------|
| 1: Add thesis type contracts to types.ts | 79f1169 | src/lib/hamilton/types.ts, src/lib/hamilton/types.test.ts |
| 2: Upgrade Hamilton voice to v3 | 11b966b | src/lib/hamilton/voice.ts |

## Files Modified

### src/lib/hamilton/types.ts

Appended thesis types block after `PeerCompetitiveData`. No existing types modified.

**Exact ThesisOutput JSON shape:**

```typescript
export interface ThesisOutput {
  core_thesis: string;
  tensions: ThesisTension[];          // Array<{ force_a, force_b, implication }>
  revenue_model: string;
  competitive_dynamic: string;
  contrarian_insight: string | null;  // null for monthly_pulse, peer_brief, state_index
  narrative_summary: string;          // 150-word summary injected into all section contexts
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}
```

All five exports: `ThesisScope`, `ThesisTension`, `ThesisOutput`, `ThesisSummaryPayload`, `ThesisInput`.

### src/lib/hamilton/types.test.ts (new)

Compile-time contract test using `satisfies` operator. Validates all 5 types with real object literals — both full and nullable variants. Fails at compile time if shapes diverge.

### src/lib/hamilton/voice.ts

**HAMILTON_VERSION:** `"3.0.0"`

**HAMILTON_RULES:** 10 entries (was 8). Two new rules inserted at index 3-4:

- Rule D-09 (revenue before pricing): Revenue figures lead when DATA block contains service charges, fee income, or YoY change. Pricing is evidence; revenue is the insight.
- Rule D-10 (tension model): Every key insight framed as `[force A] while [force B] — [implication]`.

**HARD CONSTRAINT updated:**
```
150-200 words per section. Reason through 5-8 sentences internally. Output only the 2-3 most decisive sentences. The reader sees your conclusion, not your reasoning.
```

**NARRATIVE STRUCTURE updated:**
```
Insight (tension-framed if possible) -> Evidence (revenue figure first if available, then pricing/IQR data) -> Implication (what the reader must decide or act on).
```

**HAMILTON_SYSTEM_PROMPT word count:** 179 words (including interpolated rules and forbidden terms).

**Forbidden terms list, HAMILTON_TONE, HAMILTON_FORBIDDEN_PATTERNS:** Unchanged.

## Verification

```
npx tsc --noEmit   — zero errors in hamilton/ files
grep HAMILTON_VERSION voice.ts — "3.0.0"
grep "Revenue before pricing" voice.ts — 1 match
grep "tension between two competing forces" voice.ts — 1 match
grep "150-200 words per section" voice.ts — 1 match
HAMILTON_RULES entry count — 10
```

Pre-existing TypeScript errors in `src/lib/crawler-db/*.test.ts` (Sql mock type mismatch) are out of scope — they predate this plan and were present before execution.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. These are type-only and voice-only files. No data flows to UI rendering.

## Threat Flags

None. Both files are server-side only. No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries introduced.

## Self-Check: PASSED

- [x] src/lib/hamilton/types.ts exists and exports 5 thesis types
- [x] src/lib/hamilton/types.test.ts exists with compile-time satisfies assertions
- [x] src/lib/hamilton/voice.ts has HAMILTON_VERSION = "3.0.0"
- [x] HAMILTON_RULES has 10 entries
- [x] "Revenue before pricing" present in voice.ts
- [x] "tension between two competing forces" present in voice.ts
- [x] "150-200 words per section" present in voice.ts
- [x] Commit 79f1169 exists (Task 1)
- [x] Commit 11b966b exists (Task 2)

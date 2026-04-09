---
phase: 38-architecture-foundation
plan: "02"
subsystem: hamilton-type-contracts
tags: [typescript, types, hamilton, navigation, modes, tdd]
dependency_graph:
  requires: []
  provides:
    - src/lib/hamilton/types.ts (AnalyzeResponse, SimulationResponse, ReportSummaryResponse, MonitorResponse)
    - src/lib/hamilton/modes.ts (HamiltonMode, MODE_BEHAVIOR, ModeBehavior)
    - src/lib/hamilton/navigation.ts (HAMILTON_NAV, LEFT_RAIL_CONFIG, CTA_HIERARCHY, ANALYSIS_FOCUS_TABS, HAMILTON_LABELS)
  affects:
    - Phase 40+ screen components (import MODE_BEHAVIOR[mode].canRecommend)
    - Phase 40 HamiltonTopNav (imports HAMILTON_NAV)
    - Phase 43-46 API routes (import screen DTOs as response type parameters)
tech_stack:
  added: []
  patterns:
    - satisfies operator for compile-time DTO shape validation
    - as const for literal type narrowing on config objects
    - "@ts-expect-error" for enforcing absent fields (screen ownership)
key_files:
  created:
    - src/lib/hamilton/modes.ts
    - src/lib/hamilton/modes.test.ts
    - src/lib/hamilton/navigation.ts
    - src/lib/hamilton/navigation.test.ts
  modified:
    - src/lib/hamilton/types.ts (screen DTOs appended)
    - src/lib/hamilton/types.test.ts (screen DTO tests appended)
decisions:
  - Screen ownership enforced via distinct interfaces — AnalyzeResponse has no recommendedPosition field, verified by @ts-expect-error
  - MODE_BEHAVIOR uses as const to give literal false/true types, not boolean, enabling narrow type assertions
  - HAMILTON_BASE = /pro centralizes route prefix — change once in navigation.ts affects all nav hrefs
  - ReportSummaryResponse includes exportControls not present in 06-api-and-agent-contracts.md stub — added per plan spec to enforce screen ownership for Reports screen
metrics:
  duration: "3 minutes"
  completed_date: "2026-04-08"
  tasks_completed: 2
  files_created: 4
  files_modified: 2
---

# Phase 38 Plan 02: Hamilton Type Contracts Summary

TypeScript DTO contracts, mode capability config, and navigation source of truth for Hamilton's screen ownership architecture — enabling downstream phases (40-46) to import typed interfaces with compile-time enforcement.

## What Was Built

### Task 1: Screen DTOs + MODE_BEHAVIOR

**`src/lib/hamilton/types.ts`** — 4 screen DTOs appended after existing thesis types:

- `AnalyzeResponse` — explore/explain fields; deliberately excludes `recommendedPosition` (ARCH-05)
- `SimulationResponse` — the only DTO with `recommendedPosition: string`
- `ReportSummaryResponse` — read-only presentation with `exportControls: { pdfEnabled, shareEnabled }`
- `MonitorResponse` — status/signals/watchlists, no recommendation fields

**`src/lib/hamilton/modes.ts`** — Mode capability gating:

- `HamiltonMode` union: `"home" | "analyze" | "simulate" | "report" | "monitor"`
- `MODE_BEHAVIOR` config with `as const` — gives literal `false`/`true` types per mode
- `ModeBehavior` utility type for component prop typing

**Tests (20 passing):** `satisfies` checks for all 4 DTOs, `@ts-expect-error` enforcing absent fields on AnalyzeResponse and MonitorResponse, runtime assertions on MODE_BEHAVIOR literals, completeness check (5 keys).

### Task 2: Navigation Source of Truth

**`src/lib/hamilton/navigation.ts`** — Single source of truth for all Hamilton routing:

- `HAMILTON_BASE = "/pro"` — route prefix constant
- `HAMILTON_NAV` — 6 entries with `/pro/*` hrefs (except Admin → `/admin`)
- `LEFT_RAIL_CONFIG` — per-screen primaryAction + workspace sections
- `CTA_HIERARCHY` — primary/secondary CTAs per screen per `09-copy-and-ux-rules.md`
- `ANALYSIS_FOCUS_TABS` — `["Pricing", "Risk", "Peer Position", "Trend"]`
- `HAMILTON_LABELS` — 8 label constants including `"Hamilton's View"` (D-08)

**Tests (19 passing):** Label order, href uniqueness, href format, LEFT_RAIL_CONFIG completeness, CTA exact values, ANALYSIS_FOCUS_TABS content, no Sovereign branding.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | c459bb7 | feat(38-02): add screen DTOs, HamiltonMode, and MODE_BEHAVIOR type contracts |
| 2 | 395243c | feat(38-02): add navigation source of truth with HAMILTON_NAV, CTA_HIERARCHY, labels |

## Verification Results

- `npx tsc --noEmit` — zero errors in `src/lib/hamilton/` (pre-existing errors in crawler-db test files are unrelated)
- `npx vitest run src/lib/hamilton/types.test.ts` — 7 passing (existing) + 13 new = all pass
- `npx vitest run src/lib/hamilton/modes.test.ts` — 7 passing
- `npx vitest run src/lib/hamilton/navigation.test.ts` — 19 passing
- `grep -c "AnalyzeResponse" types.ts` → 1 (interface exists)
- `recommendedPosition` in types.ts → line 208 is comment in AnalyzeResponse, line 237 is field in SimulationResponse only

## Deviations from Plan

### Auto-added: exportControls field on ReportSummaryResponse

**Rule 2 — Missing critical functionality**

The source document `06-api-and-agent-contracts.md` shows `ReportSummaryResponse` without `exportControls`. However, the plan's action spec explicitly states to add `exportControls: { pdfEnabled: boolean; shareEnabled: boolean }` to enforce the screen ownership rule that Reports is the export screen. Added per plan spec — the source doc stub was the incomplete version.

### Pre-existing test failure (out of scope)

`src/lib/hamilton/voice.test.ts` has 1 failing test (`systemPrompt references narrative structure`) that was failing before this plan executed. Logged as out-of-scope — no fix attempted.

## Known Stubs

None. All interfaces are complete type definitions with no placeholder values.

## Threat Flags

None. No new network endpoints, auth paths, or file access patterns introduced. Types only.

## Self-Check: PASSED

- [x] `src/lib/hamilton/types.ts` — FOUND, contains `AnalyzeResponse`
- [x] `src/lib/hamilton/modes.ts` — FOUND, contains `MODE_BEHAVIOR` with `as const`
- [x] `src/lib/hamilton/navigation.ts` — FOUND, contains `HAMILTON_NAV` with 6 entries
- [x] `src/lib/hamilton/types.test.ts` — FOUND, contains `@ts-expect-error` for screen ownership
- [x] `src/lib/hamilton/modes.test.ts` — FOUND, contains MODE_BEHAVIOR assertions
- [x] `src/lib/hamilton/navigation.test.ts` — FOUND, 19 tests passing
- [x] Commit c459bb7 — FOUND
- [x] Commit 395243c — FOUND

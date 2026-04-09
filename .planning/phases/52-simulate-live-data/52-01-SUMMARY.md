---
phase: 52-simulate-live-data
plan: "01"
subsystem: hamilton-simulate
tags: [simulate, category-selector, system-prompt, url-params, fee-families]
dependency_graph:
  requires: []
  provides:
    - simulate-category-selector-by-family
    - simulate-url-param-wiring
    - simulate-hamilton-contextual-prompt
  affects:
    - src/components/hamilton/simulate/ScenarioCategorySelector.tsx
    - src/components/hamilton/simulate/SimulateWorkspace.tsx
    - src/app/pro/(hamilton)/simulate/page.tsx
    - src/app/api/hamilton/simulate/route.ts
tech_stack:
  added: []
  patterns:
    - FEE_FAMILIES optgroup grouping for category selectors
    - initialCategory prop pattern for URL-param pre-selection in server components
    - Directional revenue framing in LLM system prompts (no dollar projections)
key_files:
  created: []
  modified:
    - src/components/hamilton/simulate/ScenarioCategorySelector.tsx
    - src/components/hamilton/simulate/SimulateWorkspace.tsx
    - src/app/pro/(hamilton)/simulate/page.tsx
    - src/app/api/hamilton/simulate/route.ts
decisions:
  - "Family grouping uses FEE_FAMILIES from fee-taxonomy.ts — single source of truth for all 49 categories across 9 families"
  - "initialCategory silently ignored if not found in loaded categories — no error state, safe default"
  - "System prompt enforces directional revenue framing only — peer positioning and complaint risk instead of dollar projections"
metrics:
  duration_minutes: 15
  completed_date: "2026-04-09"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 4
---

# Phase 52 Plan 01: Simulate Live Data Wiring Summary

**One-liner:** Category selector restructured from confidence-tier groups to 9 fee family optgroups using FEE_FAMILIES, ?category= URL param wired end-to-end, and Hamilton system prompt rewritten to enforce contextual intelligence over dollar predictions.

## What Was Built

### Task 1: Category selector, URL param, overdraft label strip

**ScenarioCategorySelector.tsx** — Removed the `TIER_ORDER`/`TIER_LABELS` confidence-tier grouping. Now imports `FEE_FAMILIES` and `DISPLAY_NAMES` from `@/lib/fee-taxonomy` and renders nine `<optgroup>` elements (one per fee family). Categories not in any family group are excluded (none in current taxonomy). Empty families are skipped. Option labels use `DISPLAY_NAMES` with approved count suffix.

**SimulateWorkspace.tsx** — Two changes:
1. `initialCategory?: string` added to `Props` interface and destructured from component args
2. Initialization `useEffect` now checks if `initialCategory` is set after categories load — if present in the loaded array, calls `handleCategorySelect(initialCategory)` immediately
3. Hardcoded `"Overdraft Fees"` fallback label on line 267 replaced with `"Fee Simulation"`

**page.tsx** — Function signature updated to accept `searchParams: Promise<{ category?: string }>` (Next.js 16 Promise-based pattern). Awaits params and extracts `initialCategory`, passed to `SimulateWorkspace` as a prop.

### Task 2: Hamilton system prompt rewrite

**route.ts** — System prompt replaced. Old prompt instructed Hamilton to "Be specific about dollar amounts" (directly violated D-06). New prompt:
- Forbids concrete dollar revenue projections explicitly
- Requires four framing dimensions: peer positioning, complaint/attrition risk, revenue direction (qualitative), regulatory awareness
- Retains 3-4 sentence plain prose McKinsey-advisor tone
- User prompt construction unchanged — it already provides the right context (percentiles, institution info, fee direction)

## Deviations from Plan

None — plan executed exactly as written.

## Verification

All acceptance criteria passed:

**Task 1:**
- `FEE_FAMILIES` import present in ScenarioCategorySelector.tsx
- `optgroup` rendering confirmed in ScenarioCategorySelector.tsx
- `TIER_ORDER` removed from ScenarioCategorySelector.tsx
- `"Overdraft Fees"` fallback label removed from SimulateWorkspace.tsx
- `initialCategory` prop wired in SimulateWorkspace.tsx
- `initialCategory` passed from page.tsx
- `searchParams` accepted in page.tsx

**Task 2:**
- `Do NOT provide concrete dollar revenue projections` guardrail present in route.ts
- `Complaint and attrition risk` directive present in route.ts
- `revenue-positive, revenue-neutral, or revenue-compressing` framing present in route.ts
- `Be specific about dollar amounts` instruction removed from route.ts
- `Peer positioning` directive present in route.ts

TypeScript: zero errors in all modified files. Pre-existing errors in `FloatingChatOverlay.tsx` and test mock files are unrelated to this plan.

## Commits

| Hash | Message |
|------|---------|
| 0478534 | feat(52-01): restructure category selector to fee families, wire ?category= URL param |
| 724f343 | feat(52-01): rewrite Hamilton simulate system prompt for contextual intelligence |

## Known Stubs

None — no hardcoded placeholder values in modified files. The `"Last Live Sync: 12s ago"` and `"HAM-2024-OD-09"` strings in SimulateWorkspace.tsx are pre-existing decorative labels outside this plan's scope.

## Threat Flags

No new threat surface introduced. The `initialCategory` URL param is validated against the loaded categories array before use (`.some()` guard). The system prompt change reduces misleading financial guidance risk (T-52-03 mitigated).

## Self-Check: PASSED

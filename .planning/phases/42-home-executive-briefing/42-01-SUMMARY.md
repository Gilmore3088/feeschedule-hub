---
phase: 42-home-executive-briefing
plan: "01"
subsystem: hamilton-home
tags: [hamilton, executive-briefing, thesis, positioning, ISR]
dependency_graph:
  requires: [hamilton-shell-40, data-layer-39]
  provides: [home-executive-briefing-01]
  affects: [pro-hamilton-page]
tech_stack:
  added: []
  patterns:
    - ISR revalidate=86400 for cost-controlled thesis generation
    - ThesisSummaryPayload assembled inline (no heavy report-assembler dependency)
    - monthly_pulse scope for lighter Hamilton thesis
    - Server components throughout — no "use client"
key_files:
  created:
    - src/lib/hamilton/home-data.ts
    - src/components/hamilton/home/HamiltonViewCard.tsx
    - src/components/hamilton/home/PositioningEvidence.tsx
  modified:
    - src/app/pro/(hamilton)/hamilton/page.tsx
decisions:
  - ISR at 86400s (24h) prevents repeated $5-10 thesis API calls per T-42-01
  - ThesisSummaryPayload built inline in home-data.ts to avoid importing heavy report-assembler chain
  - monthly_pulse scope used (not quarterly) — lighter, no contrarian_insight required per ThesisScope
  - Confidence derived from spotlight category maturity tiers — all strong=high, any insufficient=low
metrics:
  duration: "~45 minutes"
  completed: "2026-04-08"
  tasks_completed: 2
  tasks_total: 2
  files_created: 3
  files_modified: 1
---

# Phase 42 Plan 01: Home / Executive Briefing — Data Layer and Primary Cards

**One-liner:** Server data fetcher and two primary cards (thesis + fee positioning) for the Hamilton Pro home screen, ISR-cached at 24h to control thesis generation costs.

## What Was Built

### Task 1: home-data.ts

`src/lib/hamilton/home-data.ts` — server-side data fetcher for the Executive Briefing screen.

- `fetchHomeBriefingData()` calls `getNationalIndexCached()` then `generateGlobalThesis({ scope: "monthly_pulse", ... })`
- ThesisSummaryPayload assembled inline from top-10 index entries — no heavy dependencies
- Confidence derived: all spotlight categories "strong" → high; any "insufficient" → low
- try/catch wraps thesis generation — returns `thesis: null` on API failure for graceful empty state
- Exports: `HomeBriefingData`, `PositioningEntry`, `fetchHomeBriefingData`

### Task 2: Components + page.tsx

**HamiltonViewCard** (`src/components/hamilton/home/HamiltonViewCard.tsx`):
- Renders `core_thesis` in hamilton-font-serif (large, authoritative)
- `ConfidenceBadge`: green pill (High), amber (Moderate), gray (Limited data) — per D-08
- `narrative_summary` in secondary text below a divider
- Tensions rendered as bordered list: "force_a while force_b — implication"
- Empty state when thesis is null

**PositioningEvidence** (`src/components/hamilton/home/PositioningEvidence.tsx`):
- Renders 6 spotlight categories as flex stat cards
- Each card: display name label, median amount (large tabular-nums), P25–P75 range, institution count, maturity badge
- Empty state: "Configure your institution in Settings to see positioning data."

**page.tsx** (`src/app/pro/(hamilton)/hamilton/page.tsx`):
- `export const revalidate = 86400` — 24h ISR per T-42-01 threat mitigation
- Date stamp + institution count subtitle
- Placeholder comments for Plan 02 components: WhatChangedCard, PriorityAlertsCard, RecommendedActionCard, MonitorFeedPreview

## Deviations from Plan

### Baseline Restoration (Rule 3 - Blocking Issue)

- **Found during:** Setup
- **Issue:** Worktree was at a pre-0f3e138 state — missing hamilton layout, components, lib files, and updated globals.css with hamilton CSS tokens
- **Fix:** Performed soft reset to 0f3e138, restored all affected files to their correct versions, committed baseline restoration
- **Files modified:** 28 files across hamilton layout, pro reports, globals.css, auth.ts, etc.
- **Commits:** 89fd50e (initial task 1 with accidental old files), 92a79d9 (baseline restoration)

No logic or design deviations from the plan.

## Known Stubs

None. `fetchHomeBriefingData()` calls live data via `getNationalIndexCached()` and `generateGlobalThesis()`. No hardcoded empty values flow to the UI — empty states are conditional on actual null returns.

## Threat Flags

No new network endpoints, auth paths, or schema changes introduced. The page is behind the HamiltonShell auth gate (`layout.tsx` checks `getCurrentUser + canAccessPremium`). ISR mitigation for T-42-01 (DoS via repeated thesis calls) implemented via `revalidate = 86400`.

## Self-Check: PASSED

| Item | Status |
|------|--------|
| src/lib/hamilton/home-data.ts | FOUND |
| src/components/hamilton/home/HamiltonViewCard.tsx | FOUND |
| src/components/hamilton/home/PositioningEvidence.tsx | FOUND |
| src/app/pro/(hamilton)/hamilton/page.tsx | FOUND |
| Commit 89fd50e (home-data.ts) | FOUND |
| Commit 92a79d9 (baseline restore) | FOUND |
| Commit 9eeeb6d (components + page.tsx) | FOUND |

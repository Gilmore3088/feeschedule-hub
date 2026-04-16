---
phase: 61-hamilton-pro-polish
plan: "01"
subsystem: hamilton-pro-ui
tags: [demo-data-removal, empty-states, ux-polish, pro-screens]
dependency_graph:
  requires: []
  provides: [clean-pro-screens, d03-empty-states]
  affects: [simulate-workspace, report-workspace, settings-page, analyze-workspace, hamilton-view-card]
tech_stack:
  added: []
  patterns:
    - D-03 gold standard empty state (icon circle + serif italic headline + description + CTA)
    - Props threading from server component to client component for institution context
key_files:
  created: []
  modified:
    - src/components/hamilton/simulate/SimulateWorkspace.tsx
    - src/components/hamilton/reports/ReportWorkspace.tsx
    - src/app/pro/(hamilton)/reports/page.tsx
    - src/app/pro/(hamilton)/reports/actions.ts
    - src/app/pro/(hamilton)/settings/page.tsx
    - src/components/hamilton/analyze/AnalyzeWorkspace.tsx
    - src/components/hamilton/home/HamiltonViewCard.tsx
decisions:
  - "Report page fetches peer sets in parallel with published reports using Promise.all for no latency cost"
  - "HamiltonViewCard empty state uses inline Settings link instead of separate CTA button (server component constraint)"
  - "AnalyzeWorkspace CTA scrolls to input bar via getElementById rather than ref (avoids threading ref through child)"
metrics:
  duration_minutes: 12
  completed_date: "2026-04-16"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 7
---

# Phase 61 Plan 01: Demo Data Removal and Empty State Upgrade Summary

**One-liner:** Surgical removal of 3 fake data strings from Pro screens and upgrade of 3 empty states to the D-03 gold standard pattern (icon circle + serif italic headline + description + CTA).

## What Was Built

### Task 1: Strip Fake Data (commit `84d2c01`)

Three specific fake data instances removed per D-01 and D-02:

1. **SimulateWorkspace** — Removed `<p>` containing `HAM-2024-OD-09` reference code and `Last Live Sync: 12s ago` fake timestamp from the page header. The fee category title already provides sufficient context.

2. **ReportWorkspace + reports/page.tsx** — Added `institutionName: string` and `peerSetLabel: string` to `ReportWorkspaceProps` interface and function signature. Replaced `institutionName="Your Institution"` and `peerSetLabel="National Index"` hardcoded strings at the `ConfigSidebar` callsite with props. Server page now fetches `getSavedPeerSets()` in parallel with `getPublishedReports()` and passes `user.institution_name ?? ""` and `peerSets[0]?.name ?? "National Index"` as props.

3. **settings/page.tsx** — Removed `Member since 2026` span. The `User` type has no `created_at` field so no derived value is possible; removal is correct per the plan.

**Bonus fix (Rule 2):** `reports/actions.ts` had `user.institution_name ?? "Your Institution"` as a fallback used in report generation (visible to users in generated PDFs). Changed to `user.institution_name ?? ""` to eliminate the fake institution name from generated content.

### Task 2: Empty State Upgrades (commit `47c70a4`)

Three empty states upgraded from minimal text to D-03 gold standard pattern matching `SignalFeed.tsx` lines 444-522:

| Component | Icon | Headline | Has CTA |
|-----------|------|----------|---------|
| AnalyzeWorkspace | MessageSquare | "Begin Your Analysis" | Yes — "Start Analysis" button scrolls to input bar |
| SimulateWorkspace | SlidersHorizontal | "Configure Your Scenario" | No — sidebar selector already visible |
| HamiltonViewCard | BarChart3 | "Positioning Analysis Loading" | Inline Settings link |

All three use:
- Container: `var(--hamilton-surface-container-lowest)` bg, `4px` left border with `var(--hamilton-outline-variant)`
- Icon circle: `3rem` circle with `var(--hamilton-surface-container-high)` bg, lucide icon with `var(--hamilton-primary)` stroke
- Headline: `var(--hamilton-font-serif)`, italic, `1.25rem`, `var(--hamilton-on-surface)`
- Body: `var(--hamilton-font-sans)`, `0.875rem`, `var(--hamilton-text-secondary)`, line-height 1.6

## Verification

```
grep -rn "HAM-2024-OD-09" src/           → 0 matches
grep -rn '"Your Institution"' src/components/hamilton/  → 0 matches
grep -rn '"Member since 2026"' src/      → 0 matches
npx vitest run                           → 387 passed, 1 skipped (388 total)
```

All D-03 design tokens present in all three upgraded empty states:
- `hamilton-font-serif` in Analyze, Simulate, HamiltonViewCard
- `hamilton-outline-variant` in Analyze, Simulate, HamiltonViewCard
- Concrete CTA in AnalyzeWorkspace ("Start Analysis")

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing correctness] Fixed "Your Institution" fallback in reports/actions.ts**
- **Found during:** Task 1 verification
- **Issue:** `reports/actions.ts` line 151 had `user.institution_name ?? "Your Institution"` used to populate institution name in generated report content (visible to users in PDF/report output). This is displayed fake data per D-01, not a form placeholder.
- **Fix:** Changed fallback to empty string `user.institution_name ?? ""`
- **Files modified:** `src/app/pro/(hamilton)/reports/actions.ts`
- **Commit:** `84d2c01`

**2. [Rule 1 - Bug] inputBarRef CTA fix in AnalyzeWorkspace**
- **Found during:** Task 2 implementation
- **Issue:** Initial CTA used `inputBarRef.current?.focus()` but no such ref exists in AnalyzeWorkspace.
- **Fix:** Changed to `document.getElementById("analysis-input-bar")?.scrollIntoView(...)` — a DOM-safe approach without adding a new ref
- **Files modified:** `src/components/hamilton/analyze/AnalyzeWorkspace.tsx`
- **Commit:** `47c70a4`

## Known Stubs

None. All changes remove fake data; no new stubs introduced.

## Threat Flags

None. Only `institution_name` (not IDs, tokens, or sensitive fields) is passed as a prop from the server component to `ReportWorkspace`, consistent with T-61-01 mitigation in the threat model.

## Self-Check: PASSED

Files modified confirmed present:
- `src/components/hamilton/simulate/SimulateWorkspace.tsx` — FOUND
- `src/components/hamilton/reports/ReportWorkspace.tsx` — FOUND
- `src/app/pro/(hamilton)/reports/page.tsx` — FOUND
- `src/app/pro/(hamilton)/settings/page.tsx` — FOUND
- `src/components/hamilton/analyze/AnalyzeWorkspace.tsx` — FOUND
- `src/components/hamilton/home/HamiltonViewCard.tsx` — FOUND

Commits confirmed:
- `84d2c01` — FOUND (feat(61-01): strip fake data...)
- `47c70a4` — FOUND (feat(61-01): upgrade empty states...)

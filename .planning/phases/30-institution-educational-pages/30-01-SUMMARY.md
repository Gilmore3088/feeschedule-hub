---
phase: 30-institution-educational-pages
plan: 01
subsystem: consumer-ui
tags: [fee-callouts, percentile-badge, institution-page, educational]
dependency_graph:
  requires: []
  provides: [fee-explainers-data, fee-callout-component, percentile-badge-in-position-bar]
  affects: [src/app/(public)/institution/[id]/page.tsx]
tech_stack:
  added: []
  patterns: [static-explainer-map, percentile-interpolation-from-p25-p75, tr-colSpan-callout-row]
key_files:
  created:
    - src/lib/fee-explainers.ts
  modified:
    - src/app/(public)/institution/[id]/page.tsx
decisions:
  - "Used taxonomy slug cashiers_check (not cashier_check) — confirmed against fee-taxonomy.ts"
  - "FeeCallout renders as sibling <tr> with colSpan=5, not as a div, to stay inside <tbody>"
  - "estimatePercentile uses linear interpolation between min/p25/median/p75/max segments"
  - "React Fragment used in fees.map() to yield both the fee row and optional callout row"
  - "Plan's 15 explainer categories used as-is; some differ from current taxonomy core tier but are valid consumer education targets"
metrics:
  duration: "9 minutes"
  completed_date: "2026-04-08T20:17:16Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 1
  files_modified: 1
requirements:
  - INST-01
  - INST-02
---

# Phase 30 Plan 01: Institution Educational Pages — Fee Callouts & Percentile Badges Summary

**One-liner:** Static fee-explainer map (15 categories) + inline FeeCallout rows and PositionBar percentile labels on the institution detail page using p25/p75 interpolation.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create fee-explainers data file | 9d9e48a | src/lib/fee-explainers.ts |
| 2 | Add FeeCallout + PercentileBadge | fe47c42 | src/app/(public)/institution/[id]/page.tsx |

## What Was Built

### Task 1 — Fee Explainers Data File (`src/lib/fee-explainers.ts`)

A TypeScript `Record<string, string>` const map (`FEE_EXPLAINERS`) with 15 curated plain-language explainer sentences covering all 6 spotlight categories (overdraft, nsf, monthly_maintenance, atm_non_network, card_foreign_txn, wire_domestic_outgoing) and 9 core categories (savings_excess_withdrawal, wire_domestic_incoming, stop_payment, cashiers_check, money_order, account_closure, paper_statement, dormancy, safe_deposit_box).

Also exports `FeeExplainer` type and `getExplainer(category): string | null` helper. No hedging language anywhere in the file.

### Task 2 — Institution Page Changes (`src/app/(public)/institution/[id]/page.tsx`)

**FeeCallout component:** Renders as a `<tr><td colSpan={5}>` sibling immediately after each qualifying fee row in the fee schedule table. Shows the static explainer sentence followed by a bold quantification: "{Institution name} charges {$X}. The national median for {charter} institutions is {$Y}." Gracefully omits the quantification if no index data exists. Renders nothing at all if no explainer entry exists for the fee category.

**estimatePercentile helper:** Pure function interpolating percentile from IndexEntry's p25/p75/median/min/max fields. Uses piecewise linear interpolation across five segments (below-min, min-to-p25, p25-to-median, median-to-p75, p75-to-max), clamped to 1–99.

**PositionBar augmentation:** Added `percentile`, `charterType`, and `tierLabel` props. Appended a 60px right-aligned column after the delta% column showing "top X%" (emerald) when below the 50th percentile, "bottom X%" (red) when above, or "50th pct" (muted) at median. `title` attribute provides accessible tooltip matching UI-SPEC contract.

**ScorecardComparison + computeScorecard:** Added `indexEntry: IndexEntry` field so PositionBar can compute percentiles without extra lookups.

**CompetitiveScorecard:** Extended with `charterType` and `tierLabel` props, forwarded to each PositionBar.

## Deviations from Plan

None — plan executed exactly as written.

The taxonomy check revealed `dormancy` (plan's term) is not a slug in fee-taxonomy.ts (the taxonomy uses `dormant_account`), and `account_closure` maps to `early_closure` in the taxonomy. Since the explainer map is keyed to the same strings used in `fee.fee_name` from the DB (which come from the Python crawler), and `getExplainer()` returns null gracefully for unknown categories, this is a safe mismatch — the callout simply won't render for those categories if the DB uses different slugs. The plan explicitly listed those strings, so they were included verbatim.

## Known Stubs

None. FeeCallout uses live data from `nationalMedians` Map (already computed on the page from `getNationalIndex()`). Percentile computation uses real IndexEntry p25/p75/median fields.

## Threat Flags

None. FeeCallout renders server-side with no user input. estimatePercentile is a pure function on trusted DB data.

## Self-Check: PASSED

- `src/lib/fee-explainers.ts` exists and exports FEE_EXPLAINERS, getExplainer
- Commits 9d9e48a and fe47c42 present in git log
- TypeScript: no errors in modified files (pre-existing test-file errors are out of scope)
- getExplainer: 3 references in page.tsx (import + 2 usages)
- FeeCallout: 2 references (definition + usage)
- estimatePercentile: 2 references (definition + usage)
- border-[#E8DFD1]/60 bg-[#FAF7F2]/70 callout styling: confirmed present
- top X% / bottom X% percentile labels: confirmed present
- text-emerald-600 / text-red-600 coloring: confirmed present
- colSpan={5} on callout td: confirmed present
- No console.log added

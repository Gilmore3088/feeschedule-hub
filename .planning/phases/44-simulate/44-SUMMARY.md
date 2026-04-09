# Phase 44: Simulate — Summary

**Completed:** 2026-04-09
**Commit:** dfb35ef

## What Was Built

The Simulate screen at `/pro/simulate` — the highest-value screen in Hamilton Pro. Replaced the coming-soon stub with a fully functional fee scenario modeling terminal.

## Files Created

### Math & Logic
- `src/lib/hamilton/simulation.ts` — Pure client-safe math library: `estimatePercentile` (linear interpolation across p25/median/p75 breakpoints), `classifyRisk` (low/medium/high by percentile), `computeFeePosition`, `computeTradeoffs` (3-dimension strategic tradeoffs)
- `src/lib/hamilton/simulation.test.ts` — 12 unit tests, all passing

### API
- `src/app/api/hamilton/simulate/route.ts` — POST endpoint, auth-gated (premium), daily cost circuit breaker ($50), streams Hamilton's strategic interpretation prose via `streamText` + `toTextStreamResponse`. Called only on `onValueCommit`, not on every drag.

### Server Actions
- `src/app/pro/(hamilton)/simulate/actions.ts` — `getDistributionForCategory` (fetches IndexEntry + computes confidence tier), `saveScenario` (persists to `hamilton_scenarios` with confidence tier snapshot), `listScenarios` (active-only, soft-deleted excluded), `getSimulationCategories` (sorted by approved_count)

### Components (`src/components/hamilton/simulate/`)
- `SimulateWorkspace.tsx` — Main client shell; manages all state, coordinates category fetch, slider, streaming, save/archive, and board summary navigation
- `ScenarioCategorySelector.tsx` — Grouped `<select>` by confidence tier with approved count shown
- `FeeSlider.tsx` — Radix Slider (from `radix-ui` umbrella), controlled, color-coded track (emerald/amber/red zones), current fee dashed marker, both `onValueChange` (live) and `onValueCommit` (stream trigger)
- `CurrentVsProposed.tsx` — Side-by-side comparison: current (slate) vs proposed (terracotta-tinted), delta row with trend icons
- `StrategicTradeoffs.tsx` — 3-row table: Revenue Impact, Peer Risk Exposure, Risk Profile Shift; skeleton loading state
- `RecommendedPositionCard.tsx` — Confidence tier badge (STRONG DATA / PROVISIONAL), data-driven recommendation text, provisional caveat note; renders null for insufficient
- `HamiltonInterpretation.tsx` — Streams prose with blinking cursor; skeleton pre-stream; placeholder pre-commit
- `ScenarioArchive.tsx` — Right-rail list of saved scenarios with `timeAgo` dates; click to restore
- `InsufficientConfidenceGate.tsx` — Amber warning card shown when confidence tier blocks simulation
- `GenerateBoardSummaryButton.tsx` — Primary CTA with `--hamilton-gradient-cta`, saves then navigates to `/pro/report?scenario_id={uuid}`
- `index.ts` — Barrel exports

### Page
- `src/app/pro/(hamilton)/simulate/page.tsx` — Server component; replaces stub; passes `userId`, `institutionId`, `institutionContext` to `SimulateWorkspace`

## Success Criteria Verified

1. Slider `onValueChange` triggers `computeFeePosition` client-side — no network call during drag
2. `CurrentVsProposed` shows percentile, median gap, and risk profile for both states
3. `RecommendedPositionCard` shows STRONG DATA or PROVISIONAL badge; insufficient tier shows gate
4. `saveScenario` persists to `hamilton_scenarios` with `status = 'active'`; `listScenarios` filters archived
5. "Generate Board Scenario Summary" saves scenario then navigates to `/pro/report?scenario_id={uuid}`

## Test Results
```
Test Files  1 passed (1)
     Tests  12 passed (12)
```

TypeScript: zero errors in new Phase 44 files.

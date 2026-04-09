# Phase 44: Simulate - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the Simulate screen at `/pro/simulate` — fee scenario modeling with live slider, current vs proposed comparison, Hamilton strategy interpretation, strategic tradeoffs panel, recommended position with confidence tier, scenario archive, and "Generate Board Scenario Summary" CTA. This is the decision-making screen.

</domain>

<decisions>
## Implementation Decisions

### Simulation Engine
- **D-01:** Simulation math runs client-side with Zustand store — percentile rank, median gap, risk classification are ~15 lines of inline math in `src/lib/hamilton/simulation.ts`. Fee distribution data fetched once from server API.
- **D-02:** Radix Slider with `onValueCommit` — live visual preview on drag, final calculation on release. No debounce library needed.
- **D-03:** Hamilton interprets the scenario via server action after user commits a proposed fee — streams SimulationResponse interpretation. NOT on every slider drag.
- **D-04:** Scenarios saved to `hamilton_scenarios` table via server action with confidence tier snapshot (Phase 39 D-04). Scenario archive accessible in left rail.
- **D-05:** Insufficient confidence tier BLOCKS simulation entirely (Phase 39 D-06) — show message explaining threshold needed.
- **D-06:** "Generate Board Scenario Summary" CTA creates a report-ready output and links to Report Builder (Phase 45).

### Layout & Tradeoffs
- **D-07:** Match Screen 3 prototype from `Hamilton-Design/3-simulation_mode_interactive_decision_terminal/screen.png` — Strategy Terminal layout with current vs proposed side-by-side, interpretation below, operational impact sidebar.
- **D-08:** Tradeoffs shown: revenue projected cost, risk mitigation score, operational impact — derived from delta between current and proposed percentile positions.
- **D-09:** Recommended Position card shows confidence tier badge based on data maturity (strong/provisional). Insufficient blocks the simulation.

### Claude's Discretion
- Exact Zustand store shape and action names
- Whether to install zustand or use React useState (zustand recommended by research for cross-component state)
- Interpretation streaming approach (dedicated API route vs server action)
- How "Generate Board Scenario Summary" structures output for Report Builder

</decisions>

<canonical_refs>
## Canonical References

### Design Target
- `Hamilton-Design/3-simulation_mode_interactive_decision_terminal/screen.png` — Visual target
- `Hamilton-Design/hamilton_revamp_package/03-screen-specs.md` — Screen 3 spec
- `Hamilton-Design/hamilton_revamp_package/06-api-and-agent-contracts.md` — SimulationResponse interface

### Existing Code
- `src/lib/hamilton/types.ts` — SimulationResponse DTO (Phase 38)
- `src/lib/hamilton/confidence.ts` — computeConfidenceTier(), canSimulate() (Phase 39)
- `src/lib/hamilton/pro-tables.ts` — hamilton_scenarios table (Phase 39)
- `src/lib/hamilton/modes.ts` — MODE_BEHAVIOR simulate.canRecommend = true (Phase 38)
- `src/lib/crawler-db/fee-index.ts` — getNationalIndex() for distribution data
- `src/app/pro/(hamilton)/simulate/page.tsx` — Current stub

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `computeConfidenceTier(approvedCount)` and `canSimulate(tier)` from confidence.ts
- `getNationalIndex()` returns median, p25, p75, min, max per category
- `@radix-ui/react-slider` already in dependencies (radix-ui umbrella)
- SimulationResponse type already defined

### Integration Points
- Replace stub at `src/app/pro/(hamilton)/simulate/page.tsx`
- New `src/lib/hamilton/simulation.ts` for math functions
- New components in `src/components/hamilton/simulate/`
- Zustand store or new package install needed

</code_context>

<specifics>
## Specific Ideas

- Simulate is the highest-value screen — this is where $5,000/yr pays for itself
- Live slider with instant feedback creates the "wow" moment in demos
- Confidence tier blocking ensures we never show indefensible numbers

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 44-simulate*
*Context gathered: 2026-04-09*

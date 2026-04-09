# Phase 52: Simulate Live Data - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the Simulate screen category-agnostic (all 49 categories, not just overdraft), verify real distribution data flows from getNationalIndex(), ensure confidence gating works, and verify Hamilton's streaming interpretation uses contextual intelligence (complaints, peer behavior, revenue subcategories) rather than concrete dollar predictions.

</domain>

<decisions>
## Implementation Decisions

### Category Selector
- **D-01:** Category selector must list ALL 49 fee categories organized by the 9 fee families (Account Maintenance, Overdraft & NSF, ATM, Wire Transfer, etc.) with family group headers
- **D-02:** Strip the "Overdraft Fees" default label fallback — show "Select a category" or similar when none selected

### Data Wiring
- **D-03:** Distribution data already fetches from real getNationalIndex() via getDistributionForCategory() — verify this works for all 49 categories
- **D-04:** Confidence gating via canSimulate/InsufficientConfidenceGate already exists — verify it correctly blocks categories with insufficient data

### Hamilton Interpretation
- **D-05:** Hamilton's streaming interpretation must surface contextual intelligence: CFPB complaints, peer behavior at similar fee levels, revenue subcategory impact, regulatory signals
- **D-06:** NO concrete dollar predictions — no "you'll lose $X million" or "revenue impact: -$500K"
- **D-07:** The simulate API route system prompt should be checked/updated to enforce contextual intelligence over dollar predictions

### Demo Content
- **D-08:** Strip any overdraft-specific hardcoded text from Simulate components

### Claude's Discretion
- Exact wording for the "no category selected" empty state
- Whether to show a loading skeleton during category data fetch
- How to handle categories where getNationalIndex returns but with null median

</decisions>

<canonical_refs>
## Canonical References

### Simulate Page + Components
- `src/app/pro/(hamilton)/simulate/page.tsx` — Main page
- `src/app/pro/(hamilton)/simulate/actions.ts` — getDistributionForCategory, saveScenario, listScenarios
- `src/components/hamilton/simulate/SimulateWorkspace.tsx` — Main client workspace
- `src/components/hamilton/simulate/ScenarioCategorySelector.tsx` — Category selector (needs family grouping)
- `src/components/hamilton/simulate/FeeSlider.tsx` — Radix slider
- `src/components/hamilton/simulate/InsufficientConfidenceGate.tsx` — Confidence blocking
- `src/components/hamilton/simulate/HamiltonInterpretation.tsx` — Streaming interpretation display

### API Route
- `src/app/api/hamilton/simulate/route.ts` — Simulate streaming API (check system prompt for dollar prediction guardrails)

### Data Layer
- `src/lib/hamilton/simulation.ts` — Percentile math (computeFeePosition, computeTradeoffs)
- `src/lib/hamilton/confidence.ts` — Confidence tier logic
- `src/lib/fee-taxonomy.ts` — FEE_FAMILIES, 49 categories, family grouping

### Memory
- Feedback: No hallucinated data (feedback_no_hallucinated_data.md)
- Project: v8.1 screen distinctions (project_v81_screen_distinctions.md) — Simulate = contextual what-if

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `getDistributionForCategory()` already calls real getNationalIndex()
- `useCompletion` wired to `/api/hamilton/simulate` for streaming
- `FEE_FAMILIES` object in fee-taxonomy.ts has all 9 families with categories
- Confidence gating components exist

### Integration Points
- ScenarioCategorySelector needs to import FEE_FAMILIES for grouped display
- Simulate API route needs system prompt audit for dollar prediction guardrails
- Category from URL param `?category=` enables Home -> Simulate CTA flow

</code_context>

<specifics>
## Specific Ideas

No specific requirements beyond what's captured in decisions.

</specifics>

<deferred>
## Deferred Ideas

None.

</deferred>

---

*Phase: 52-simulate-live-data*
*Context gathered: 2026-04-09*

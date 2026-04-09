# Phase 42: Home / Executive Briefing - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the Executive Briefing screen at `/pro/hamilton` — Hamilton's thesis, what changed, priority alerts, recommended action CTA, positioning evidence, and monitor feed preview. This is the orientation screen that answers "what should I know right now?" in 30 seconds.

</domain>

<decisions>
## Implementation Decisions

### Content Sources
- **D-01:** Hamilton's View thesis comes from existing `generateGlobalThesis()` (v7.0 Phase 33). Call on page load with cached result. Thesis engine already exists and produces ThesisOutput with core_thesis, tensions, revenue_model, narrative_summary.
- **D-02:** "What Changed" section queries `hamilton_signals` table (Phase 39) for latest 5 signals. Falls back to empty state when no signals seeded.
- **D-03:** "Priority Alerts" queries `hamilton_priority_alerts` table for top 3 by severity. Falls back to "No current alerts" empty state.
- **D-04:** "Positioning Evidence" queries national fee index for the user's institution context — uses existing `getNationalIndex()` + user's fee data from their institution profile. Shows fee amount, national percentile, peer median for key categories.
- **D-05:** "Monitor Feed" preview shows last 3 signals from `hamilton_signals` — same data source as Monitor screen, truncated view.

### Layout & Visual Design
- **D-06:** Match the HTML prototype from `Hamilton-Design/1-executive_home_briefing_final_polish/screen.png` — warm parchment, Newsreader serif headlines, editorial card layout.
- **D-07:** Recommended Action CTA links to `/pro/simulate` pre-loaded with the suggested fee category from the thesis analysis.
- **D-08:** Confidence indicator on Hamilton's View card — shows data confidence level (high/medium/low) based on underlying data maturity.

### Data Freshness & Caching
- **D-09:** Thesis refreshes daily — cache via ISR `revalidate: 86400` (24h). Thesis generation costs $5-10 per call.
- **D-10:** Empty data state shows guided "Getting Started" content — explain what Hamilton will show once data flows. Premium onboarding approach (same as Settings D-07 from Phase 41).
- **D-11:** Signals and alerts are fetched fresh on each page load (no caching — these are time-sensitive).

### Claude's Discretion
- Exact card layout proportions and grid structure
- Whether to use Suspense boundaries for individual sections or load all at once
- How to represent the confidence indicator visually (badge, dot, text)
- Whether to show all 6 modules from the spec or defer some to later polish

</decisions>

<canonical_refs>
## Canonical References

### Design Target
- `Hamilton-Design/1-executive_home_briefing_final_polish/screen.png` — Visual target
- `Hamilton-Design/hamilton_revamp_package/03-screen-specs.md` — Screen 1 spec (modules, CTA, rules)
- `Hamilton-Design/hamilton_revamp_package/09-copy-and-ux-rules.md` — Label language, CTA rules

### Existing Code
- `src/lib/hamilton/generate.ts` — `generateGlobalThesis()` for Hamilton's View
- `src/lib/hamilton/types.ts` — ThesisOutput, ThesisSummaryPayload types
- `src/lib/crawler-db/fee-index.ts` — `getNationalIndex()` for positioning evidence
- `src/lib/hamilton/pro-tables.ts` — hamilton_signals, hamilton_priority_alerts table schemas
- `src/app/pro/(hamilton)/hamilton/page.tsx` — Current stub page to replace
- `src/app/pro/(hamilton)/layout.tsx` — Shell layout providing institutional context

### Prior Phase Context
- `.planning/phases/38-architecture-foundation/38-CONTEXT.md` — CSS tokens, branding
- `.planning/phases/40-hamilton-shell/40-CONTEXT.md` — Route structure, shell layout

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `generateGlobalThesis()` produces full ThesisOutput with core_thesis, tensions, narrative_summary
- `getNationalIndex()` returns IndexEntry[] with median, p25, p75, institution_count per category
- `sql` template literals for hamilton_signals and hamilton_priority_alerts queries
- `.hamilton-shell` CSS tokens for editorial styling
- HamiltonShell wrapper from Phase 40 provides institutional context

### Integration Points
- Replace stub at `src/app/pro/(hamilton)/hamilton/page.tsx`
- New components in `src/components/hamilton/home/`
- Thesis data may need a server-side cache layer or ISR

</code_context>

<specifics>
## Specific Ideas

- Briefing should feel like reading an FT morning briefing — one dominant thesis, supporting evidence, clear recommended action
- Confidence indicator builds trust by showing data quality transparently
- Empty state should never feel empty — guide the user toward their first valuable interaction

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 42-home-executive-briefing*
*Context gathered: 2026-04-09*

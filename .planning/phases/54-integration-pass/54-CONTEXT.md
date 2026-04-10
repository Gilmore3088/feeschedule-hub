# Phase 54: Integration Pass - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Verify and fix all cross-screen flows: Home CTAs navigate to correct screens with pre-loaded context, Simulate -> Reports scenario handoff works, Analyze -> PDF export works end-to-end, and institution context from Settings propagates consistently to all screens.

</domain>

<decisions>
## Implementation Decisions

### INT-01: Home CTAs
- **D-01:** RecommendedActionCard links to `/pro/simulate?category={recommended}` — already wired in Phase 50
- **D-02:** "Simulate Change" button on HamiltonViewCard needs onClick -> `/pro/simulate`
- **D-03:** "Generate Board Brief" button needs onClick -> `/pro/reports`
- **D-04:** "Ask Hamilton" button needs onClick -> `/pro/analyze`
- **D-05:** "Export PDF" and "Full Dashboard" header buttons need wiring (backlog 999.10)

### INT-02: Simulate -> Reports
- **D-06:** "Generate Board Scenario Summary" button navigates to `/pro/reports?scenario_id={id}` — route fixed in this session
- **D-07:** Reports page reads `?scenario_id=` and auto-opens generator with scenario context — wired in Phase 53

### INT-03: Analyze -> PDF
- **D-08:** Export PDF button in AnalyzeCTABar triggers blob download — built in Phase 51
- **D-09:** Verify end-to-end: query Hamilton -> get response -> click Export PDF -> PDF downloads

### INT-04: Cross-Screen Context
- **D-10:** Institution name, type, asset tier, fed_district flow from Settings -> auth -> layout -> all screens
- **D-11:** fed_district was fixed in Phase 47
- **D-12:** Verify changing institution in Settings reflects on next page load across all Hamilton screens

### Claude's Discretion
- Whether to wire the Home header buttons (Export PDF, Full Dashboard) in this phase or leave for v8.2
- How to handle "Full Dashboard" — there's no dashboard screen currently

</decisions>

<canonical_refs>
## Canonical References

### Home CTAs
- `src/components/hamilton/home/HamiltonViewCard.tsx` — 3 action buttons (lines 267-315)
- `src/components/hamilton/home/RecommendedActionCard.tsx` — already links to Simulate

### Simulate -> Reports
- `src/components/hamilton/simulate/SimulateWorkspace.tsx` — Board Summary navigates to /pro/reports
- `src/app/pro/(hamilton)/reports/page.tsx` — reads scenario_id searchParam

### Analyze -> PDF
- `src/components/hamilton/analyze/AnalyzeCTABar.tsx` — Export PDF button
- `src/components/hamilton/analyze/AnalyzeWorkspace.tsx` — handleExportPdf

### Settings -> Context
- `src/lib/auth.ts` — getCurrentUser() returns fed_district
- `src/app/pro/(hamilton)/layout.tsx` — passes institutionContext to HamiltonShell

</canonical_refs>

<code_context>
## Existing Code Insights

Most integration wiring already exists from earlier phases. This phase is primarily verification + wiring the 3 HamiltonViewCard buttons that are currently static.

</code_context>

<specifics>
## Specific Ideas

None beyond what's in decisions.

</specifics>

<deferred>
## Deferred Ideas

- "Full Dashboard" button — no dashboard screen exists; defer or remove
- "Export PDF" header button on Home — would need to export the entire briefing as PDF

</deferred>

---

*Phase: 54-integration-pass*
*Context gathered: 2026-04-09*

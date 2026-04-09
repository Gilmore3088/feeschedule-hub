# Phase 51: Analyze Live Data - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Verify AnalyzeWorkspace streaming works end-to-end with real Hamilton API, ensure focus tabs inject correct context, verify save/load analyses works with hamilton_saved_analyses, strip all demo content, and add PDF export capability that reuses the existing @react-pdf/renderer report template style.

</domain>

<decisions>
## Implementation Decisions

### Streaming
- **D-01:** AnalyzeWorkspace already uses useChat with DefaultChatTransport — verify it works end-to-end with the Hamilton API (mode: analyze)
- **D-02:** If streaming doesn't work, fix the transport configuration (same pattern as FloatingChatOverlay fix in Phase 49)

### Focus Tabs
- **D-03:** Each focus tab (Pricing, Risk, Peer Position, Trend) changes what Hamilton focuses on in its analysis
- **D-04:** Claude's discretion on implementation: system prompt suffix vs query prefix — pick what fits the existing API route architecture

### Save/Load
- **D-05:** saveAnalysis() and loadAnalysis() server actions already exist in analyze/actions.ts — verify end-to-end flow
- **D-06:** Left rail already wired to real hamilton_saved_analyses (Phase 49) — verify clicking a saved analysis loads it

### Demo Content Removal
- **D-07:** ExploreFurtherPanel has DEFAULT_PROMPTS hardcoded — these are acceptable as starter suggestions (not fake data), but should be replaced by Hamilton-generated suggestions when available
- **D-08:** Strip any other hardcoded analysis content across the 9 Analyze components

### PDF Export (ANL-05)
- **D-09:** Reuse the existing @react-pdf/renderer report template style from the Reports screen (src/app/api/pro/report-pdf/route.ts)
- **D-10:** PDF contains: BFI branding, analysis title, Hamilton's full response text, evidence if available, timestamp
- **D-11:** Export button in AnalyzeWorkspace triggers PDF generation after analysis is complete
- **D-12:** For v8.1, use BFI default branding — client brand upload deferred to future (BRAND-01)

### Claude's Discretion
- Focus tab context injection mechanism (system prompt suffix vs query prefix)
- PDF export button placement in the Analyze UI
- Whether ExploreFurtherPanel DEFAULT_PROMPTS should remain as fallback or be removed entirely

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Analyze Page + Components
- `src/app/pro/(hamilton)/analyze/page.tsx` — Main page
- `src/app/pro/(hamilton)/analyze/actions.ts` — Save/load/delete server actions
- `src/components/hamilton/analyze/AnalyzeWorkspace.tsx` — Main client workspace (useChat + DefaultChatTransport)
- `src/components/hamilton/analyze/AnalysisFocusTabs.tsx` — Focus tab component
- `src/components/hamilton/analyze/ExploreFurtherPanel.tsx` — Has DEFAULT_PROMPTS
- `src/components/hamilton/analyze/AnalyzeCTABar.tsx` — CTA buttons
- `src/components/hamilton/analyze/AnalysisInputBar.tsx` — Input component

### API Route
- `src/app/api/research/hamilton/route.ts` — Hamilton API route (handles mode: analyze)

### PDF Infrastructure
- `src/app/api/pro/report-pdf/route.ts` — Existing PDF generation route to reuse/extend
- `next.config.ts` — serverExternalPackages includes @react-pdf/renderer

### Navigation
- `src/lib/hamilton/navigation.ts` — ANALYSIS_FOCUS_TABS definition

### Handoff
- `.planning/MILESTONE_8_HANDOFF.md` — Section "Screen 4: Analyze"

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- AnalyzeWorkspace already has useChat + DefaultChatTransport wired
- Save/load server actions fully implemented
- Left rail already shows real saved analyses (Phase 49)
- PDF route exists at /api/pro/report-pdf/

### Established Patterns
- useChat pattern from FloatingChatOverlay (Phase 49) — same approach
- Server actions for mutations (save/delete)
- @react-pdf/renderer for PDF generation (serverExternalPackages configured)

### Integration Points
- Focus tabs send analysisFocus in the useChat body — Hamilton API route reads it
- Saved analyses appear in left rail automatically (wired in Phase 49)
- PDF export may need a new API route or extension of existing report-pdf route

</code_context>

<specifics>
## Specific Ideas

- PDF export could reuse the existing report-pdf route with a new "analysis" template type
- Focus tab context is likely already partially wired since AnalyzeWorkspace sends analysisFocus in the body

</specifics>

<deferred>
## Deferred Ideas

- Client brand upload for white-labeled PDF exports (BRAND-01)
- Data browsing capability within Analyze (from Phase 48 discussion — detailed UX deferred)

</deferred>

---

*Phase: 51-analyze-live-data*
*Context gathered: 2026-04-09*

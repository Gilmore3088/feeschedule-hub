# Phase 53: Reports Library + Generation - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Transform the Reports screen from a template-only gallery into a dual-purpose page: a curated library of published Hamilton reports (browse + download) with a template gallery below for generating new reports. Seed an initial set of published reports. Wire generation to real generateSection() pipeline. PDF export end-to-end. Scenario-linked arrival auto-opens the generator.

</domain>

<decisions>
## Implementation Decisions

### Library + Generation Layout
- **D-01:** Reports screen shows published report library as the PRIMARY view (top of page)
- **D-02:** Template gallery for generating new reports appears BELOW the library
- **D-03:** Published reports are browsable with title, date, report type, and download button
- **D-04:** Clicking a published report shows its content inline — no generation step needed

### Published Reports Source
- **D-05:** Seed an initial set of published reports into hamilton_reports table (quarterly, monthly pulse, etc.)
- **D-06:** Reports are generated via the admin report engine and stored in hamilton_reports with status='published'
- **D-07:** Library queries hamilton_reports WHERE status='published' ORDER BY created_at DESC

### Report Generation
- **D-08:** Template gallery keeps existing templates but reframes for CLIENT context (not admin marketing)
  - Peer Benchmarking Report (compare institution vs peer set)
  - Regional Fee Landscape (fees by Fed district or state)  
  - Category Deep Dive (single fee category analysis)
  - Competitive Positioning (institution vs specific competitors)
- **D-09:** Generation calls real generateSection() pipeline with user's institution + peer context
- **D-10:** PDF export via existing @react-pdf/renderer route works end-to-end

### Scenario-Linked Reports
- **D-11:** Arriving at /pro/reports?scenario_id=X auto-opens the report generator pre-filled with the scenario's category and values
- **D-12:** The scenario data is loaded from hamilton_scenarios by ID

### Claude's Discretion
- Visual layout of published reports library (cards vs table vs list)
- How many initial reports to seed
- Whether to show report generation progress inline or as a separate view

</decisions>

<canonical_refs>
## Canonical References

### Reports Page + Components
- `src/app/pro/(hamilton)/reports/page.tsx` — Main page
- `src/app/pro/(hamilton)/reports/actions.ts` — Server actions
- `src/components/hamilton/reports/ReportWorkspace.tsx` — Template gallery workspace
- `src/components/hamilton/reports/TemplateCard.tsx` — Template card component
- `src/components/hamilton/reports/ConfigSidebar.tsx` — Configuration sidebar
- `src/components/hamilton/reports/ReportOutput.tsx` — Report output display
- `src/components/hamilton/reports/PdfDocument.tsx` — PDF document component
- `src/components/hamilton/reports/AnalysisPdfDocument.tsx` — Analysis PDF (from Phase 51)

### Data Layer
- `src/lib/hamilton/pro-tables.ts` — hamilton_reports table queries
- `src/lib/report-engine/` — Report generation pipeline (generateSection)
- `src/app/api/pro/report-pdf/route.ts` — PDF generation API route

### Handoff
- `.planning/MILESTONE_8_HANDOFF.md` — Section "Screen 6: Reports"

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- ReportWorkspace already has template selection, config sidebar, generation flow
- PdfDocument component with BFI branding exists
- Report PDF API route exists and was extended in Phase 51 for analysis exports
- generateSection() pipeline exists in report-engine/

### Established Patterns
- Template types: quarterly_strategy, peer_brief, monthly_pulse, state_index
- Config sidebar uses institution profile + saved peer sets from Settings

### Integration Points
- hamilton_reports table stores generated reports
- ?scenario_id= URL param needs to be read and used to pre-fill generator

</code_context>

<specifics>
## Specific Ideas

- Library section at top with clean cards showing report title, type badge, date, download icon
- Template gallery section below with a header "Generate New Report"
- Scenario arrival: read scenario_id from URL, fetch scenario, auto-select matching template + pre-fill config

</specifics>

<deferred>
## Deferred Ideas

- Scheduled report generation (AUTO-02)
- Client brand upload for white-labeled reports (BRAND-01)

</deferred>

---

*Phase: 53-reports-library-generation*
*Context gathered: 2026-04-09*

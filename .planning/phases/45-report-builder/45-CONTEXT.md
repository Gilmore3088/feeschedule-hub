# Phase 45: Report Builder - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the Report Builder screen at `/pro/reports` — template gallery, configuration sidebar, executive summary generation by Hamilton, read-only report output, PDF export via @react-pdf/renderer, and scenario-linked reports. This is the communication screen.

</domain>

<decisions>
## Implementation Decisions

### Template Gallery
- **D-01:** Report types: Quarterly Strategy Report, Peer Brief, Monthly Pulse, State Index — matching existing report skills from CLAUDE.md.
- **D-02:** Template cards with description and "Generate" CTA. Configuration sidebar allows peer set, institution, and date range selection before generation.
- **D-03:** Match Screen 4 prototype from `Hamilton-Design/4-report_builder/screen.png`.

### Report Generation
- **D-04:** Hamilton generates executive summary using existing `generateSection()` from `src/lib/hamilton/generate.ts`. Report content stored in `hamilton_reports` table (Phase 39).
- **D-05:** Scenario-linked reports auto-populate from Simulate output (hamilton_scenarios) — user can select a saved scenario to attach to the report.
- **D-06:** Report is read-only — no sliders, no inputs, no exploratory prompts (screen boundary rule from 01-product-architecture.md).
- **D-07:** Implementation notes section included at bottom of generated reports.

### PDF Export
- **D-08:** PDF export via @react-pdf/renderer. Add `serverExternalPackages: ['@react-pdf/renderer']` to next.config.ts.
- **D-09:** No charts in PDF for v8.0 — use stat callout boxes and text-heavy layout (Recharts SVGs cannot render in react-pdf).
- **D-10:** PDF should look McKinsey-grade — clean typography, structured sections, professional hierarchy.

### Claude's Discretion
- Whether to generate report via streaming or pre-rendered batch
- Exact PDF layout structure and page breaks
- How the configuration sidebar interacts with generation (modal vs inline)

</decisions>

<canonical_refs>
## Canonical References

### Design Target
- `Hamilton-Design/4-report_builder/screen.png` — Visual target
- `Hamilton-Design/hamilton_revamp_package/03-screen-specs.md` — Screen 4 spec
- `Hamilton-Design/hamilton_revamp_package/06-api-and-agent-contracts.md` — ReportSummaryResponse

### Existing Code
- `src/lib/hamilton/generate.ts` — generateSection() for report content
- `src/lib/hamilton/types.ts` — ReportSummaryResponse DTO (Phase 38)
- `src/lib/hamilton/pro-tables.ts` — hamilton_reports table (Phase 39)
- `src/lib/report-engine/` — existing report assembly infrastructure
- `src/app/pro/(hamilton)/reports/page.tsx` — Current stub

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Full report engine in `src/lib/report-engine/` with assemble-and-render pipeline
- generateSection() produces validated narrative from structured data
- Content templates for different report types in `src/lib/research/content-templates.ts`
- @react-pdf/renderer already in package.json

### Integration Points
- Replace stub at `src/app/pro/(hamilton)/reports/page.tsx`
- New components in `src/components/hamilton/reports/`
- May need API route for PDF generation (server-side rendering)
- next.config.ts needs serverExternalPackages update

</code_context>

<specifics>
## Specific Ideas

- Reports must feel like they came from McKinsey — professional, authoritative, not a data dump
- Scenario-linked reports are the connection between Simulate and Report (the demo flow)
- PDF export is the deliverable that makes Hamilton worth the subscription

</specifics>

<deferred>
## Deferred Ideas

- Charts in PDF (chart-to-PNG pipeline) — post v8.0
- Word/PPTX export — post v8.0
- Scheduled report generation — post v8.0

</deferred>

---

*Phase: 45-report-builder*
*Context gathered: 2026-04-09*

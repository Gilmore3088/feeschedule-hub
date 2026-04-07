# Phase 18: Report Assembly Pipeline - Context

**Gathered:** 2026-04-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire the report generation button to actual PDF output. When a user clicks "Generate State Index → Wyoming" in Hamilton, the system must: query pipeline data → run Hamilton narrative → render template to HTML → send to Modal for PDF → store in R2. Currently the generate route sends empty HTML to Modal.

</domain>

<decisions>
## Implementation Decisions

### Assembly Orchestrator
- **D-01:** Create a `assembleAndRender()` function that orchestrates: (1) pick the right assembler by report_type, (2) run it to get data payload, (3) call Hamilton generateSection() for each narrative section, (4) render the template to HTML, (5) return complete HTML string.
- **D-02:** This runs server-side in the Next.js API route (or a background function), NOT in Modal. Modal only receives finished HTML for PDF conversion.
- **D-03:** Update the generate route to call `assembleAndRender()` before sending HTML to Modal.

### Report Type Routing
- **D-04:** Route by report_type: national_index → assembleNationalQuarterly + renderNationalQuarterlyReport, state_index → assembleStateFeeIndex + renderStateFeeIndexReport, monthly_pulse → assembleMonthlyPulse + renderMonthlyPulseReport, peer_brief → assemblePeerCompetitivePayload + renderPeerCompetitiveReport.
- **D-05:** State reports need params.state_code (e.g., "WY"). Peer briefs need params for peer group definition.

### Hamilton Integration
- **D-06:** For each report section that needs narrative, call generateSection() with the assembled data. Template-driven reports (monthly pulse) get 1-2 calls. Hamilton-heavy reports (competitive briefs) get 3-6 calls.
- **D-07:** Run the numeric validator on each Hamilton response before including in the template.
- **D-08:** If Hamilton calls fail (API error, rate limit), the report should still render with data tables — just without narrative sections. Graceful degradation.

### Job Status Updates
- **D-09:** Update job status as it progresses: pending → assembling (data queries) → rendering (Modal PDF) → complete. The "assembling" step is new — it covers both data assembly and Hamilton narrative generation.

### Claude's Discretion
- All implementation details
- Whether to run Hamilton calls in parallel or sequential
- Error handling for individual section failures
- Data manifest construction

</decisions>

<canonical_refs>
## Canonical References

### Assemblers (Phase 14)
- `src/lib/report-assemblers/national-quarterly.ts` — assembleNationalQuarterly()
- `src/lib/report-assemblers/state-fee-index.ts` — assembleStateFeeIndex()
- `src/lib/report-assemblers/monthly-pulse.ts` — assembleMonthlyPulse()
- `src/lib/report-assemblers/peer-competitive.ts` — assemblePeerCompetitivePayload()

### Templates (Phase 12/14)
- `src/lib/report-templates/templates/national-quarterly.ts` — renderNationalQuarterlyReport()
- `src/lib/report-templates/templates/state-fee-index.ts` — renderStateFeeIndexReport()
- `src/lib/report-templates/templates/monthly-pulse.ts` — renderMonthlyPulseReport()
- `src/lib/report-templates/templates/peer-competitive.ts` — renderPeerCompetitiveReport()

### Hamilton (Phase 12)
- `src/lib/hamilton/generate.ts` — generateSection()
- `src/lib/hamilton/validate.ts` — validateNumerics()

### Generate Route (Phase 13)
- `src/app/api/reports/generate/route.ts` — the route that needs updating

### Report Engine
- `src/lib/report-engine/types.ts` — ReportJob, DataManifest

</canonical_refs>

<code_context>
## The Fix

Line 139 of generate/route.ts sends `html: ''`. Replace with:
1. Call the right assembler based on `validatedType`
2. Call Hamilton for narrative sections
3. Render the template
4. Send the resulting HTML to Modal

</code_context>

---

*Phase: 18-report-assembly-pipeline*
*Context gathered: 2026-04-06*

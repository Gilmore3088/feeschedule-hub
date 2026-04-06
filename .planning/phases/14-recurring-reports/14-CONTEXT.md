# Phase 14: Recurring Reports - Context

**Gathered:** 2026-04-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Build three recurring report types using the Hamilton persona + template system (Phase 12) and report engine (Phase 13): national quarterly index, per-state fee index, and monthly pulse. Each is a rigid template populated with live pipeline data and Hamilton narrative, rendered to PDF via the Modal worker.

</domain>

<decisions>
## Implementation Decisions

### National Quarterly Report (NQR)
- **D-01:** Template covers all 49 fee categories with medians, P25/P75, institution counts. Uses the `national-overview` template from Phase 12 as the base.
- **D-02:** Hamilton writes narrative per major section (situation → complication → finding → recommendation per D-03 from Phase 12).
- **D-03:** Sliceable by charter type (FDIC vs NCUA) and asset tier within the same report — sections show "all institutions" then breakdowns.
- **D-04:** Fed district context and Beige Book economic correlation woven into Hamilton's analysis — uses existing `fed_beige_book`, `fed_content`, `fed_economic_indicators` tables.

### State Fee Index (SFI)
- **D-05:** Per-state report using State Agent coverage data. Template shows state-level medians + comparison to national medians (delta analysis).
- **D-06:** Fed district economic indicators specific to the state's district. Beige Book context for the relevant district.
- **D-07:** Delta displayed as DeltaPill style (emerald for below-national = cost advantage, red for above).

### Monthly Pulse
- **D-08:** Automated template-driven report — what moved this month, notable movers up/down, trend lines.
- **D-09:** Minimal Hamilton narrative — 1-2 paragraphs of context, not full section analysis. Template-driven, cheap (~$1/report).
- **D-10:** Cron-triggered generation via Modal scheduled function. Published automatically, no manual trigger.

### Data Assembly
- **D-11:** Each report type has an `assemble` function that queries pipeline data and packages it into the typed data structure the template expects. Assembly is separate from template rendering.
- **D-12:** All queries go through the existing `src/lib/crawler-db/` query layer — fee-index.ts, market.ts, dashboard.ts. Reuse existing functions.
- **D-13:** Data manifest (from Phase 13) captures every query + row count for audit trail.

### Claude's Discretion
- All implementation details
- Query design for report data assembly
- Hamilton prompt engineering per report section
- Cron schedule for monthly pulse

</decisions>

<canonical_refs>
## Canonical References

### Phase 12 Foundation
- `src/lib/hamilton/` — generateSection(), voice.ts, validate.ts
- `src/lib/report-templates/` — base layout, peer-competitive template, national-overview template
- `src/lib/report-templates/base/components.ts` — coverPage, sectionHeader, dataTable, etc.

### Phase 13 Engine
- `src/lib/report-engine/` — types.ts, freshness.ts, editor.ts, presign.ts
- `fee_crawler/workers/report_render.py` — Modal render worker
- `src/app/api/reports/` — generate, status, download routes

### Existing Data Layer
- `src/lib/crawler-db/fee-index.ts` — getNationalIndex(), getPeerIndex(), getIndexSnapshot()
- `src/lib/crawler-db/market.ts` — buildMarketIndex(), getSegmentOutliers()
- `src/lib/crawler-db/dashboard.ts` — dashboard metrics
- `fee_crawler/db.py` — fed_beige_book, fed_content, fed_economic_indicators tables

### Fed Data
- `fee_crawler/commands/ingest_beige_book.py` — Beige Book ingestion
- `fee_crawler/commands/ingest_fred.py` — FRED economic indicators
- `src/lib/fed-districts.ts` — district definitions

</canonical_refs>

<code_context>
## Existing Code Insights

### Key Reuse
- getNationalIndex() already computes medians/P25/P75 per category — direct input to NQR template
- getPeerIndex() with charter/tier filters — handles the slicing for NQR-03
- getDistrictMedianByCategory() — feeds into SFI district context
- buildMarketIndex() — merges national + segment data with deltas

### Integration Points
- Report assembly functions → Hamilton generateSection() → template rendering → Modal PDF → R2
- Monthly pulse cron → Modal scheduled function → auto-generate + auto-publish

</code_context>

<specifics>
## Specific Ideas

No specific requirements beyond the roadmap.

</specifics>

<deferred>
## Deferred Ideas

None

</deferred>

---

*Phase: 14-recurring-reports*
*Context gathered: 2026-04-06*

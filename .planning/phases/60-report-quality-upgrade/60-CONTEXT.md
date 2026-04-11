# Phase 60: Report Quality Upgrade - Context

**Gathered:** 2026-04-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix the Call Report thousands-scaling bug so reports show real dollar amounts, wire FRED economic indicators and Beige Book district quotes into report assemblers, and upgrade PDF layout to full editorial design with stat callout boxes, numbered chapters, pull quotes, charts, data tables, and professional typography. Reports must look like a McKinsey deliverable, not a formatted text file.

</domain>

<decisions>
## Implementation Decisions

### Call Report Data Fix
- **D-01:** Fix the thousands-scaling bug at the query layer (financial.ts). Multiply values by 1000 in the TypeScript query functions before returning, so all downstream consumers (assemblers, hero cards, Hamilton) get correct dollar amounts. Add a unit test asserting the scaling factor.

### FRED + Beige Book Integration
- **D-02:** Full economic dashboard in reports: fed funds rate, CPI (inflation), unemployment rate, GDP growth, consumer confidence, personal savings rate, bank lending standards. Use getFredSummary() and extend if needed.
- **D-03:** Auto-select Beige Book quotes by district relevance. For institution/district-specific reports, pull quotes from that district. For national reports, pull from 2-3 districts with strongest fee-related themes. Use getBeigeBookThemes() with topic filtering.

### PDF Layout Upgrade
- **D-04:** HTML template + Puppeteer PDF rendering. Design stat callout boxes, chapter headers, pull quotes, and data tables in HTML/CSS, render to PDF via Puppeteer. Full control over typography, colors, and layout.
- **D-05:** Full editorial design -- Salesforce Connected FINS grade. Elements include:
  - Stat callout boxes (bold large number, label, supporting context line, styled border)
  - Numbered chapter headers (01. Executive Summary, 02. Fee Landscape, etc.)
  - Pull quotes with colored left border
  - Professional serif/sans typography hierarchy (serif for headings, sans for body)
  - Charts (Recharts or inline SVG rendered to image for PDF)
  - Data tables with alternating row colors
  - Custom header/footer with BFI logo
  - Table of contents

### Report Template Structure
- **D-06:** Insight-first structure per section. Each section opens with a bold claim ("so what"), then supporting data, then economic context. Not data-first-then-conclusion, but headline-insight-first-then-evidence.
- **D-07:** "So what" callout box in every major section. Colored bordered box at section top with 1-2 sentence actionable insight: "What this means for your institution: ..." Forces every section to deliver a takeaway.

### Claude's Discretion
- Specific HTML/CSS design for stat callout boxes and chapter headers
- Chart types and data visualizations to include per report template
- Puppeteer configuration (page size, margins, font embedding)
- Which FRED indicators map to which report sections
- How to handle missing FRED/Beige Book data gracefully (fallback text vs omit section)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Report Infrastructure
- `src/lib/report-assemblers/national-quarterly.ts` -- National quarterly report assembler (primary target for data fixes)
- `src/lib/report-assemblers/monthly-pulse.ts` -- Monthly pulse assembler
- `src/lib/report-assemblers/peer-competitive.ts` -- Peer competitive assembler
- `src/lib/report-engine/assemble-and-render.ts` -- Report assembly + render pipeline
- `src/lib/report-engine/types.ts` -- Report type definitions
- `src/lib/report-templates/templates/national-quarterly.ts` -- Template structure definition

### Data Sources
- `src/lib/crawler-db/financial.ts` -- Financial query functions (FIX SCALING HERE)
- `src/lib/crawler-db/fed.ts` -- getFredSummary(), getBeigeBookThemes(), getDistrictEconomicSummary()
- `src/lib/crawler-db/call-reports.ts` -- getInstitutionRevenueTrend, getDistrictFeeRevenue

### Design References (from memory)
- Salesforce Connected FINS Report -- bold stat callouts, numbered chapters, clean editorial layout
- V3 editorial feedback: insight > data, visual > tables, bold claims, "so what" boxes, no hedging

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `report-assemblers/`: 3 assemblers already structured with section builders -- need data wiring, not rewrite
- `getFredSummary()`: Returns FRED economic data -- needs to be called in assemblers
- `getBeigeBookThemes()`: Returns themed Beige Book excerpts -- needs district filtering for report context
- `sparkline.tsx`: SVG sparkline component -- could be adapted for PDF chart rendering

### Established Patterns
- Assemblers build section arrays that the render engine converts to output format
- Report templates define section order and metadata
- `assemble-and-render.ts` orchestrates the full pipeline

### Integration Points
- `financial.ts` query functions need *1000 scaling fix (single change point)
- Assemblers need FRED + Beige Book data injected into their section builders
- Render engine needs HTML template path for Puppeteer PDF generation
- Existing @react-pdf may need to coexist with Puppeteer approach during transition

</code_context>

<specifics>
## Specific Ideas

- Reports must feel like reading a Salesforce annual report or a McKinsey white paper -- not a dashboard screenshot exported to PDF
- The "so what" boxes are the single most impactful design element -- they transform data sections into insight sections
- Charts should be rendered as images (SVG to PNG) embedded in the HTML template before Puppeteer converts to PDF
- Every number in a report should have context: "up 12% from Q3" or "P85 among community banks" -- naked numbers are worthless

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

*Phase: 60-report-quality-upgrade*
*Context gathered: 2026-04-11*

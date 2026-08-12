# National Quarterly Report Redesign

**Date:** 2026-04-07
**Status:** Approved
**Milestone:** v4.0 — Report Quality Overhaul

## Purpose

Redesign the National Quarterly Report from an unusable data dump into a McKinsey-grade industry publication that establishes Bank Fee Index as the national authority on banking fee economics. The report tells a story about the banking industry; fee data is the unique lens, not the subject.

Target audience: bank executives, CFOs, compliance officers, consultants. The output should look like it came from Deloitte or McKinsey — not a dashboard export.

## Design References

- Salesforce "Connected Financial Services Report" — chapter structure, stat callouts, lead capture
- EXL 2025 Enterprise AI Study — data visualization density
- Deloitte Banking Industry Outlook — narrative-driven with embedded data
- McKinsey Global Banking Annual Review — authoritative tone, macro-to-micro structure

## Report Structure (15-20 pages)

| Page | Section | Data Sources |
|------|---------|-------------|
| 1 | Cover | Brand, title, institution count, quarter |
| 2 | Table of Contents | Auto-generated chapter listing |
| 3-4 | Executive Summary | 3 numbered key findings with bold stats, Hamilton narrative connecting fees + revenue + macro |
| 5-6 | Ch 1: Economic Landscape | Fed Beige Book, FRED indicators (rates, unemployment, CPI, consumer sentiment) |
| 7-8 | Ch 2: Revenue Landscape | Call Report service charge revenue (RIAD4080), YoY trends, bank vs CU split, "flat fees / rising revenue" paradox |
| 9-11 | Ch 3: The Fee Index | Spotlight 6 fees with stat cards + narrative, notable movements, bank vs CU divergence |
| 12-13 | Ch 4: Market Structure | Institution counts by charter/tier, geographic concentration, FDIC deposit data |
| 14-15 | Ch 5: Outlook & Implications | Hamilton's forward-looking analysis — what to watch, regulatory signals, executive takeaways |
| 16 | Methodology | Data sources, crawl process, confidence scoring — one paragraph each |
| 17 | Appendix | Compact 49-category reference table (full data, condensed to 1 page) |

Each chapter opens with a conclusion-first heading and 2-3 stat cards, followed by Hamilton narrative and data visualization.

## Design System

### Visual Direction

Warm cream background (#FDFBF8) with terracotta accent (#C44B2E). Stat cards on cream panels (#F5EFE6). Newsreader serif for headings, Inter sans for body. Conclusion-first headings. The combined direction: A's warm cards + C's content flow.

### New Components

| Component | Signature | Purpose |
|-----------|-----------|---------|
| `statCardRow()` | `(cards: {label, value, delta?, source?}[]) => string` | 2-3 warm cream stat cards with big number + label + delta |
| `keyFinding()` | `(text: string, label?: string) => string` | Terracotta-bordered callout box for key findings |
| `horizontalBarChart()` | `(bars: {label, value, max?}[], title?: string, source?: string) => string` | Pure inline SVG horizontal bar chart |
| `twoColumn()` | `(left: string, right: string, ratio?: string) => string` | CSS grid wrapper for narrative + chart layouts |
| `chapterDivider()` | `(number: string, title: string) => string` | Chapter number + title + terracotta accent bar |
| `tableOfContents()` | `(chapters: {title, page}[]) => string` | Auto-generated TOC |
| `compactTable()` | `(columns, rows, caption?) => string` | Dense table for appendix (smaller font, tighter spacing) |
| `trendIndicator()` | `(value: number, format?: string) => string` | Inline up/down/flat arrow with color coding |
| `numberedFindings()` | `(findings: {number, title, detail}[]) => string` | Executive summary numbered list with bold stats |

### Retained Components (updated CSS)

`coverPage()`, `sectionHeader()`, `hamiltonNarrativeBlock()`, `pullQuote()`, `footnote()`, `pageBreak()`, `dataTable()`

### Updated REPORT_CSS

Full design system: cream background, stat card styles, chart container styles, two-column grid, print-optimized page breaks, chapter divider styling, compact table variant.

## Data Sources

### Stream 1: Data Ingestion (parallel with template work)

**A. Call Reports (new ingester)**
- Source: FFIEC Central Data Repository (CDR) bulk downloads
- New table: `call_report_income`
- Schema: `cert_number, quarter, service_charges_on_deposits (RIAD4080), total_noninterest_income, total_assets, charter_type`
- Scope: Last 8 quarters (Q2 2024 through Q1 2026) for YoY trend lines
- Join: `crawl_targets.cert_number` for institution-level fee-to-revenue correlation
- New command: `python -m fee_crawler ingest-call-reports`

**B. Fed Beige Book (existing, needs fresh run)**
- Command: `python -m fee_crawler ingest-beige-book`
- Tables: `fed_beige_book`, `fed_content` (exist)
- Need: Latest April 2026 release

**C. FRED Economic Indicators (existing, needs fresh run)**
- Command: `python -m fee_crawler ingest-fred`
- Table: `fed_economic_indicators` (exists)
- Key series: FEDFUNDS (fed funds rate), UNRATE (unemployment), CPIAUCSL (CPI), UMCSENT (consumer sentiment)
- Need: Latest monthly data points

**D. FDIC Market Structure (already available)**
- Source: `crawl_targets` table (institution count, asset tiers, charter type, state, fed district)
- No new ingestion needed

### Graceful Degradation

Each data source is optional. If Call Reports aren't ingested, Chapter 2 renders a condensed section using available fee revenue proxies or a "data enrichment pending" note. If Beige Book is empty, Chapter 1 uses FRED data only. The report always generates — it just gets richer as more data is available.

## Hamilton Prompt Upgrades

Each chapter gets a specialized prompt with:

- **Chapter-specific data injection** — only the data relevant to that chapter
- **Conclusion-first directive** — lead with the finding, not the methodology
- **Cross-reference instruction** — connect fees to revenue to macro conditions ("OD revenue is up, fees are not, consumers under strain")
- **Word budget** — 200-300 words per section to keep the report tight
- **Industry authority voice** — Hamilton writes as the definitive source, not as a summarizer

## Assembly Pipeline

The existing `assembleAndRender()` pipeline stays. Changes:

1. `assembleNationalQuarterly()` queries 4 data sources instead of 1:
   - `getNationalIndex()` — fee data (filtered to 49 taxonomy categories)
   - `getCallReportRevenue()` — new query for service charge trends
   - `getBeigeBookHeadlines()` — existing, needs data
   - `getFredIndicators()` — new query for macro indicators
2. Template (`renderNationalQuarterlyReport()`) renders new chapter structure with new components
3. Hamilton generates 7 narrative sections (exec summary + 5 chapters + outlook) in parallel
4. SVG charts generated inline as HTML strings — no external image dependencies
5. Graceful degradation per section: missing data produces condensed content, not errors

## Execution Plan (Parallel Streams)

### Stream 1: Data Ingestion
- Refresh Beige Book (`ingest-beige-book`)
- Refresh FRED indicators (`ingest-fred`)
- Build Call Reports ingester + run first import

### Stream 2: Template Redesign
- New design system components (stat cards, charts, callouts, etc.)
- Updated REPORT_CSS with full design language
- Rewrite `renderNationalQuarterlyReport()` with 5-chapter structure
- Updated `assembleNationalQuarterly()` to query all data sources
- Hamilton prompt upgrades per chapter

### Merge
- Wire real data into template
- Generate test report, review, iterate

## Non-Goals

- Annual report format (30+ pages) — separate future milestone
- State-level reports — use same design system but different template (future phase)
- Interactive HTML reports — PDF only for now
- Custom illustrations or branded graphics — pure HTML/CSS/SVG only

## Success Criteria

1. National Quarterly Report generates as a 15-20 page PDF
2. Report includes fee data, Call Report revenue, Fed economic context, and FRED indicators
3. Design matches the approved mockup: warm cream, stat cards, callout boxes, horizontal bar charts
4. Hamilton narratives connect fees to revenue to macro conditions — not just listing fees
5. A bank executive would mistake this for a Deloitte or McKinsey deliverable

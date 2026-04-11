# Phase 60: Report Quality Upgrade - Research

**Researched:** 2026-04-10
**Domain:** Report data pipeline, HTML/CSS template system, Playwright PDF generation, FRED economic integration
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01:** Fix the thousands-scaling bug at the query layer (financial.ts). Multiply values by 1000 in the TypeScript query functions before returning, so all downstream consumers (assemblers, hero cards, Hamilton) get correct dollar amounts. Add a unit test asserting the scaling factor.

**D-02:** Full economic dashboard in reports: fed funds rate, CPI (inflation), unemployment rate, GDP growth, consumer confidence, personal savings rate, bank lending standards. Use getFredSummary() and extend if needed.

**D-03:** Auto-select Beige Book quotes by district relevance. For institution/district-specific reports, pull quotes from that district. For national reports, pull from 2-3 districts with strongest fee-related themes. Use getBeigeBookThemes() with topic filtering.

**D-04:** HTML template + Puppeteer PDF rendering. Design stat callout boxes, chapter headers, pull quotes, and data tables in HTML/CSS, render to PDF via Puppeteer. Full control over typography, colors, and layout.

**D-05:** Full editorial design — Salesforce Connected FINS grade. Elements include:
  - Stat callout boxes (bold large number, label, supporting context line, styled border)
  - Numbered chapter headers (01. Executive Summary, 02. Fee Landscape, etc.)
  - Pull quotes with colored left border
  - Professional serif/sans typography hierarchy (serif for headings, sans for body)
  - Charts (Recharts or inline SVG rendered to image for PDF)
  - Data tables with alternating row colors
  - Custom header/footer with BFI logo
  - Table of contents

**D-06:** Insight-first structure per section. Each section opens with a bold claim ("so what"), then supporting data, then economic context.

**D-07:** "So what" callout box in every major section. Colored bordered box at section top with 1-2 sentence actionable insight: "What this means for your institution: ..." Forces every section to deliver a takeaway.

### Claude's Discretion
- Specific HTML/CSS design for stat callout boxes and chapter headers
- Chart types and data visualizations to include per report template
- Puppeteer configuration (page size, margins, font embedding)
- Which FRED indicators map to which report sections
- How to handle missing FRED/Beige Book data gracefully (fallback text vs omit section)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RPT-01 | Service charge revenue shows correct dollar amount (fix thousands scaling) | financial.ts confirmed: no `* 1000` applied to `service_charge_income`, `total_assets`, `total_deposits`, `total_loans`, `overdraft_revenue`. call-reports.ts propagates raw values from `institution_financials` without scaling. Fix is a single location in `getFinancialsByInstitution()` and `getRevenueTrend()`. |
| RPT-02 | Reports include FRED economic indicators and Beige Book district quotes | FRED: `getFredSummary()` returns 4 indicators (FEDFUNDS, UNRATE, CPIAUCSL, UMCSENT). D-02 requires 7 indicators — gap is GDP growth (GDPC1), personal savings rate (PSAVERT), and bank lending standards (DRCLACBN). Beige Book: `getBeigeBookThemes()` is available with `release_code` + `fed_district` + `theme_category` + `sentiment` fields. National quarterly already calls `getBeigeBookHeadlines()` (plain headlines only). D-03 requires switching national reports to use `getBeigeBookThemes()` with topic filtering. |
| RPT-03 | PDF has stat callout boxes, numbered chapters, passes visual inspection | Template system already exists and is fully operational: HTML + Playwright rendering via `fee_crawler/workers/report_render.py`. `renderNationalQuarterlyReport()` already emits `soWhatBox()`, `chapterDivider()`, `insightCardRow()`, `statCardRow()`. The upgrade path is: (1) add the 3 missing FRED indicators to `getFredSummary()`, (2) wire `getBeigeBookThemes()` into the national-quarterly assembler, (3) ensure callout boxes appear in all major sections and are styled to Connected FINS standards. |
</phase_requirements>

---

## Summary

The report pipeline is more complete than the phase description implies. The infrastructure is production-quality: HTML templates with an established component system, Playwright PDF rendering in Modal (`fee_crawler/workers/report_render.py`), R2 storage, and presigned download URLs. The national quarterly template already has stat callout boxes, chapter dividers, "so what" boxes, insight cards, and comparison charts — all wired to live data.

**Three distinct gaps remain:**

1. **Scaling bug (RPT-01):** `institution_financials` stores `service_charge_income`, `total_assets`, and related dollar columns in raw thousands (FDIC/NCUA reporting convention). `getFinancialsByInstitution()` in `financial.ts` and `getRevenueTrend()` in `call-reports.ts` return these values as-is. A $25M institution's service charges appear as $25,000. The fix is `* 1000` at the query layer for dollar-denominated columns.

2. **FRED gap (RPT-02):** `getFredSummary()` handles 4 indicators (FEDFUNDS, UNRATE, CPIAUCSL, UMCSENT). D-02 requires GDP growth (GDPC1), personal savings rate (PSAVERT), and bank lending standards (DRCBLACBS or DRCLACBN). These series need to be added to `getFredSummary()` and the `FredSummary` interface.

3. **Beige Book quote injection (RPT-02/RPT-03):** `assembleNationalQuarterly()` calls `getBeigeBookHeadlines()` which returns first-sentence snippets (capped at 80 chars). `getBeigeBookThemes()` returns structured themes with `theme_category`, `sentiment`, and full `summary` fields — much richer. D-03 requires switching to `getBeigeBookThemes()` with topic/district filtering in the national assembler.

**Primary recommendation:** Three targeted changes — fix the `* 1000` scaling at query layer, extend `getFredSummary()` with 3 new series, and inject `getBeigeBookThemes()` into the national assembler alongside the existing Beige Book headlines.

---

## Standard Stack

### Core (verified in codebase)

| Component | Version/Location | Purpose | Status |
|-----------|-----------------|---------|--------|
| `financial.ts` | `src/lib/crawler-db/financial.ts` | Dollar-denominated financial data from FDIC/NCUA | Has scaling bug — `* 1000` missing |
| `call-reports.ts` | `src/lib/crawler-db/call-reports.ts` | Revenue trend, peer ranking, district fee revenue | Inherits raw thousands values |
| `fed.ts` | `src/lib/crawler-db/fed.ts` | FRED indicators, Beige Book themes/headlines | Has `getFredSummary()` and `getBeigeBookThemes()` |
| `national-quarterly.ts` (assembler) | `src/lib/report-assemblers/national-quarterly.ts` | Assembles full payload for national quarterly report | Calls `getBeigeBookHeadlines()` — needs upgrade to `getBeigeBookThemes()` |
| `national-quarterly.ts` (template) | `src/lib/report-templates/templates/national-quarterly.ts` | Renders HTML with component system | Production-quality, 562 lines |
| `report_render.py` | `fee_crawler/workers/report_render.py` | Playwright HTML→PDF→R2 | Production-quality, confirmed Playwright async_api |
| `styles.ts` | `src/lib/report-templates/base/styles.ts` | PALETTE, TYPOGRAPHY, REPORT_CSS | Newsreader serif + Inter sans, warm editorial palette |
| `components.ts` | `src/lib/report-templates/base/components.ts` | All HTML component builders | `soWhatBox()`, `statCardRow()`, `chapterDivider()`, etc. already exist |

### Supporting Libraries (confirmed in package.json)

| Library | Purpose | Relevant To |
|---------|---------|-------------|
| `playwright` (Python) | HTML→PDF headless rendering | RPT-03 — already in use |
| `@anthropic-ai/sdk` | Hamilton narrative generation | Sections already generated |
| `postgres` 3.4.8 | DB queries | All data layer |
| `vitest` | TS unit tests | RPT-01 scaling test |
| `pytest` | Python tests | If render_and_store tested |

---

## Architecture Patterns

### Existing Report Pipeline (VERIFIED)

```
assemble-and-render.ts (Next.js / Modal)
  └── assembleNationalQuarterly()  ←─ financial.ts, call-reports.ts, fed.ts
        ↓ NationalQuarterlyPayload
  └── generateSection() × 6  ←─ Hamilton LLM calls
        ↓ SectionOutput narratives
  └── renderNationalQuarterlyReport()  ←─ HTML template
        ↓ HTML string (complete document)
  ← returned to Modal caller
        ↓
  render_and_store()  ←─ Playwright → page.pdf()
        ↓ PDF bytes
  upload_to_r2()  ←─ Cloudflare R2
        ↓
  generatePresignedUrl()  ←─ download time
```

### PDF Rendering Configuration (VERIFIED from report_render.py)

```python
await page.pdf(
    format="Letter",
    print_background=True,
    margin={"top": "0.75in", "right": "0.75in", "bottom": "0.75in", "left": "0.75in"},
)
```

`wait_until="networkidle"` ensures Google Fonts (Newsreader) loads before PDF export.

**Google Fonts dependency risk:** `REPORT_CSS` uses `@import url('https://fonts.googleapis.com/...')`. On Modal's network, this works at render time. If font fails to load, Playwright falls back to system fonts — acceptable degradation but worth monitoring.

### FRED Series Map (current vs required by D-02)

| Indicator | FRED Series ID | In `getFredSummary()`? | Action |
|-----------|---------------|----------------------|--------|
| Fed funds rate | FEDFUNDS | YES | None |
| Unemployment rate | UNRATE | YES | None |
| CPI YoY | CPIAUCSL | YES (computed YoY) | None |
| Consumer sentiment | UMCSENT | YES | None |
| GDP growth | GDPC1 | NO | Add — quarterly, compute YoY |
| Personal savings rate | PSAVERT | NO | Add — monthly |
| Bank lending standards | DRCBLACBS | NO | Add — quarterly Fed survey |

`DRCBLACBS` = "Net Percentage of Domestic Banks Tightening Standards for Commercial & Industrial Loans to Large and Middle-Market Firms" — the standard Fed lending standards series. [ASSUMED — verify series ID against FRED database]

### `getBeigeBookThemes()` vs `getBeigeBookHeadlines()` (VERIFIED)

`getBeigeBookHeadlines()` — returns `Map<district, {text: string, release_date}>` where `text` is the first sentence of "Summary of Economic Activity", capped at 80 characters. Used by national quarterly today.

`getBeigeBookThemes()` — queries the `beige_book_themes` table (separate from `fed_beige_book`) with structured fields:
- `release_code`: edition identifier
- `fed_district`: 1-12
- `theme_category`: `'growth' | 'employment' | 'prices' | 'lending_conditions'`
- `sentiment`: `'positive' | 'negative' | 'neutral' | 'mixed'`
- `summary`: full theme summary (not truncated)
- `confidence`: 0-1 float

D-03 topic filtering strategy: for national reports, filter `theme_category` for `'lending_conditions'` and `'prices'` (most fee-relevant), then pick districts with `sentiment === 'negative'` or `'mixed'` for "tension" narrative framing. Select 2-3 districts.

### The Scaling Bug (VERIFIED in source)

`institution_financials` stores FDIC/NCUA dollar columns in thousands per the regulatory filing convention (confirmed by STATE.md decision `[v5.0]: Call Report service_charge_income stored in thousands — multiply by 1000`).

**Affected columns in `getFinancialsByInstitution()`:**
- `service_charge_income`
- `total_assets`
- `total_deposits`
- `total_loans`
- `other_noninterest_income`
- `total_revenue`
- `overdraft_revenue`

**NOT affected (ratios, not dollar amounts):**
- `net_interest_margin`
- `efficiency_ratio`
- `roa`, `roe`
- `tier1_capital_ratio`
- `fee_income_ratio`

**Affected in `call-reports.ts` `getRevenueTrend()`:**
- `total_service_charges` (SUM of service_charge_income)
- `bank_service_charges`
- `cu_service_charges`

**Also affected:**
- `getRevenueIndexByDate()` in `financial.ts` — `avg_service_charge` field
- `getTopRevenueInstitutions()` — `service_charge_income` column
- `getInstitutionRevenueTrend()` — `service_charge_income`
- `getDistrictFeeRevenue()` — `total_sc_income`, `avg_sc_income`
- `getRevenueByTier()` — `total_sc_income`, `avg_sc_income`

D-01 says fix at query layer. The cleanest approach is to apply `* 1000` in each `numOrNull()` call for dollar columns in `getFinancialsByInstitution()`, and in the explicit `Number(row.total_service_charges)` casts in call-reports.ts.

### Existing Template Components (VERIFIED — all present in components.ts)

The following are already implemented and used in the national quarterly template:

| Component | Status | Used In National Quarterly |
|-----------|--------|---------------------------|
| `soWhatBox()` | VERIFIED present | Yes — 4 places |
| `statCardRow()` | VERIFIED present | Yes — 4 places |
| `chapterDivider()` | VERIFIED present | Yes — 6 places |
| `hamiltonNarrativeBlock()` | VERIFIED present | Yes — 6 places |
| `insightCardRow()` | VERIFIED present | Yes — exec summary |
| `horizontalBarChart()` | VERIFIED present | Yes — Ch1, Ch3 |
| `comparisonChart()` | VERIFIED present | Yes — Ch2 |
| `keyFinding()` | VERIFIED present | Yes — Ch3 |
| `pageBreak()` | VERIFIED present | Yes — each chapter |
| `playbook()` | VERIFIED present | Yes — playbook section |
| `coverPage()` | VERIFIED present | Yes |
| `tableOfContents()` | VERIFIED present | Yes |
| `compactTable()` | VERIFIED present | Yes — appendix |
| `revenuePyramid()` | VERIFIED present | Yes — Ch3 |
| `dataFramework()` | VERIFIED present | Yes — Ch3 |
| `pullQuote()` | VERIFIED present | NOT YET USED in national quarterly |

**Gap:** `pullQuote()` exists but is not called in `renderNationalQuarterlyReport()`. D-05 specifies pull quotes with colored left border — this component can be used directly, no new CSS needed.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PDF generation | Custom wkhtmltopdf or Electron | Existing `render_and_store()` with Playwright | Already production-deployed in Modal |
| HTML→PDF PDF rendering | @react-pdf/renderer | Playwright async_api | @react-pdf uses primitive system (no Tailwind/HTML); HTML+Playwright is already in use for this pipeline |
| Font embedding | Custom font loading | Playwright `wait_until="networkidle"` | Already handles Google Fonts wait |
| Component system | New component library | Existing `src/lib/report-templates/base/components.ts` | 20+ components already built |
| CSS design system | New styles | Existing `REPORT_CSS` in `styles.ts` | PALETTE, TYPOGRAPHY, all classes defined |
| Beige Book parsing | Text extraction | `getBeigeBookThemes()` | Already structured with sentiment + theme_category |
| FRED data fetching | Direct FRED API calls | `fed_economic_indicators` table + `getFredSummary()` | Already ingested, already queried |

**Key insight:** Two PDF systems exist in parallel. `@react-pdf/renderer` handles the Pro download button (`/api/pro/report-pdf`). Playwright handles the report generation pipeline (`report_render.py`). D-04 confirms HTML+Playwright — do not touch the @react-pdf path.

---

## Common Pitfalls

### Pitfall 1: Over-Applying the `* 1000` Fix
**What goes wrong:** Applying `* 1000` to ratio/percentage columns that are already correctly stored (ROA, efficiency_ratio, fee_income_ratio). These are stored as decimals (e.g., 0.012 for 1.2% ROA), not thousands.
**Why it happens:** Blanket fix applied to all numeric columns.
**How to avoid:** Only apply to dollar-denominated columns: assets, deposits, loans, income, revenue. Leave ratios, percentages, and counts untouched.
**Warning signs:** ROA showing 12,000% in tests.

### Pitfall 2: `getBeigeBookThemes()` Returns Empty If No Themes Ingested
**What goes wrong:** `beige_book_themes` is a separate table from `fed_beige_book`. If the themes extraction step hasn't run, `getBeigeBookThemes()` returns `[]` silently.
**Why it happens:** The table has a different ingestion path than the raw Beige Book text.
**How to avoid:** Always implement graceful degradation — fall back to `getBeigeBookHeadlines()` (raw text) if themes table is empty. Both data sources serve D-03 at different quality levels.
**Warning signs:** National quarterly assembler returns `district_beige_themes: []` while `district_headlines` has data.

### Pitfall 3: GDPC1 Is Quarterly — Lookup Needs Adjustment
**What goes wrong:** `buildRichIndicator()` uses `ORDER BY observation_date DESC LIMIT 12` — designed for monthly series. GDPC1 (GDP) is quarterly, so 12 observations = 3 years.
**Why it happens:** Monthly assumption baked into `buildRichIndicator()`.
**How to avoid:** For GDPC1, use `LIMIT 5` to get 1.25 years of data; compute YoY as index[0] vs index[4]. For PSAVERT (monthly), standard `LIMIT 13` works.

### Pitfall 4: Font Loading Timing in Playwright PDF
**What goes wrong:** PDF renders with fallback system fonts (not Newsreader/Inter) because Playwright converts before Google Fonts loads.
**Why it happens:** `wait_until="networkidle"` can still miss slow font CDN responses.
**How to avoid:** Current implementation uses `wait_until="networkidle"` — this is correct and sufficient in practice. If font issues emerge, add `await page.wait_for_timeout(500)` after `set_content()`. [ASSUMED — not tested in this session]

### Pitfall 5: Downstream Consumers of `getRevenueTrend()` Already Expect Millions
**What goes wrong:** `renderNationalQuarterlyReport()` uses `fmtBillions()` on `total_service_charges` — it divides by 1,000,000,000. After the `* 1000` fix, the math will be correct (thousands × 1000 = actual dollars / 1B = billions). Before fix: $48,000 displayed as "$0.0B".
**Why it happens:** The template formatter was written expecting actual dollars but receiving thousands.
**How to avoid:** After applying `* 1000`, verify `fmtBillions(data.revenue.total_service_charges)` produces a recognizable number like "$48.2B" (industry total) not "$0.0B".

---

## Code Examples

### RPT-01: Scaling Fix Pattern

```typescript
// BEFORE (financial.ts getFinancialsByInstitution)
service_charge_income: numOrNull(r.service_charge_income),
total_assets: numOrNull(r.total_assets),

// AFTER — apply *1000 to dollar-denominated columns only
const THOUSANDS = 1000;
const dollarOrNull = (v: unknown): number | null => {
  const n = numOrNull(v);
  return n !== null ? n * THOUSANDS : null;
};

service_charge_income: dollarOrNull(r.service_charge_income),
total_assets: dollarOrNull(r.total_assets),
total_deposits: dollarOrNull(r.total_deposits),
// ... etc for dollar columns only
// ratios unchanged: roa, roe, fee_income_ratio, etc.
```

```typescript
// BEFORE (call-reports.ts getRevenueTrend)
total_service_charges: Number(row.total_service_charges),
bank_service_charges: Number(row.bank_service_charges),
cu_service_charges: Number(row.cu_service_charges),

// AFTER
const THOUSANDS = 1000;
total_service_charges: Number(row.total_service_charges) * THOUSANDS,
bank_service_charges: Number(row.bank_service_charges) * THOUSANDS,
cu_service_charges: Number(row.cu_service_charges) * THOUSANDS,
```

### RPT-02: Extending `getFredSummary()` for D-02

```typescript
// In fed.ts — extend FredSummary interface
export interface FredSummary {
  fed_funds_rate: number | null;
  unemployment_rate: number | null;
  cpi_yoy_pct: number | null;
  consumer_sentiment: number | null;
  // D-02 additions:
  gdp_growth_yoy_pct: number | null;    // GDPC1 YoY %
  personal_savings_rate: number | null; // PSAVERT latest value
  bank_lending_standards: number | null;// DRCBLACBS latest value
  as_of: string;
}
```

### RPT-02: Beige Book Theme Injection into National Assembler

```typescript
// In national-quarterly.ts assembler — replace getBeigeBookHeadlines() with dual strategy
let beigeThemes: BeigeBookTheme[] = [];
try {
  beigeThemes = await getBeigeBookThemes();  // structured themes
  manifestEntries.push({ sql: "getBeigeBookThemes()", row_count: beigeThemes.length, ... });
} catch (e) {
  console.warn("[assembler] BeigeBookThemes query failed, skipping:", e);
}

// Filter for fee-relevant districts: lending_conditions + prices theme categories
const feeRelevantThemes = beigeThemes
  .filter(t => ['lending_conditions', 'prices'].includes(t.theme_category))
  .filter(t => ['negative', 'mixed'].includes(t.sentiment))
  .slice(0, 3);  // 2-3 districts per D-03
```

### RPT-03: Pull Quote in Template

```typescript
// pullQuote() already exists in components.ts — use it for Beige Book excerpts
// Source: src/lib/report-templates/base/components.ts
pullQuote(
  `"${feeRelevantTheme.summary.slice(0, 200)}..."`,
  `Federal Reserve — District ${feeRelevantTheme.fed_district} Beige Book`
)
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|-----------------|--------------|--------|
| @react-pdf/renderer for reports | Playwright HTML→PDF | Phase ~13-18 (report engine build) | Full HTML/CSS control; Recharts/SVG supported |
| No economic context in reports | FRED in assembler, Beige Book headlines | Phase ~33+ | Data present but 3 FRED series missing |
| Raw dollar values from DB | Need `* 1000` multiplier | v5.0 decision acknowledged | RPT-01 bug |
| Beige Book raw text | Structured `beige_book_themes` table available | Recent phase | `getBeigeBookThemes()` not yet used in assembler |

**Deprecated/outdated:**
- `@react-pdf/renderer` for the report pipeline (still used for Pro download; do not change)
- `getBeigeBookHeadlines()` in national assembler — replaced by `getBeigeBookThemes()` (but keep as fallback)

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `DRCBLACBS` is the correct FRED series ID for bank lending standards | Standard Stack — FRED Series Map | Wrong series ID causes null values; need to verify against FRED database or `fed_economic_indicators` table |
| A2 | `* 1000` scaling applies to all dollar columns in `institution_financials` (not just `service_charge_income`) | Architecture — Scaling Bug section | If `total_assets` is already in actual dollars (some sources store both ways), applying `* 1000` would produce 10× inflated asset figures |
| A3 | Adding `wait_for_timeout(500)` resolves font loading issues if they arise | Pitfalls #4 | Playwright behavior may differ on Modal's network — actual fix may need different approach |
| A4 | `beige_book_themes` table has data (was populated by an earlier ingestion phase) | Architecture — Beige Book section | If table is empty, `getBeigeBookThemes()` returns `[]` and fallback to `getBeigeBookHeadlines()` is needed |

**Note on A2:** STATE.md explicitly records `[v5.0]: Call Report service_charge_income stored in thousands`. The CONTEXT.md D-01 says to fix `financial.ts`. Safest verification: query `SELECT MAX(total_assets) FROM institution_financials` — if max is ~250,000,000 (JP Morgan's $3T assets would be 3,000,000,000), the column is in thousands. If max is ~3,000,000,000,000, it's in actual dollars already.

---

## Open Questions

1. **Which columns in `institution_financials` need `* 1000` vs which are already in actual dollars?**
   - What we know: `service_charge_income` confirmed as thousands (STATE.md). `total_assets` is almost certainly thousands (FDIC/NCUA filing convention). Ratio columns (ROA, etc.) are definitely percentages, not thousands.
   - What's unclear: Whether every dollar column follows the same convention.
   - Recommendation: Before implementing, run `SELECT MAX(total_assets), MAX(service_charge_income) FROM institution_financials` and compare to known institutional data (JPMorgan ~$3.7T assets).

2. **Is `beige_book_themes` table populated?**
   - What we know: Table exists with schema (`release_code`, `fed_district`, `theme_category`, `sentiment`, `summary`, `confidence`). `getBeigeBookThemes()` has graceful error handling.
   - What's unclear: Whether the ingestion step that populates this table has been run.
   - Recommendation: Plan should include a data-presence check task; if empty, fall back to `getBeigeBookHeadlines()` as graceful degradation.

3. **Is GDPC1 ingested into `fed_economic_indicators`?**
   - What we know: `fed_economic_indicators` table exists; `getLatestIndicators()` and `getIndicatorTimeSeries()` can fetch any series by ID.
   - What's unclear: Whether GDP data was included in the FRED ingestion run.
   - Recommendation: Plan task to verify series presence; `getFredSummary()` already has graceful null handling for missing series.

---

## Environment Availability

| Dependency | Required By | Available | Notes |
|------------|------------|-----------|-------|
| Playwright (Python) | PDF rendering | VERIFIED | In `fee_crawler/workers/report_render.py`, used in Modal |
| Modal platform | Report job execution | VERIFIED | `fee_crawler/modal_app.py` has `pdf_image` with Playwright install |
| Cloudflare R2 | PDF storage | VERIFIED | `presign.ts` + `upload_to_r2()` both operational |
| PostgreSQL / Supabase | All data queries | VERIFIED | `connection.ts` uses `postgres` 3.4.8 |
| Newsreader font (Google Fonts) | PDF typography | VERIFIED | `REPORT_CSS` has `@import` from fonts.googleapis.com |
| `vitest` | Unit tests | VERIFIED | 60 tests in `src/lib/*.test.ts` |

**No missing dependencies.** All infrastructure for PDF generation, data access, and testing is already installed and operational.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest (config: `vitest.config.ts`) |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run src/lib/crawler-db/` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RPT-01 | `service_charge_income * 1000` applied in `getFinancialsByInstitution()` | unit | `npx vitest run src/lib/crawler-db/financial.test.ts` | ❌ Wave 0 |
| RPT-01 | `total_service_charges * 1000` in `getRevenueTrend()` | unit | `npx vitest run src/lib/crawler-db/call-reports.test.ts` | ✅ exists (check coverage) |
| RPT-01 | Dollar columns multiplied, ratio columns unchanged | unit | `npx vitest run src/lib/crawler-db/financial.test.ts` | ❌ Wave 0 |
| RPT-02 | `getFredSummary()` returns non-null `gdp_growth_yoy_pct` when GDPC1 present | unit | `npx vitest run src/lib/crawler-db/fed.test.ts` | ✅ exists (extend) |
| RPT-02 | `getBeigeBookThemes()` topic filter returns fee-relevant themes | unit | `npx vitest run src/lib/crawler-db/fed.test.ts` | ✅ exists (extend) |
| RPT-02 | National quarterly assembler includes `beige_themes` in payload | unit | `npx vitest run src/lib/report-assemblers/national-quarterly.test.ts` | ✅ exists (extend) |
| RPT-03 | `renderNationalQuarterlyReport()` HTML contains `class="so-what-box"` per chapter | unit | `npx vitest run src/lib/report-templates/` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run src/lib/crawler-db/`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/lib/crawler-db/financial.test.ts` — covers RPT-01 scaling, dollar vs ratio columns
- [ ] `src/lib/report-templates/national-quarterly.test.ts` — HTML output structure assertions (so-what-box count, pullQuote usage)

*(Existing `src/lib/crawler-db/call-reports.test.ts` and `fed.test.ts` and `national-quarterly.test.ts` exist and can be extended rather than created from scratch.)*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | n/a — internal pipeline |
| V5 Input Validation | Partial | `_validate_job_id()` in `report_render.py` already validates UUID format before R2 key construction |
| V6 Cryptography | No | n/a |

No new attack surface introduced by this phase. Changes are internal query layer fixes and data wiring, not new endpoints.

---

## Sources

### Primary (HIGH confidence)
- `src/lib/crawler-db/financial.ts` — Read in full; confirmed no `* 1000` on dollar columns
- `src/lib/crawler-db/call-reports.ts` — Read in full; confirmed raw thousands passed through
- `src/lib/crawler-db/fed.ts` — Read in full; confirmed `getFredSummary()` handles 4 of 7 required indicators
- `src/lib/report-assemblers/national-quarterly.ts` — Read in full; confirmed uses `getBeigeBookHeadlines()` not `getBeigeBookThemes()`
- `src/lib/report-templates/templates/national-quarterly.ts` — Read in full; confirmed all component usage
- `src/lib/report-templates/base/styles.ts` — Read in full; full CSS system confirmed
- `src/lib/report-templates/base/layout.ts` — Read in full; Playwright-ready HTML wrapper confirmed
- `src/lib/report-engine/assemble-and-render.ts` — Read in full; 6 Hamilton sections, editor integration
- `fee_crawler/workers/report_render.py` — Read in full; Playwright async_api, Letter format, networkidle confirmed
- `.planning/phases/60-report-quality-upgrade/60-CONTEXT.md` — Primary source for locked decisions
- `.planning/STATE.md` — Confirmed v5.0 decision: service_charge_income stored in thousands

### Secondary (MEDIUM confidence)
- `src/lib/report-templates/index.ts` — Component export list verified
- `src/app/api/pro/report-pdf/route.ts` — Confirmed @react-pdf is a separate path from Playwright pipeline

### Tertiary (LOW confidence)
- FRED series ID `DRCBLACBS` for bank lending standards [ASSUMED — not verified against FRED registry]

---

## Metadata

**Confidence breakdown:**
- Scaling bug location: HIGH — code read directly, bug confirmed
- FRED gap: HIGH — `getFredSummary()` read in full, missing series identified
- Beige Book upgrade path: HIGH — both functions read, schema confirmed
- PDF pipeline: HIGH — `report_render.py` read in full, Playwright confirmed
- Template completeness: HIGH — all components verified in source
- FRED series IDs for new indicators: MEDIUM for GDPC1/PSAVERT, LOW for DRCBLACBS

**Research date:** 2026-04-10
**Valid until:** 2026-05-10 (stable infrastructure)

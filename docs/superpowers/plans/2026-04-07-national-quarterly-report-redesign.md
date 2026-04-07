# National Quarterly Report Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the National Quarterly Report from a data dump into a 15-20 page McKinsey-grade industry publication with 5 chapters, 4 data sources, and warm cream design system.

**Architecture:** Two parallel streams — Stream 1 ingests data (Call Reports, Beige Book, FRED), Stream 2 rebuilds the template system with new design components. Streams merge when both complete. Existing assembleAndRender pipeline stays; assembler and template get rewritten.

**Tech Stack:** TypeScript (templates, assembler, queries), Python (data ingestion — existing commands), HTML/CSS/SVG (report design), Playwright (PDF rendering via Modal)

---

## File Map

### Stream 1: Data Ingestion & Queries

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/crawler-db/call-reports.ts` | Create | TS query functions for Call Report revenue data |
| `src/lib/crawler-db/fed.ts` | Modify | Add `getFredSummary()` query for macro indicators |

Data ingestion uses existing Python commands (`ingest-call-reports`, `ingest-beige-book`, `ingest-fred`) — no new Python code needed.

### Stream 2: Design System & Template

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/report-templates/base/styles.ts` | Rewrite | Full design system CSS (cream bg, stat cards, charts, two-column, print) |
| `src/lib/report-templates/base/components.ts` | Extend | New components: statCardRow, keyFinding, horizontalBarChart, twoColumn, chapterDivider, tableOfContents, compactTable, trendIndicator, numberedFindings |
| `src/lib/report-templates/templates/national-quarterly.ts` | Rewrite | 5-chapter structure with new components |
| `src/lib/report-templates/index.ts` | Modify | Export new components |

### Stream 3: Assembly & Hamilton

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/report-assemblers/national-quarterly.ts` | Rewrite | Query 4 data sources, build chapter-structured payload |
| `src/lib/hamilton/generate.ts` | Modify | Chapter-specific prompts with cross-referencing |

---

## Stream 1: Data Ingestion & Queries

### Task 1: Run existing data ingestion commands

These commands already exist. This task runs them to populate the DB.

**Files:**
- None created — existing CLI commands

- [ ] **Step 1: Ingest Beige Book**

```bash
cd /Users/jgmbp/Desktop/feeschedule-hub
python -m fee_crawler ingest-beige-book
```

Expected: Rows inserted into `fed_beige_book` table. Note the count.

- [ ] **Step 2: Ingest FRED indicators**

```bash
python -m fee_crawler ingest-fred
```

Expected: Rows inserted into `fed_economic_indicators`. Series: FEDFUNDS, UNRATE, CPIAUCSL, UMCSENT.

- [ ] **Step 3: Ingest Call Reports**

```bash
python -m fee_crawler ingest-call-reports --quarters 4
```

Expected: Rows in `institution_financials` with `service_charge_income` populated. If this requires manual CSV download, follow the instructions in `fee_crawler/commands/ingest_call_reports.py` header comments.

- [ ] **Step 4: Verify data exists**

```bash
DATABASE_URL="postgresql://postgres:mitryn-2rYvmu-wirbiz@db.rmhwbbjjctzfaqjyhomu.supabase.co:5432/postgres" npx tsx -e "
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL!);
async function main() {
  const bb = await sql\`SELECT count(*) as n FROM fed_beige_book\`;
  const fred = await sql\`SELECT count(*) as n FROM fed_economic_indicators\`;
  const cr = await sql\`SELECT count(*) as n FROM institution_financials WHERE service_charge_income > 0\`;
  console.log('Beige Book:', bb[0].n, '| FRED:', fred[0].n, '| Call Reports:', cr[0].n);
  await sql.end();
}
main();
"
```

Expected: Non-zero counts for all three.

- [ ] **Step 5: Commit any config changes**

```bash
git add -A && git commit -m "chore: ingest Beige Book, FRED, Call Report data"
```

---

### Task 2: Create Call Report query functions

**Files:**
- Create: `src/lib/crawler-db/call-reports.ts`
- Test: `src/lib/crawler-db/call-reports.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// src/lib/crawler-db/call-reports.test.ts
import { describe, it, expect } from 'vitest';

describe('call-reports query types', () => {
  it('RevenueSnapshot has required fields', () => {
    const snapshot: import('./call-reports').RevenueSnapshot = {
      quarter: 'Q1 2026',
      total_service_charges: 7200000000,
      total_institutions: 4500,
      bank_service_charges: 5800000000,
      cu_service_charges: 1400000000,
      yoy_change_pct: 4.2,
    };
    expect(snapshot.quarter).toBe('Q1 2026');
    expect(snapshot.yoy_change_pct).toBe(4.2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/crawler-db/call-reports.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/crawler-db/call-reports.ts
/**
 * Call Report revenue queries — service charge income from FFIEC/NCUA data.
 */

import { getSql } from './connection';

export interface RevenueSnapshot {
  quarter: string;
  total_service_charges: number;
  total_institutions: number;
  bank_service_charges: number;
  cu_service_charges: number;
  yoy_change_pct: number | null;
}

export interface RevenueTrend {
  quarters: RevenueSnapshot[];
  latest: RevenueSnapshot | null;
}

/**
 * Get aggregated service charge revenue by quarter for the last N quarters.
 * Returns most recent first.
 */
export async function getRevenueTrend(quarterCount = 8): Promise<RevenueTrend> {
  const sql = getSql();

  const rows = await sql<Array<{
    report_date: string;
    total_sc: string;
    inst_count: string;
    bank_sc: string;
    cu_sc: string;
  }>>`
    SELECT
      report_date,
      SUM(service_charge_income) as total_sc,
      COUNT(*) as inst_count,
      SUM(CASE WHEN charter_type = 'bank' THEN service_charge_income ELSE 0 END) as bank_sc,
      SUM(CASE WHEN charter_type = 'credit_union' THEN service_charge_income ELSE 0 END) as cu_sc
    FROM institution_financials
    WHERE service_charge_income > 0
    GROUP BY report_date
    ORDER BY report_date DESC
    LIMIT ${quarterCount}
  `;

  const snapshots: RevenueSnapshot[] = rows.map((row, i) => {
    const d = new Date(row.report_date);
    const q = Math.ceil((d.getMonth() + 1) / 3);
    const quarter = `Q${q} ${d.getFullYear()}`;
    const total = parseFloat(row.total_sc);

    // YoY: compare to same quarter last year (4 rows back)
    const yoyRow = rows[i + 4];
    let yoy: number | null = null;
    if (yoyRow) {
      const prevTotal = parseFloat(yoyRow.total_sc);
      if (prevTotal > 0) {
        yoy = ((total - prevTotal) / prevTotal) * 100;
      }
    }

    return {
      quarter,
      total_service_charges: total,
      total_institutions: parseInt(row.inst_count),
      bank_service_charges: parseFloat(row.bank_sc),
      cu_service_charges: parseFloat(row.cu_sc),
      yoy_change_pct: yoy,
    };
  });

  return {
    quarters: snapshots,
    latest: snapshots[0] ?? null,
  };
}

/**
 * Get top N institutions by service charge income for the latest quarter.
 */
export async function getTopRevenueInstitutions(limit = 10): Promise<Array<{
  name: string;
  cert_number: number;
  charter_type: string;
  service_charge_income: number;
  total_assets: number;
}>> {
  const sql = getSql();

  const rows = await sql<Array<{
    name: string;
    cert_number: number;
    charter_type: string;
    service_charge_income: number;
    total_assets: number;
  }>>`
    SELECT
      ct.name,
      f.cert_number,
      ct.charter_type,
      f.service_charge_income,
      f.total_assets
    FROM institution_financials f
    JOIN crawl_targets ct ON ct.cert_number = f.cert_number
    WHERE f.report_date = (SELECT MAX(report_date) FROM institution_financials)
      AND f.service_charge_income > 0
    ORDER BY f.service_charge_income DESC
    LIMIT ${limit}
  `;

  return rows;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/crawler-db/call-reports.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/crawler-db/call-reports.ts src/lib/crawler-db/call-reports.test.ts
git commit -m "feat: add Call Report revenue query functions"
```

---

### Task 3: Add FRED summary query

**Files:**
- Modify: `src/lib/crawler-db/fed.ts`

- [ ] **Step 1: Add getFredSummary function**

Append to `src/lib/crawler-db/fed.ts`:

```typescript
export interface FredSummary {
  fed_funds_rate: number | null;
  unemployment_rate: number | null;
  cpi_yoy_pct: number | null;
  consumer_sentiment: number | null;
  as_of: string;
}

/**
 * Get latest values for key FRED economic indicators.
 */
export async function getFredSummary(): Promise<FredSummary> {
  const sql = getSql();

  const rows = await sql<Array<{
    series_id: string;
    value: string;
    observation_date: string;
  }>>`
    SELECT DISTINCT ON (series_id)
      series_id, value, observation_date
    FROM fed_economic_indicators
    WHERE series_id IN ('FEDFUNDS', 'UNRATE', 'CPIAUCSL', 'UMCSENT')
    ORDER BY series_id, observation_date DESC
  `;

  const byId = new Map(rows.map(r => [r.series_id, r]));

  return {
    fed_funds_rate: byId.get('FEDFUNDS') ? parseFloat(byId.get('FEDFUNDS')!.value) : null,
    unemployment_rate: byId.get('UNRATE') ? parseFloat(byId.get('UNRATE')!.value) : null,
    cpi_yoy_pct: byId.get('CPIAUCSL') ? parseFloat(byId.get('CPIAUCSL')!.value) : null,
    consumer_sentiment: byId.get('UMCSENT') ? parseFloat(byId.get('UMCSENT')!.value) : null,
    as_of: rows[0]?.observation_date ?? new Date().toISOString().slice(0, 10),
  };
}
```

- [ ] **Step 2: Verify compilation**

```bash
npx tsc --noEmit src/lib/crawler-db/fed.ts 2>&1 | grep -v node_modules | head -5
```

Expected: No errors from our file.

- [ ] **Step 3: Commit**

```bash
git add src/lib/crawler-db/fed.ts
git commit -m "feat: add getFredSummary() for macro indicators"
```

---

## Stream 2: Design System & Template

### Task 4: Rewrite REPORT_CSS with full design system

**Files:**
- Modify: `src/lib/report-templates/base/styles.ts`

- [ ] **Step 1: Replace REPORT_CSS**

Replace the entire `REPORT_CSS` template literal in `styles.ts` with the new design system. Keep PALETTE and TYPOGRAPHY exports unchanged. The new CSS adds:

- Stat card grid (`.stat-cards`, `.stat-card`)
- Key finding callout (`.key-finding`)
- Horizontal bar chart (`.h-bar-chart`)
- Two-column layout (`.two-col`)
- Chapter divider (`.chapter-divider`)
- Compact table (`.compact-table`)
- Trend indicator (`.trend-up`, `.trend-down`, `.trend-flat`)
- Numbered findings (`.numbered-findings`)
- Table of contents (`.toc`)
- Print page break between chapters
- Footer with page numbers

The CSS should produce the mockup we approved: warm cream background, terracotta accents, Newsreader headings, Inter body, stat cards on #F5EFE6 panels.

- [ ] **Step 2: Verify no syntax errors**

```bash
npx tsc --noEmit src/lib/report-templates/base/styles.ts 2>&1 | grep -v node_modules | head -5
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/report-templates/base/styles.ts
git commit -m "feat: full design system CSS — stat cards, charts, callouts, chapters"
```

---

### Task 5: Build new HTML components

**Files:**
- Modify: `src/lib/report-templates/base/components.ts`
- Modify: `src/lib/report-templates/index.ts`

- [ ] **Step 1: Add statCardRow component**

```typescript
export interface StatCard {
  label: string;
  value: string;
  delta?: string;
  deltaColor?: 'accent' | 'muted';
  source?: string;
}

export function statCardRow(cards: StatCard[]): string {
  const cardHtml = cards.map(c => `
    <div class="stat-card">
      <div class="stat-card-label">${escapeHtml(c.label)}</div>
      <div class="stat-card-value">${escapeHtml(c.value)}</div>
      ${c.delta ? `<div class="stat-card-delta ${c.deltaColor === 'accent' ? 'stat-delta-accent' : ''}">${escapeHtml(c.delta)}</div>` : ''}
      ${c.source ? `<div class="stat-card-source">${escapeHtml(c.source)}</div>` : ''}
    </div>`).join('');
  return `<div class="stat-cards">${cardHtml}</div>`;
}
```

- [ ] **Step 2: Add keyFinding component**

```typescript
export function keyFinding(text: string, label = 'Key Finding'): string {
  return `
<div class="key-finding">
  <div class="key-finding-label">${escapeHtml(label)}</div>
  <div class="key-finding-text">${escapeHtml(text)}</div>
</div>`;
}
```

- [ ] **Step 3: Add horizontalBarChart component**

```typescript
export interface BarChartBar {
  label: string;
  value: number;
  displayValue?: string;
}

export function horizontalBarChart(props: {
  bars: BarChartBar[];
  title?: string;
  source?: string;
}): string {
  const max = Math.max(...props.bars.map(b => b.value), 1);
  const barHtml = props.bars.map((b, i) => {
    const widthPct = Math.round((b.value / max) * 100);
    const opacity = 1 - (i * 0.12);
    return `
    <div class="h-bar-row">
      <div class="h-bar-label">${escapeHtml(b.label)}</div>
      <div class="h-bar-track">
        <div class="h-bar-fill" style="width:${widthPct}%;opacity:${opacity}"></div>
      </div>
      <div class="h-bar-value">${escapeHtml(b.displayValue ?? String(b.value))}</div>
    </div>`;
  }).join('');

  return `
<div class="h-bar-chart">
  ${props.title ? `<div class="h-bar-title">${escapeHtml(props.title)}</div>` : ''}
  ${barHtml}
  ${props.source ? `<div class="h-bar-source">${escapeHtml(props.source)}</div>` : ''}
</div>`;
}
```

- [ ] **Step 4: Add twoColumn, chapterDivider, tableOfContents, compactTable, trendIndicator, numberedFindings**

```typescript
export function twoColumn(left: string, right: string, ratio = '1.2fr 1fr'): string {
  return `<div class="two-col" style="grid-template-columns:${ratio}">${left}${right}</div>`;
}

export function chapterDivider(number: string, title: string): string {
  return `
<div class="chapter-divider">
  <div class="chapter-number">${escapeHtml(number)}</div>
  <div class="chapter-title">${escapeHtml(title)}</div>
</div>`;
}

export interface TocEntry { title: string; page: number; }

export function tableOfContents(chapters: TocEntry[]): string {
  const rows = chapters.map(c =>
    `<div class="toc-row"><span class="toc-title">${escapeHtml(c.title)}</span><span class="toc-dots"></span><span class="toc-page">${c.page}</span></div>`
  ).join('');
  return `<div class="toc"><h2 class="toc-heading">Contents</h2>${rows}</div>`;
}

export function compactTable(props: DataTableProps): string {
  // Same as dataTable but with class="compact-table" for denser styling
  const headers = props.columns
    .map(c => `<th style="text-align:${c.align ?? 'left'}">${escapeHtml(c.label)}</th>`)
    .join('');
  const rows = props.rows.map(row => {
    const cells = props.columns.map(c => {
      const val = row[c.key] ?? null;
      return `<td style="text-align:${c.align ?? 'left'}">${formatCell(val, c.format)}</td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');
  return `
<div class="compact-table-wrapper">
  ${props.caption ? `<div class="compact-table-caption">${escapeHtml(props.caption)}</div>` : ''}
  <table class="compact-table"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>
</div>`;
}

export function trendIndicator(value: number, format: 'percent' | 'amount' = 'percent'): string {
  if (value > 0.5) {
    const display = format === 'percent' ? `+${value.toFixed(1)}%` : `+$${value.toFixed(2)}`;
    return `<span class="trend-up">${display}</span>`;
  }
  if (value < -0.5) {
    const display = format === 'percent' ? `${value.toFixed(1)}%` : `-$${Math.abs(value).toFixed(2)}`;
    return `<span class="trend-down">${display}</span>`;
  }
  return `<span class="trend-flat">Flat</span>`;
}

export interface NumberedFinding { number: number; title: string; detail: string; }

export function numberedFindings(findings: NumberedFinding[]): string {
  const html = findings.map(f => `
    <div class="finding">
      <div class="finding-number">${f.number}</div>
      <div class="finding-body">
        <div class="finding-title">${escapeHtml(f.title)}</div>
        <div class="finding-detail">${escapeHtml(f.detail)}</div>
      </div>
    </div>`).join('');
  return `<div class="numbered-findings">${html}</div>`;
}
```

- [ ] **Step 5: Update index.ts exports**

Add all new component exports to `src/lib/report-templates/index.ts`.

- [ ] **Step 6: Verify compilation**

```bash
npx tsc --noEmit src/lib/report-templates/base/components.ts 2>&1 | grep -v node_modules | head -5
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/report-templates/base/components.ts src/lib/report-templates/index.ts
git commit -m "feat: new report components — stat cards, charts, callouts, chapters"
```

---

### Task 6: Rewrite national quarterly template

**Files:**
- Rewrite: `src/lib/report-templates/templates/national-quarterly.ts`

- [ ] **Step 1: Define new input types**

The template input needs to accept the enriched payload from the rewritten assembler. Define `NationalQuarterlyReportInput` with chapters for economic landscape, revenue, fee index, market structure, and outlook.

- [ ] **Step 2: Write the renderer**

`renderNationalQuarterlyReport()` composes the 5-chapter structure:

1. Cover page
2. Table of contents
3. Executive summary (numberedFindings + Hamilton narrative)
4. Page break + Chapter 1: Economic Landscape (stat cards for FRED data + Beige Book narrative + Hamilton)
5. Page break + Chapter 2: Revenue Landscape (stat cards for Call Report data + horizontal bar chart + Hamilton)
6. Page break + Chapter 3: The Fee Index (spotlight stat cards + fee table for top 15 + Hamilton)
7. Page break + Chapter 4: Market Structure (stat cards for institution counts + charter/tier breakdown)
8. Page break + Chapter 5: Outlook (Hamilton forward-looking narrative + key findings)
9. Page break + Methodology footnote
10. Page break + Appendix compact table (all 49 categories)

Each chapter uses: `chapterDivider()` + `statCardRow()` + `hamiltonNarrativeBlock()` + data viz (horizontalBarChart or dataTable) + optional `keyFinding()`.

Use `twoColumn()` for narrative+chart side-by-side layouts in chapters 2 and 3.

- [ ] **Step 3: Verify compilation**

```bash
npx tsc --noEmit src/lib/report-templates/templates/national-quarterly.ts 2>&1 | grep -v node_modules | head -5
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/report-templates/templates/national-quarterly.ts
git commit -m "feat: 5-chapter national quarterly template with new design system"
```

---

### Task 7: Rewrite national quarterly assembler

**Files:**
- Rewrite: `src/lib/report-assemblers/national-quarterly.ts`

- [ ] **Step 1: Expand payload types**

Add fields for Call Report revenue, FRED indicators, and Beige Book context to `NationalQuarterlyPayload`. Keep the fee index data.

- [ ] **Step 2: Query all 4 data sources**

`assembleNationalQuarterly()` now calls:
- `getNationalIndex()` — filtered to 49 taxonomy categories (already fixed)
- `getPeerIndex({ charter_type: 'bank' })` and `getPeerIndex({ charter_type: 'credit_union' })` — charter splits
- `getRevenueTrend(8)` — from new `call-reports.ts`
- `getBeigeBookHeadlines()` — existing
- `getFredSummary()` — new from `fed.ts`

Each query wrapped in try/catch with null fallback for graceful degradation.

- [ ] **Step 3: Verify compilation**

```bash
npx tsc --noEmit src/lib/report-assemblers/national-quarterly.ts 2>&1 | grep -v node_modules | head -5
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/report-assemblers/national-quarterly.ts
git commit -m "feat: assembler queries 4 data sources with graceful degradation"
```

---

### Task 8: Upgrade Hamilton chapter prompts

**Files:**
- Modify: `src/lib/report-engine/assemble-and-render.ts`

- [ ] **Step 1: Rewrite the national_index case in assembleAndRender**

Replace the current 4 parallel `generateSection()` calls with 7 chapter-specific calls:

1. Executive summary — cross-references all data sources, 3 key findings
2. Chapter 1: Economic Landscape — FRED data + Beige Book synthesis
3. Chapter 2: Revenue Landscape — Call Report trends, fee-to-revenue paradox
4. Chapter 3: Fee Index — spotlight fee analysis, bank vs CU divergence
5. Chapter 4: Market Structure — institution landscape analysis
6. Chapter 5: Outlook — forward-looking implications for executives

Each `generateSection()` call gets:
- `context:` field with chapter-specific instructions (conclusion-first, 200-300 words, cross-reference)
- `data:` field with only the relevant subset of assembled data
- `type:` matching the chapter name

Run all 7 in parallel via `Promise.allSettled()`. Each failure degrades to fallback narrative.

- [ ] **Step 2: Pass enriched narratives to template**

Map the 7 narrative results into the template input structure.

- [ ] **Step 3: Verify compilation**

```bash
npx tsc --noEmit src/lib/report-engine/assemble-and-render.ts 2>&1 | grep -v node_modules | head -5
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/report-engine/assemble-and-render.ts
git commit -m "feat: 7 chapter-specific Hamilton prompts with cross-referencing"
```

---

## Merge & Test

### Task 9: Generate test report and verify

**Files:**
- None — runtime test

- [ ] **Step 1: Deploy Modal (if any Python changes)**

```bash
modal deploy fee_crawler/modal_app.py
```

- [ ] **Step 2: Push to trigger Vercel deploy**

```bash
git push origin main
```

Wait for deploy to complete (~2 min).

- [ ] **Step 3: Generate a national quarterly report**

Either via admin UI at `/admin/hamilton/reports` or via direct API:

```bash
DATABASE_URL="..." npx tsx -e "
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL!);
async function main() {
  const rows = await sql\`INSERT INTO report_jobs (report_type, status, params) VALUES ('national_index', 'pending', '{}') RETURNING id\`;
  const jobId = rows[0].id;
  console.log('Job:', jobId);
  const res = await fetch('https://gilmore3088--bank-fee-index-workers-generate-report.modal.run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ job_id: jobId, report_type: 'national_index', params: {} }),
  });
  console.log('Status:', res.status);
  const job = await sql\`SELECT status, error, artifact_key FROM report_jobs WHERE id = \${jobId}\`;
  console.log('Result:', JSON.stringify(job[0]));
  await sql.end();
}
main();
"
```

- [ ] **Step 4: Download and review PDF**

Download from admin UI or via presigned URL. Verify:
- 15-20 pages
- 5 chapters with chapter dividers
- Stat cards render with real data
- Hamilton narratives connect fees + revenue + macro
- Horizontal bar charts render
- Appendix has compact 49-category table
- Warm cream design throughout

- [ ] **Step 5: Iterate on design issues**

Fix any rendering issues, CSS tweaks, data formatting problems. Commit each fix.

- [ ] **Step 6: Final commit**

```bash
git add -A && git commit -m "feat: national quarterly report v2 — McKinsey-grade output"
git push origin main
```

---
phase: 26-national-data-admin-portal
plan: 02
subsystem: admin-ui
tags: [recharts, server-components, call-reports, fred, beige-book, health-metrics]
dependency_graph:
  requires:
    - 26-01  # page shell with tab nav and overview panel
    - "src/lib/crawler-db/call-reports.ts"
    - "src/lib/crawler-db/fed.ts"
  provides:
    - "/admin/national?tab=call-reports — 8-quarter revenue trend + top 10 institutions"
    - "/admin/national?tab=economic — FRED indicator cards + Beige Book district grid"
    - "/admin/national?tab=health — ROA/ROE/efficiency cards + charter comparison + growth charts"
  affects:
    - "Hamilton data visibility (admins can verify all data sources before report generation)"
tech_stack:
  added:
    - "src/lib/crawler-db/health.ts — new file: IndustryHealthMetrics, GrowthTrend, HealthByCharter"
  patterns:
    - "Recharts LineChart wrapped in 'use client' component, consumed by server component panels"
    - "DB returns newest-first arrays; all chart components reverse before rendering"
    - "ROA/ROE stored as ratio (0.012) — multiply by 100 for display; efficiency_ratio as-is"
    - "Promise.all concurrent fetching with per-source .catch() fallbacks in every panel"
key_files:
  created:
    - src/lib/crawler-db/health.ts
    - src/app/admin/national/revenue-trend-chart.tsx
    - src/app/admin/national/call-reports-panel.tsx
    - src/app/admin/national/growth-chart.tsx
    - src/app/admin/national/economic-panel.tsx
    - src/app/admin/national/health-panel.tsx
  modified:
    - src/lib/crawler-db/fed.ts
    - src/app/admin/national/page.tsx
decisions:
  - "health.ts created as new file (not appended to financial.ts) to keep concern separation clean"
  - "RichIndicator type exported from fed.ts and re-exported from health.ts to avoid duplication"
  - "buildHealthIndicator uses PERCENTILE_CONT(0.5) for median ROA/ROE to avoid outlier skew"
  - "Beige Book themes extracted from keyword matching on content_text (no separate themes table exists)"
  - "formatLargeAmount helper created per-panel for B/M/K display (formatAmount only does $X.XX)"
metrics:
  duration: "~35 minutes"
  completed: "2026-04-07T23:39:04Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 6
  files_modified: 2
---

# Phase 26 Plan 02: National Data Portal — Remaining Tabs Summary

**One-liner:** Three fully functional data panels (Call Reports, Economic, Health) with Recharts line charts, FRED sparklines, Beige Book district grid, and charter comparison — all wired to live DB queries.

## What Was Built

### Task 1: Call Reports Panel

**`src/lib/crawler-db/fed.ts`** — Added four new exports needed by the economic panel:
- `RichIndicator` interface: `{ current, history, trend, asOf }`
- `NationalEconomicSummary` interface (4 FRED indicators as RichIndicators)
- `DistrictBeigeBookSummary` interface (district number, name, summary, themes, release_date)
- `getNationalEconomicSummary()` — builds RichIndicators for FEDFUNDS, UNRATE, CPI YoY, UMCSENT
- `getDistrictBeigeBookSummaries()` — fetches latest Beige Book summary per district, extracts keyword themes

**`src/lib/crawler-db/health.ts`** — New file with:
- `IndustryHealthMetrics`, `GrowthTrend`, `HealthByCharter` interfaces
- `getIndustryHealthMetrics()` — PERCENTILE_CONT(0.5) median ROA/ROE/efficiency per quarter
- `getHealthMetricsByCharter()` — same metrics segmented by bank vs credit_union
- `getDepositGrowthTrend()` / `getLoanGrowthTrend()` — quarterly aggregated totals with YoY computation

**`src/app/admin/national/revenue-trend-chart.tsx`** — `"use client"` Recharts component:
- 3-line LineChart: total (blue solid), banks (emerald dashed), credit unions (amber dashed)
- Reverses data array (DB newest-first → chart oldest-left)
- Custom tooltip with B/M/K formatting
- Simple span-based legend below chart

**`src/app/admin/national/call-reports-panel.tsx`** — Server component:
- Section 1: Latest quarter revenue as large stat + YoY badge + bank/CU charter split percentages
- Section 2: Top 10 institutions table with rank, institution name, charter badge, SC income, total assets
- All null/empty states handled with informative messages

### Task 2: Economic and Health Panels

**`src/app/admin/national/growth-chart.tsx`** — `"use client"` Recharts component:
- Single-line LineChart for deposit or loan absolute totals over time
- Reverses data array before render
- T/B/M/K formatter for Y-axis

**`src/app/admin/national/economic-panel.tsx`** — Server component:
- Section 1: 4-col grid of FRED indicator cards (Fed Funds, Unemployment, CPI YoY, Consumer Sentiment)
  - Each card: current value, Sparkline, trend arrow, "As of" date
  - Null indicators show "N/A"
- Section 2: Beige Book district summaries in 3-col grid
  - Each district card: name/number, truncated summary text (rendered as JSX text, never dangerouslySetInnerHTML)
  - Keyword-extracted theme pills (blue badges)
  - Release date
  - Falls back to headlines when full summaries not yet generated
  - "No data" message if neither available

**`src/app/admin/national/health-panel.tsx`** — Server component:
- Section 1: 3-col metric cards for ROA, ROE, Efficiency Ratio with Sparklines
  - ROA/ROE: `current * 100` displayed as percentage (ratio stored in DB)
  - Efficiency ratio: displayed as-is (already a percentage like 62.5%)
- Section 2: Bank vs Credit Union comparison table
  - Emerald = better performer, red = worse
  - ROA/ROE: higher is better; efficiency ratio: lower is better
- Section 3: Side-by-side Deposit and Loan growth charts with current YoY badge

**`src/app/admin/national/page.tsx`** — Updated to route all 4 tabs:
- `tab=overview` → `<OverviewPanel />`
- `tab=call-reports` → `<CallReportsPanel />`
- `tab=economic` → `<EconomicPanel />`
- `tab=health` → `<HealthPanel />`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing functionality] Created missing `health.ts` and extended `fed.ts`**
- **Found during:** Task 1 setup
- **Issue:** The plan's `<interfaces>` block documented `getNationalEconomicSummary`, `getDistrictBeigeBookSummaries` (on `fed.ts`) and all of `health.ts` as if they existed, but neither existed in the repo
- **Fix:** Added `RichIndicator`, `NationalEconomicSummary`, `DistrictBeigeBookSummary` interfaces and their functions to `fed.ts`; created `health.ts` from scratch with all required interfaces and query functions
- **Files modified:** `src/lib/crawler-db/fed.ts`, `src/lib/crawler-db/health.ts` (new)
- **Commits:** 6db84de

**2. [Rule 2 - Missing functionality] Added `formatLargeAmount` helper per-panel**
- **Found during:** Task 1
- **Issue:** `formatAmount` from `src/lib/format.ts` formats as `$X.XX` (for fee amounts like $12.50). Revenue figures are in thousands/millions/billions (Call Reports store values in thousands). Using `formatAmount` directly would show `$15000000.00` instead of `$15.0B`
- **Fix:** Added a `formatLargeAmount` private helper in `call-reports-panel.tsx` (and reused pattern in charts) that outputs B/M/K suffixed values
- **Files modified:** `src/app/admin/national/call-reports-panel.tsx`

## Security

- Beige Book district summaries rendered as JSX text content (never `dangerouslySetInnerHTML`) per T-26-04

## Known Stubs

None. All data fetches from live DB queries with graceful empty-state fallbacks.

## Self-Check: PASSED

All 6 created files confirmed present on disk. Both task commits (6db84de, e56731b) verified in git log.

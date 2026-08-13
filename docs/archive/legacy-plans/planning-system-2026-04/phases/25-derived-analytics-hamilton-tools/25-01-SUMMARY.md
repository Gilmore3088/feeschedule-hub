---
phase: 25-derived-analytics-hamilton-tools
plan: 01
subsystem: crawler-db
tags: [derived-analytics, revenue-concentration, fee-dependency, trend-signals]
dependency_graph:
  requires: [institution_financials, extracted_fees, crawl_targets]
  provides: [getRevenueConcentration, getFeeDependencyTrend, getRevenuePerInstitutionTrend, computeTrendSignals]
  affects: [hamilton-tools, admin-analytics-pages]
tech_stack:
  added: []
  patterns: [parameterized-sql, trend-signal-computation, two-axis-pareto]
key_files:
  created:
    - src/lib/crawler-db/derived-analytics.ts
    - src/lib/crawler-db/derived-analytics.test.ts
  modified: []
decisions:
  - Used extracted fee amounts as proxy for dollar volume ranking since Call Report SC income is aggregate per institution, not per fee category
  - prevalence_pct in summary uses the most prevalent category percentage rather than summing (institutions overlap across categories)
  - service_charge_income multiplied by 1000 for display per v5.0 thousands convention
metrics:
  duration: 2m
  completed: 2026-04-08T06:56:06Z
  tasks_completed: 2
  tasks_total: 2
  tests_added: 17
  files_created: 2
---

# Phase 25 Plan 01: Derived Analytics Query Functions Summary

Three cross-source analytics functions with QoQ/YoY trend signals for revenue concentration Pareto analysis, fee dependency ratio time series, and revenue-per-institution trends.

## Completed Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Revenue concentration analysis (DERIVE-01) | 81c3e7e, c795f76 | derived-analytics.ts, derived-analytics.test.ts |
| 2 | Fee dependency + revenue-per-institution trends (DERIVE-02, DERIVE-03) | c795f76 | derived-analytics.ts, derived-analytics.test.ts |

## What Was Built

### getRevenueConcentration(topN = 5)
Two-axis Pareto analysis returning dollar volume ranking (SUM of extracted fee amounts per category) and institution prevalence ranking (COUNT DISTINCT institutions per category). Both axes include pct_of_total. Summary provides top-N aggregate percentages.

### getFeeDependencyTrend(quarters = 4)
Time series of avg fee_income_ratio (SC income / total revenue) grouped by report_date. Computes QoQ and YoY trend signals from the series.

### getRevenuePerInstitutionTrend(quarters = 4)
Current breakdown by asset tier and charter type, plus time series of avg SC income per institution. Computes QoQ and YoY trend signals.

### computeTrendSignals(values)
Shared utility: QoQ compares index 0 vs 1, YoY compares index 0 vs 4. Returns null when insufficient data. Guards against division by zero.

## Deviations from Plan

None -- plan executed exactly as written.

## Decisions Made

1. **Dollar volume proxy**: Since Call Report SC income is aggregate per institution (not attributable to individual fee categories), used SUM of extracted_fees.amount per category as the dollar volume ranking axis.
2. **Prevalence summary**: Used the highest single-category institution percentage (not sum, since institutions overlap across categories).
3. **Thousands scaling**: Applied 1000x multiplier to service_charge_income in revenue-per-institution queries per the v5.0 convention.

## Test Results

17 tests passing:
- RevenueConcentration: 5 tests (Pareto, topN=0, no data, fewer categories, DB error)
- FeeDependencyTrend: 4 tests (5-quarter signals, insufficient data edges, DB error)
- RevenuePerInstitutionTrend: 3 tests (full signals, single quarter, DB error)
- computeTrendSignals: 5 tests (full computation, edges, division by zero)

## Self-Check: PASSED

All files exist, all commits verified.

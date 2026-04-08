---
title: "v5.0 National Data Layer - Full Milestone Build"
category: architecture
severity: n/a
component: data-layer, hamilton, admin-portal
tags: [milestone, call-reports, fred, beige-book, health-metrics, derived-analytics, hamilton, admin-portal, external-intelligence]
date: 2026-04-07
phases: [23, 24, 25, 26, 27]
resolution_time: "single session (~4 hours)"
---

# v5.0 National Data Layer - Full Milestone Build

## Problem

Hamilton (the AI research agent) produced reports with broken or missing national data:
- Call Report revenue showed as 1/1000th actual values (stored in thousands, displayed raw)
- FRED economic indicators incomplete (no consumer sentiment, no CPI YoY computation)
- No industry health metrics (ROA, deposits, loans) available
- No Beige Book summaries -- only raw text
- No derived analytics (revenue concentration, fee dependency)
- No admin portal to verify data before it hits reports
- No way to ingest external research/surveys

## Solution: 5-Phase Data Foundation

### Phase 23: Call Report & FRED Foundation
- Fixed `* 1000` scaling at SQL query level across all revenue queries
- Added `getRevenueByCharter()`, `getRevenueByTier()`, `getFeeIncomeRatio()`
- Built `getNationalEconomicSummary()` with `RichIndicator` shape: `{ current, history[], trend, asOf }`
- Added UMCSENT (consumer sentiment) to FRED ingestion
- 56 tests (38 call-reports + 18 fed)

### Phase 24: Industry Health & Beige Book
- Created `health.ts` with `getIndustryHealthMetrics()`, `getDepositGrowthTrend()`, `getLoanGrowthTrend()`, `getInstitutionCountTrend()`, `getHealthMetricsByCharter()`
- Extended Python `ingest-beige-book` with Claude Haiku LLM summarization (~$0.15/edition)
- Created `beige_book_summaries` table with district summaries + national themes (JSONB)
- 56 tests (26 health + 30 fed)

### Phase 25: Derived Analytics & Hamilton Tools
- Created `derived.ts` with `getRevenueConcentration(topN)`, `getFeeDependencyRatio()`, `getRevenuePerInstitution()`
- Added `overdraft_revenue` column to institution_financials (RIAD4070 from FDIC)
- Built `queryNationalData` tool with section param (callReports | fred | beigeBook | health | derived | all)
- Consolidated all legacy agents into Hamilton as THE single universal agent
- 21 derived tests

### Phase 26: National Data Admin Portal
- Built `/admin/national` with 5 tabbed panels: Overview, Call Reports, Economic, Health, Intelligence
- Recharts LineCharts for 8-quarter trends, stat cards with sparklines
- Green/amber/red freshness badges per data source
- Beige Book district summary grid with theme pills
- "Data Hub" added to AdminNav

### Phase 27: External Intelligence System
- Created `external_intelligence` table with tsvector full-text search + GIN indexes
- Built `intelligence.ts` with CRUD + search queries
- Added `searchIntelligence` tool to Hamilton with inline `[Source: name, date]` citations
- Admin Intelligence tab with ingestion form (text paste + URL fetch)

## Key Technical Decisions

| Decision | Rationale |
|----------|-----------|
| `* 1000` at SQL level, not wrapper | Explicit, grep-able, no hidden magic |
| `RichIndicator` shape for all time-series | Consistent API -- Hamilton treats all indicators the same |
| One function per requirement | Testable, clear, matches codebase pattern |
| LLM summaries during ingestion (not query-time) | Zero latency, ~$0.15/edition cost |
| Single `queryNationalData` tool | Hamilton calls once with section='all' for full picture |
| Hamilton = THE agent | No legacy agents, no dead ends, everything rolls up to Hamilton |
| Postgres tsvector for external intelligence | Lightweight FTS, no vector DB needed at <1000 docs |

## Worktree Merge Lessons

The GSD worktree-based parallel execution had a recurring issue: worktree branches created from HEAD before planning files existed would delete those files when cherry-picked back to main. Pattern:

1. Worktree forks from HEAD (which has planning files)
2. Worktree branch's diff doesn't include planning files (they predate the fork)
3. Cherry-pick applies the diff, which shows planning files as "deleted"
4. Must run `git checkout <pre-cherry-pick-commit> -- .planning/phases/` after every cherry-pick

**Prevention:** Consider using `git merge` with `--no-commit` to inspect before finalizing, or add planning files to `.gitattributes` merge strategy.

## Files Created/Modified

### New Query Modules
- `src/lib/crawler-db/call-reports.ts` -- extended with 5 revenue functions
- `src/lib/crawler-db/health.ts` -- NEW, 5 industry health functions
- `src/lib/crawler-db/derived.ts` -- NEW, 3 derived analytics functions
- `src/lib/crawler-db/intelligence.ts` -- NEW, 4 CRUD/search functions
- `src/lib/crawler-db/fed.ts` -- extended with FRED summary, Beige Book queries

### Hamilton
- `src/lib/hamilton/hamilton-agent.ts` -- queryNationalData + searchIntelligence tools
- `src/lib/research/agents.ts` -- consolidated to Hamilton only

### Admin Portal
- `src/app/admin/national/page.tsx` -- 5-tab portal page
- `src/app/admin/national/overview-panel.tsx` -- data source summary
- `src/app/admin/national/call-reports-panel.tsx` -- revenue trends + charter split
- `src/app/admin/national/economic-panel.tsx` -- FRED + Beige Book
- `src/app/admin/national/health-panel.tsx` -- ROA/growth charts
- `src/app/admin/national/intelligence-panel.tsx` -- external docs list + add form

### Python Ingestion
- `fee_crawler/commands/ingest_fred.py` -- UMCSENT added
- `fee_crawler/commands/ingest_beige_book.py` -- LLM summarization
- `fee_crawler/commands/ingest_fdic.py` -- overdraft revenue (RIAD4070)

### Schema
- `scripts/migrate-schema.sql` -- beige_book_summaries + external_intelligence + overdraft_revenue

## Test Coverage

| Module | Tests |
|--------|-------|
| call-reports.test.ts | 38 |
| fed.test.ts | 30 |
| health.test.ts | 26 |
| derived.test.ts | 21 |
| intelligence.test.ts | 12 |
| test_ingest_beige_book.py | 11 |
| **Total** | **138** |

---
phase: 25-derived-analytics-hamilton-tools
plan: 02
subsystem: research-tools
tags: [hamilton-tools, unified-query, national-data, facade-pattern]
dependency_graph:
  requires: [getRevenueConcentration, getFeeDependencyTrend, getRevenuePerInstitutionTrend, getRevenueTrend, getTopRevenueInstitutions, getRevenueByTier, getNationalEconomicSummary, getBeigeBookThemes, getFredSummary, getIndustryHealthMetrics, getDistrictComplaintSummary, getNationalIndex, getPeerIndex, getIndexSnapshot]
  provides: [queryNationalData]
  affects: [hamilton-agent-capabilities, admin-research-agents]
tech_stack:
  added: []
  patterns: [source-routing-facade, parallel-promise-all, view-sub-routing]
key_files:
  created:
    - src/lib/research/tools-internal.test.ts
  modified:
    - src/lib/research/tools-internal.ts
decisions:
  - Used inputSchema (not parameters) to match existing AI SDK tool() pattern in codebase
  - Adapted to actual function signatures which differed from plan interfaces (getTopRevenueInstitutions takes limit only, getRevenueByTier takes reportDate not quarterCount)
  - Used Promise.all for "all" views to parallelize multiple DB queries within a source
metrics:
  duration: 4m
  completed: 2026-04-08T00:03:00Z
  tasks_completed: 2
  tasks_total: 2
  tests_added: 24
  files_created: 1
  files_modified: 1
---

# Phase 25 Plan 02: Unified queryNationalData Tool Summary

Single facade tool routing Hamilton to all 6 national data source categories (call_reports, economic, health, complaints, fee_index, derived) with optional view sub-routing.

## Completed Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Unified queryNationalData tool with source routing (TDD) | 16c5230, 1473d4c, 2c412de | tools-internal.ts, tools-internal.test.ts |
| 2 | Integration smoke test -- TypeScript compilation and full test suite | 2c412de | tools-internal.ts |

## What Was Built

### queryNationalData Tool

A unified tool registered in `internalTools` that Hamilton auto-discovers. Instead of needing separate tools for each data domain, Hamilton calls one tool with a `source` parameter:

- **call_reports**: Revenue trends, top institutions, tier breakdown, district revenue
- **economic**: FRED summary, Beige Book themes, national economic summary, district economic summary
- **health**: Industry health metrics, charter breakdown, deposit/loan growth, institution counts
- **complaints**: District CFPB complaint summaries (requires district param)
- **fee_index**: National index snapshot or peer index (with charter/tier filters)
- **derived**: Revenue concentration Pareto, fee dependency trend, revenue-per-institution trend

Each source supports an optional `view` parameter to narrow to a specific data slice. Omitting `view` returns all data for that source (via parallel Promise.all).

### Source Routing Architecture

The tool uses a switch-on-source pattern with dedicated handler functions (`handleCallReports`, `handleEconomic`, etc.) that each switch on `view`. This keeps the main execute function clean and each handler focused.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed tool property name: parameters -> inputSchema**
- **Found during:** Task 2 (TypeScript compilation)
- **Issue:** Plan specified `parameters` but the AI SDK `tool()` function in this codebase uses `inputSchema`
- **Fix:** Changed property name to `inputSchema` to match existing pattern
- **Files modified:** src/lib/research/tools-internal.ts
- **Commit:** 2c412de

**2. [Rule 3 - Blocking] Adapted to actual function signatures**
- **Found during:** Task 1 (implementation)
- **Issue:** Plan interfaces differed from actual exported signatures (e.g., `getTopRevenueInstitutions` takes `limit` not `{limit, charter}`, `getRevenueByTier` takes `reportDate` not `quarterCount`)
- **Fix:** Called functions with their actual parameter signatures
- **Files modified:** src/lib/research/tools-internal.ts
- **Commit:** 1473d4c

## Decisions Made

1. **inputSchema over parameters**: Matched existing codebase pattern for AI SDK tool() definition.
2. **Promise.all for "all" views**: When no view specified, parallel-fetch all data within a source for performance.
3. **Graceful error responses**: Invalid source/view returns descriptive error objects listing valid options, rather than throwing.

## Test Results

24 tests passing:
- Registration: 1 test
- call_reports source: 5 tests (all, trend, top_institutions, by_tier, by_district)
- economic source: 5 tests (all, fred, beige_book, district with/without param)
- health source: 3 tests (all, metrics, deposits)
- complaints source: 2 tests (with/without district)
- fee_index source: 3 tests (national, charter filter, tiers filter)
- derived source: 4 tests (all, concentration, dependency, revenue_per_institution)
- error handling: 1 test (unknown source)

Integration: 126 total tests pass across all Phase 23-25 files (derived-analytics, tools-internal, call-reports, health, fed).

## Self-Check: PASSED

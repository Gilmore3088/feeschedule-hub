---
phase: 25-derived-analytics-hamilton-tools
plan: "02"
subsystem: hamilton-agent
tags: [hamilton, research-agents, national-data, consolidation]
dependency_graph:
  requires: [25-01]
  provides: [queryNationalData-tool, unified-hamilton-agent]
  affects: [src/lib/hamilton/hamilton-agent.ts, src/lib/research/agents.ts, src/lib/crawler-db/fed.ts, src/lib/crawler-db/call-reports.ts, src/lib/crawler-db/financial.ts]
tech_stack:
  added: []
  patterns:
    - "Single universal agent pattern: all agent IDs route through Hamilton"
    - "Section-targeted tool pattern: queryNationalData(section='all'|specific) reduces token cost"
    - "Individual try/catch per section prevents one failure blocking others"
key_files:
  created: []
  modified:
    - src/lib/hamilton/hamilton-agent.ts
    - src/lib/research/agents.ts
    - src/lib/crawler-db/fed.ts
    - src/lib/crawler-db/call-reports.ts
    - src/lib/crawler-db/financial.ts
decisions:
  - "D-07: Full consolidation -- all legacy agents (ask, fee-analyst, content-writer, custom-query) route to Hamilton"
  - "'ask' keeps requiresAuth: false for public backward compatibility"
  - "queryNationalData returns full RichIndicator objects per D-06 (token cost acceptable for report quality)"
metrics:
  duration: "~25 minutes"
  completed: "2026-04-07"
  tasks_completed: 2
  files_modified: 5
---

# Phase 25 Plan 02: Hamilton Tools Consolidation Summary

**One-liner:** queryNationalData tool gives Hamilton unified access to Call Reports, FRED, Beige Book, health metrics, and derived analytics; all legacy agents consolidated to single Hamilton universal agent.

## What Was Built

### Task 1: queryNationalData Tool

Added `queryNationalData` tool to `buildHamiltonTools()` in `hamilton-agent.ts`. The tool:

- Accepts a `section` enum: `callReports | fred | beigeBook | health | derived | all`
- Uses `section='all'` for comprehensive national picture (bank executive "what does the national landscape look like?" query)
- Uses targeted sections to reduce token cost for focused queries
- Individual try/catch per section -- one data source failure does not block others
- Returns full `RichIndicator` objects with history + trend per D-06

Data sources wired:
| Section | Function | Source |
|---------|----------|--------|
| callReports | getRevenueTrend(8) | institution_financials quarterly aggregates |
| fred | getNationalEconomicSummary() | fed_economic_indicators (FEDFUNDS/UNRATE/CPI/UMCSENT) |
| beigeBook | getNationalBeigeBookSummary() | beige_book_summaries national row |
| health | getIndustryHealthMetrics() | institution_financials ROA/ROE/efficiency_ratio |
| derived | getRevenueConcentration + getFeeDependencyRatio + getRevenuePerInstitution | cross-source |

Updated `buildHamiltonSystemPrompt()` to reference the tool with usage guidance.

### Task 2: Legacy Agent Consolidation

Replaced 4 separate agent definitions (ask, fee-analyst, content-writer, custom-query) with a single `buildHamiltonAgent()` factory. All known agent IDs route to Hamilton with full tool access including `queryNationalData`.

- `ask` keeps `requiresAuth: false` -- public access preserved
- All authenticated agents use `requiresAuth: true`, `requiredRole: 'premium'`
- `getAgent()`, `getPublicAgents()`, `getAdminAgents()` exports preserved
- `/api/research/[agentId]` route unchanged -- works transparently
- Unknown agent IDs still return `undefined` → 404

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Missing RichIndicator/deriveTrend exports in fed.ts**
- **Found during:** Task 1 implementation
- **Issue:** `health.ts` imports `RichIndicator` and `deriveTrend` from `./fed`, but fed.ts had no such exports. TypeScript compilation failed.
- **Fix:** Added `RichIndicator` interface and `deriveTrend()` function to fed.ts
- **Files modified:** `src/lib/crawler-db/fed.ts`
- **Commit:** 388997a

**2. [Rule 3 - Blocking] Missing getNationalEconomicSummary, getDistrictUnemployment, getDistrictBeigeBookSummaries, getNationalBeigeBookSummary in fed.ts**
- **Found during:** Task 1 (plan required these as imports for queryNationalData; test file also referenced them)
- **Issue:** Phase 24 functions were defined in tests but not implemented in fed.ts
- **Fix:** Implemented all four functions with full error handling and Date normalization
- **Files modified:** `src/lib/crawler-db/fed.ts`
- **Commit:** 388997a

**3. [Rule 3 - Blocking] Missing priorYearQuarter export in call-reports.ts**
- **Found during:** Task 1 TS check
- **Issue:** `health.ts` imports `priorYearQuarter` from `./call-reports` but it didn't exist
- **Fix:** Added `priorYearQuarter()` handling both "2024Q4" and "2024-Q4" quarter label formats
- **Files modified:** `src/lib/crawler-db/call-reports.ts`
- **Commit:** 388997a

**4. [Rule 3 - Blocking] overdraft_revenue missing from getFinancialsByInstitution query**
- **Found during:** Task 1 TS check
- **Issue:** `InstitutionFinancial` interface (added in Plan 25-01) required `overdraft_revenue` but the SELECT query and mapping in `getFinancialsByInstitution` didn't include it
- **Fix:** Added `overdraft_revenue` to SELECT list and return object mapping
- **Files modified:** `src/lib/crawler-db/financial.ts`
- **Commit:** 388997a

## Test Results

| Suite | Before | After |
|-------|--------|-------|
| fed.test.ts | 5/35 failing (missing exports) | 35/35 passing |
| health.test.ts | 5/26 failing (priorYearQuarter format bug) | 26/26 passing |
| call-reports.test.ts | all passing | all passing |
| derived.test.ts | all passing | all passing |
| Pre-existing failures | voice.test (1), fees.test (2) | unchanged (out of scope) |

## Threat Surface Scan

No new network endpoints, auth paths, or schema changes introduced. `queryNationalData` section parameter is restricted to Zod `z.enum()` -- no user-controlled SQL surface. Legacy "ask" agent retains existing public tool set (publicTools only, no elevation).

## Self-Check

### Created files exist:
- N/A (no new files)

### Modified files verified:
- `src/lib/hamilton/hamilton-agent.ts` -- contains queryNationalData, getRevenueConcentration, getNationalEconomicSummary, getIndustryHealthMetrics
- `src/lib/research/agents.ts` -- contains buildHamiltonTools, buildHamiltonSystemPrompt, Hamilton; no legacy prompt builders
- `src/lib/crawler-db/fed.ts` -- contains RichIndicator, deriveTrend, getNationalEconomicSummary, getNationalBeigeBookSummary, getDistrictUnemployment, getDistrictBeigeBookSummaries
- `src/lib/crawler-db/call-reports.ts` -- contains priorYearQuarter
- `src/lib/crawler-db/financial.ts` -- contains overdraft_revenue in query and mapping

### Commits verified:
- 388997a -- Task 1 (queryNationalData + Rule 3 fixes)
- 98442db -- Task 2 (legacy agent consolidation)

## Self-Check: PASSED

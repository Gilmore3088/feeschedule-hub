---
phase: 36-tool-regulation-intelligence
plan: "01"
subsystem: research-tools
tags: [hamilton, tools, regulatory-intelligence, data-sources]
dependency_graph:
  requires: []
  provides: [queryNationalData-11-sources, queryRegulatoryRisk, hamilton-regulation-awareness]
  affects: [src/lib/research/tools-internal.ts, src/lib/research/agents.ts, src/lib/crawler-db/financial.ts]
tech_stack:
  added: []
  patterns: [tool-execute-pattern, parameterized-sql, parallel-promise-all]
key_files:
  created: []
  modified:
    - src/lib/crawler-db/financial.ts
    - src/lib/research/tools-internal.ts
    - src/lib/research/agents.ts
decisions:
  - "getNationalComplaintSummary returns aggregate object not array — complaint signals use total_complaints/fee_related_pct instead of per-product breakdown"
  - "REGULATED_FEE_CATEGORIES constant is the source of truth for CFPB-scrutinized fee types across the risk tool"
  - "Risk score formula: outlier (33pts) + complaint (33pts) + fed_content (34pts) = 100 max"
  - "Consumer systemPrompt intentionally excluded from REGULATION_INSTRUCTION per plan scope"
metrics:
  duration_minutes: 25
  completed_date: "2026-04-07"
  tasks_completed: 3
  tasks_total: 3
  files_modified: 3
---

# Phase 36 Plan 01: Tool & Regulation Intelligence — Source Expansion + Regulatory Risk Tool Summary

Expanded queryNationalData from 6 to 11 data sources, created queryRegulatoryRisk tool cross-referencing fee outliers + CFPB complaints + Fed speeches, and injected regulation-awareness instruction into Hamilton's pro/admin system prompts.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add SOD/NYFed/OFR query functions + wire 5 new sources | 08d2809 | financial.ts, tools-internal.ts |
| 2 | Create queryRegulatoryRisk tool | 9bccba6 | tools-internal.ts |
| 3 | Add regulation-awareness instruction to Hamilton prompts | 7f662bc | agents.ts |

## What Was Built

**Task 1 — queryNationalData source expansion (6 → 11 sources):**

Three new DB query functions added to `financial.ts`:
- `getSodMarketShare(stateFips?)` — queries `sod_deposits`, top 10 by total deposits, state-filterable
- `getNyFedData(limit?)` — queries `nyfed_data`, latest observation per series_id via DISTINCT ON
- `getOfrData(limit?)` — queries `ofr_data`, latest observation per series_id via DISTINCT ON

Five new cases added to `queryNationalData` switch in `tools-internal.ts`:
- `fed_content` → `handleFedContent()` — routes to `getDistrictContent` (with district) or `getRecentSpeeches` (without)
- `labor` → `handleLabor()` — calls `getLatestIndicators` with BLS_LABOR_SERIES default `["LNS14000000", "CES0000000001", "CUUR0000SEMC01"]`
- `demographics` → `handleDemographics()` — requires stateFips param, calls `getStateDemographics`
- `research` → `handleResearch()` — parallel `getNyFedData` + `getOfrData`
- `deposits` → `handleDeposits()` — calls `getSodMarketShare`, slices to limit

New inputSchema params: `stateFips` (string, optional) and `seriesIds` (string[], optional).

**Task 2 — queryRegulatoryRisk tool:**

New exported `tool()` added to `tools-internal.ts` and registered in `internalTools`:
- Input: `categories[]` (defaults to 5 regulated categories), `district` (optional), `limit` (default 5)
- Signal 1 — fee outliers: full-table scan of `extracted_fees` in regulated categories, computes P75 per category in-memory, returns outlier institution count + top N names
- Signal 2 — complaint signals: `getNationalComplaintSummary()` aggregate (total_complaints, fee_related_pct, average_per_institution)
- Signal 3 — Fed content signals: `getRecentSpeeches(30)` filtered by REGULATORY_KEYWORDS, returns count + up to 3 titles
- Risk score: outlierScore (0-33) + complaintScore (0-33) + fedScore (0-34) = 0-100
- Returns: `risk_score`, `risk_label` (low/moderate/high), `signal_count`, `affected_institutions`, `fee_outlier_signals`, `complaint_signals`, `fed_content_signals`, `categories_assessed`

**Task 3 — Hamilton regulation-awareness:**

In `agents.ts`:
- `REGULATION_INSTRUCTION` constant added (before OPS_TOOL_NAMES)
- `dataStats` updated to list all 11 sources including Fed Content, BLS, Census ACS, NY Fed, OFR, SOD
- Pro `systemPrompt`: now `${PRO_PREFIX}\n\n${dataStats}\n\n${REGULATION_INSTRUCTION}\n\n${HAMILTON_SYSTEM_PROMPT}`
- Admin `systemPrompt`: now `${ADMIN_PREFIX}\n\n${dataStats}\n\n${REGULATION_INSTRUCTION}\n\n${HAMILTON_SYSTEM_PROMPT}${ops}`
- Consumer `systemPrompt`: unchanged

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] getNationalComplaintSummary returns aggregate object, not array**
- **Found during:** Task 2 — TypeScript compilation
- **Issue:** Plan referenced filtering `national` as an array of `{ product, complaint_count }` rows but `getNationalComplaintSummary()` in `complaints.ts` returns `{ total_complaints, fee_related_pct, average_per_institution }`
- **Fix:** Updated complaint signals handler to use the actual aggregate shape — `total_fee_complaints: national.total_complaints`, `fee_related_pct`, `average_per_institution`
- **Files modified:** `src/lib/research/tools-internal.ts`
- **Commit:** 9bccba6

**2. [Rule 1 - Bug] Health metric imports mis-attributed to financial.ts**
- **Found during:** Task 1 — TypeScript compilation
- **Issue:** Initial import edit merged `getIndustryHealthMetrics`, `getHealthMetricsByCharter`, etc. into the `@/lib/crawler-db/financial` import block; these functions live in `@/lib/crawler-db/health`
- **Fix:** Split import blocks — health functions from `health.ts`, new financial functions from `financial.ts`
- **Files modified:** `src/lib/research/tools-internal.ts`
- **Commit:** 08d2809 (corrected before commit)

## Known Stubs

None — all handlers call real DB functions. `getSodMarketShare`, `getNyFedData`, `getOfrData` return `[]` on error (tables may not exist yet in all environments), which is intentional graceful degradation.

## Threat Flags

No new trust boundaries introduced beyond what the plan's threat model covered. All DB params use the postgres tagged template literal (parameterized), satisfying T-36-01 and T-36-02 mitigations.

## Self-Check: PASSED

- `src/lib/crawler-db/financial.ts` — getSodMarketShare, getNyFedData, getOfrData present
- `src/lib/research/tools-internal.ts` — queryNationalData has 11-value enum, queryRegulatoryRisk in internalTools
- `src/lib/research/agents.ts` — REGULATION_INSTRUCTION in pro + admin prompts, consumer unchanged
- Commits 08d2809, 9bccba6, 7f662bc all exist in repo
- TypeScript: zero errors in modified files (pre-existing errors in national-quarterly.ts and test files are out of scope)

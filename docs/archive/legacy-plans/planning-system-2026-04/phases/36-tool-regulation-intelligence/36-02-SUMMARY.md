---
phase: 36-tool-regulation-intelligence
plan: "02"
subsystem: research-tools
tags: [tool-descriptions, hamilton, cross-reference, regulatory-intelligence]
dependency_graph:
  requires: [36-01]
  provides: [TOOLS-01, TOOLS-03]
  affects: [src/lib/research/tools-internal.ts, src/lib/research/tools.ts]
tech_stack:
  added: []
  patterns:
    - "Returns/When/Combine-with three-element tool description structure"
    - "Cross-reference partner guidance embedded in LLM tool descriptions"
key_files:
  modified:
    - src/lib/research/tools-internal.ts
    - src/lib/research/tools.ts
decisions:
  - "Used 'Combine with:' phrase consistently across all 17 descriptions to enable grep verification"
  - "queryNationalData uses 'Combine with:' for cross-reference examples rather than 'Cross-reference examples:' for consistency"
metrics:
  duration: "~10 minutes"
  completed: "2026-04-08T19:51:54Z"
  tasks_completed: 2
  files_modified: 2
---

# Phase 36 Plan 02: Tool Description Upgrades Summary

Upgraded all 17 tool descriptions (13 internal + 4 public) with structured Returns/When/Combine-with guidance so Hamilton can reason about which tools to chain for complete analysis.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Upgrade 13 internal tool descriptions | c012ef2 | src/lib/research/tools-internal.ts |
| 2 | Upgrade 4 public tool descriptions | c9a8b4f | src/lib/research/tools.ts |

## What Was Built

Every tool description now follows a three-element structure:

- **Returns** — concrete description of what data comes back
- **When** — question types and use cases that warrant this tool
- **Combine with** — cross-reference partners for complete analysis

### Internal tools upgraded (tools-internal.ts)

| Tool | Key cross-references added |
|------|---------------------------|
| queryDistrictData | fed_content, complaints, economic district views |
| queryStateData | demographics (Census), deposits (FDIC SOD) |
| queryFeeRevenueCorrelation | call_reports trend, health ROA/efficiency |
| queryOutliers | queryRegulatoryRisk, rankInstitutions(above_p75) |
| getCrawlStatus | getReviewQueueStats, queryDataQuality(funnel) |
| getReviewQueueStats | getCrawlStatus, queryDataQuality(review_status) |
| searchInstitutionsByName | getInstitution, queryFeeRevenueCorrelation |
| rankInstitutions | queryRegulatoryRisk, queryNationalData(complaints) |
| queryJobStatus | getCrawlStatus |
| queryDataQuality | getCrawlStatus, queryNationalData(fee_index) |
| triggerPipelineJob | queryJobStatus |
| queryNationalData | All 11 sources named; 3 composite cross-ref patterns |
| queryRegulatoryRisk | queryOutliers, complaints, fed_content |

### Public tools upgraded (tools.ts)

| Tool | Key cross-references added |
|------|---------------------------|
| searchFees | searchIndex peer comparison, complaints for overdraft/NSF |
| searchIndex | queryNationalData(economic), queryNationalData(health) |
| searchInstitutions | getInstitution, searchIndex state filter |
| getInstitution | searchIndex peer benchmarking, complaints district context |

## Verification

```
grep -c "Combine with" src/lib/research/tools-internal.ts  → 13
grep -c "Combine with" src/lib/research/tools.ts           → 4
grep "queryRegulatoryRisk" src/lib/research/tools-internal.ts → 4 lines
```

TypeScript compiler reports zero errors in tools-internal.ts and tools.ts. Pre-existing test file errors are unrelated to this plan.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. This plan modifies description strings only; no data wiring involved.

## Threat Flags

None. Description strings are static source code with no runtime injection surface.

## Self-Check: PASSED

- [x] src/lib/research/tools-internal.ts modified and committed (c012ef2)
- [x] src/lib/research/tools.ts modified and committed (c9a8b4f)
- [x] 13 "Combine with" occurrences in tools-internal.ts
- [x] 4 "Combine with" occurrences in tools.ts
- [x] queryNationalData names all 11 source categories
- [x] queryRegulatoryRisk cross-referenced in queryOutliers, rankInstitutions, and queryNationalData

---
phase: 15-premium-products
plan: "02"
subsystem: report-assemblers
tags: [assembler, hamilton, peer-competitive, fee-changes, data-layer]
dependency_graph:
  requires:
    - "15-01"
    - src/lib/crawler-db/fee-index.ts
    - src/lib/hamilton/types.ts
    - src/lib/fee-taxonomy.ts
    - src/lib/fed-districts.ts
  provides:
    - src/lib/report-assemblers/peer-competitive.ts
    - src/lib/crawler-db/fee-changes.ts
    - src/lib/report-engine/types.ts
  affects:
    - Modal worker (peer_brief report_type)
tech_stack:
  added:
    - src/lib/report-engine/ (new directory — DataManifest, ReportJob, PublishedReport)
    - src/lib/report-assemblers/ (new directory — peer-competitive assembler)
  patterns:
    - Promise.all parallel queries with DataManifest audit trail
    - Graceful table degradation via try/catch on sql.unsafe
    - TDD (RED→GREEN) for DB query with mock injection
key_files:
  created:
    - src/lib/crawler-db/fee-changes.ts
    - src/lib/crawler-db/fee-changes.test.ts
    - src/lib/report-assemblers/peer-competitive.ts
    - src/lib/report-engine/types.ts
  modified:
    - src/lib/hamilton/types.ts
decisions:
  - "PeerCompetitiveData type added to hamilton/types.ts — logical home alongside SectionType"
  - "peer_competitive added to SectionType union — required for strict TypeScript typing of section definitions"
  - "report-engine/types.ts ported from main repo — DataManifest contract enables audit trail"
  - "Section 3 (fee_change_context) include=false when getFeeChangeEvents returns [] per D-04"
  - "delta_pct uses Math.abs(nationalMedian) denominator — safe when national median is negative (rare)"
metrics:
  duration: "~8 minutes"
  completed: "2026-04-06T23:42:50Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 4
  files_modified: 1
requirements_satisfied:
  - BRIEF-01
  - BRIEF-03
  - BRIEF-04
---

# Phase 15 Plan 02: Peer-Competitive Assembler Summary

**One-liner:** Peer-competitive data assembler using parallel getPeerIndex + getNationalIndex + getFeeChangeEvents queries, building a typed PeerCompetitivePayload with 3–5 Hamilton section definitions and graceful fee_change_events table degradation.

## What Was Built

### Task 1: `src/lib/crawler-db/fee-changes.ts`

`getFeeChangeEvents(filters)` queries `fee_change_events JOIN crawl_targets` with:
- Parameterized WHERE clause matching the `getPeerIndex` pattern (conditions array + params array + paramIdx counter)
- Filters: `charter_type`, `asset_tiers` (IN clause), `fed_districts` (IN clause)
- Default LIMIT 100, capped at 500
- ORDER BY `fce.changed_at DESC`
- Graceful degradation: try/catch detects "fee_change_events", "does not exist", "no such table" → returns `[]`; unrelated errors rethrow

11 vitest tests confirm all behaviors (table-missing, filter construction, limit cap, sort order).

### Task 2: `src/lib/report-assemblers/peer-competitive.ts`

`assemblePeerCompetitivePayload(filters)` returns `PeerCompetitivePayload`:

1. **Parallel queries** via `Promise.all`: `getPeerIndex`, `getNationalIndex`, `getFeeChangeEvents`
2. **Categories merge**: peer entries joined to national by `fee_category`; `delta_pct = ((peer - nat) / |nat|) * 100`, null-safe; sorted featured-first then by `peer_count` descending
3. **5 `PeerBriefSection` entries**:
   - Section 1: `executive_summary` — top above/below national, peer count (always included)
   - Section 2: `peer_competitive` — top 6 featured fees by |delta_pct| (always included)
   - Section 3: `findings` — fee change events slice (include=false when no data)
   - Section 4: `peer_comparison` — cost advantage analysis (always included)
   - Section 5: `recommendation` — outlier categories >15% delta (always included)
4. **DataManifest** tracks all 3 queries with row_count and executed_at
5. **data_hash**: SHA-256 of `{ data, sections_count }`

### Supporting Files Created

- `src/lib/report-engine/types.ts` — `DataManifest`, `ReportJob`, `PublishedReport` (ported from main repo)
- `src/lib/hamilton/types.ts` — added `peer_competitive` to `SectionType`; added `PeerCompetitiveData` interface

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] report-engine/types.ts missing from worktree**
- **Found during:** Task 2 setup
- **Issue:** `src/lib/report-engine/types.ts` referenced by both the assembler and plan interfaces but not present in this worktree branch
- **Fix:** Created `src/lib/report-engine/types.ts` porting the `DataManifest`, `ReportJob`, and `PublishedReport` types from the main repo
- **Files modified:** `src/lib/report-engine/types.ts` (new)
- **Commit:** f0094f0

**2. [Rule 2 - Missing Type] PeerCompetitiveData missing from worktree's hamilton/types.ts**
- **Found during:** Task 2 setup
- **Issue:** `hamilton/types.ts` in this worktree lacked `PeerCompetitiveData` and `peer_competitive` SectionType — the main repo had them but the worktree branch was behind
- **Fix:** Added `peer_competitive` to `SectionType` union and added `PeerCompetitiveData` interface matching the plan's interface spec
- **Files modified:** `src/lib/hamilton/types.ts`
- **Commit:** f0094f0 (SectionType), bbe7147 (PeerCompetitiveData)

## Verification Results

- `npx vitest run src/lib/crawler-db/fee-changes.test.ts` — 11/11 passed
- `npx tsc --noEmit` (excluding test files) — zero errors

## Known Stubs

None. All data flows through live DB queries with no hardcoded placeholders.

## Threat Flags

None. No new network endpoints or auth paths introduced. All SQL uses parameterized queries via the existing `sql.unsafe(query, params)` pattern (T-15-06 mitigation confirmed). DataManifest records getFeeChangeEvents query even when row_count=0 (T-15-09 mitigation confirmed).

## Self-Check: PASSED

Files confirmed present:
- `src/lib/crawler-db/fee-changes.ts` — FOUND
- `src/lib/crawler-db/fee-changes.test.ts` — FOUND
- `src/lib/report-assemblers/peer-competitive.ts` — FOUND
- `src/lib/report-engine/types.ts` — FOUND

Commits confirmed:
- `f0094f0` — FOUND
- `bbe7147` — FOUND

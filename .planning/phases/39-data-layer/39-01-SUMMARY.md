---
phase: 39-data-layer
plan: 01
subsystem: database
tags: [postgres, supabase, uuid, jsonb, soft-delete, confidence-tiers]

requires:
  - phase: 38-architecture-foundation
    provides: hamilton/types.ts screen DTOs that the tables must support

provides:
  - ensureHamiltonProTables() — idempotent creation of all 6 Hamilton Pro tables
  - confidence tier computation and simulation gating logic (computeConfidenceTier, canSimulate)

affects:
  - 39-02-data-layer
  - 40-hamilton-layout
  - 44-simulate-api

tech-stack:
  added: []
  patterns:
    - "CREATE TABLE IF NOT EXISTS with gen_random_uuid() PKs and TIMESTAMPTZ defaults — matches ensureHamiltonTables() pattern"
    - "Soft-delete via archived_at TIMESTAMPTZ + status TEXT on analyses and scenarios only"
    - "CHECK constraints at DB level for enum-like columns (confidence_tier, status, role)"
    - "confidence tier as snapshot stored at scenario creation time, not auto-updated"

key-files:
  created:
    - src/lib/hamilton/pro-tables.ts
    - src/lib/hamilton/confidence.ts
  modified: []

key-decisions:
  - "Used CHECK constraints at DB level for confidence_tier and status values (tamper-proof per T-39-01, T-39-02)"
  - "Soft-delete (archived_at + status) on analyses and scenarios only; reports/watchlists/signals/alerts have no soft-delete (D-09)"
  - "confidence_tier is a snapshot value at creation — does not auto-update if data quality improves later (D-04)"
  - "Insufficient tier blocks simulation entirely with reason message referencing the threshold (D-06)"
  - "ensureHamiltonProTables() in new file (pro-tables.ts), not extending chat-memory.ts — separation of concerns"

patterns-established:
  - "Hamilton Pro table creation: single function, separate await sql per table, try/catch swallow"
  - "Confidence tier computation: pure logic module, no DB imports"

requirements-completed: [DATA-01, DATA-02, DATA-03, DATA-04]

duration: 12min
completed: 2026-04-08
---

# Phase 39 Plan 01: Data Layer Summary

**6 Hamilton Pro PostgreSQL tables with idempotent creation, confidence_tier CHECK constraint on scenarios, and soft-delete columns on analyses and scenarios only**

## Performance

- **Duration:** 12 min
- **Started:** 2026-04-08T00:00:00Z
- **Completed:** 2026-04-08T00:12:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Created `ensureHamiltonProTables()` with all 6 tables following existing `ensureHamiltonTables()` pattern exactly
- Added confidence_tier CHECK constraint to hamilton_scenarios and soft-delete columns (archived_at + status) to analyses and scenarios
- Created pure logic confidence tier module with computeConfidenceTier() and canSimulate() for simulation gating

## Task Commits

Each task was committed atomically:

1. **Task 1: Create ensureHamiltonProTables() with all 6 tables** - `4017d5d` (feat)
2. **Task 2: Create confidence tier module with threshold logic** - `48eefe9` (feat)

## Files Created/Modified

- `src/lib/hamilton/pro-tables.ts` - ensureHamiltonProTables() creating 6 tables with 11 indexes
- `src/lib/hamilton/confidence.ts` - CONFIDENCE_TIERS, CONFIDENCE_THRESHOLDS, computeConfidenceTier(), canSimulate()

## Decisions Made

- Used DB CHECK constraints for confidence_tier and status enum values — matches existing CHECK (role IN (...)) pattern on hamilton_messages and enforces data integrity at the DB level (T-39-01, T-39-02 mitigated)
- ensureHamiltonProTables() placed in a new file (pro-tables.ts) rather than extending chat-memory.ts to keep concerns separated
- All user_id columns included on every table to enable row-level scoping in downstream queries (T-39-03)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Pre-existing TypeScript errors in test files (*.test.ts mock typing issues) were present before this plan and are out of scope.

## User Setup Required

None - no external service configuration required. Tables are created at runtime via ensureHamiltonProTables() called from the Hamilton Pro layout (Phase 40).

## Next Phase Readiness

- All 6 Hamilton Pro tables defined and ready for creation on first layout load
- confidence tier logic ready for use by Simulate API (Phase 44)
- hamilton_priority_alerts.signal_id FK to hamilton_signals.id with ON DELETE CASCADE wired
- Phase 39-02 (query layer) can proceed — tables schema is complete

## Self-Check

Files verified:
- `src/lib/hamilton/pro-tables.ts` — FOUND
- `src/lib/hamilton/confidence.ts` — FOUND

Commits verified:
- 4017d5d feat(39-01): create ensureHamiltonProTables() — FOUND
- 48eefe9 feat(39-01): create confidence tier module — FOUND

## Self-Check: PASSED

---
*Phase: 39-data-layer*
*Completed: 2026-04-08*

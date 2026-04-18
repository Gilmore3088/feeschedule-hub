---
phase: 62B-agent-foundation-runtime-layer
plan: 14
subsystem: database
tags: [postgres, seed-data, lineage, uat, fees_published, idempotent, sentinel]

# Dependency graph
requires:
  - phase: 62A-agent-foundation-data-layer
    provides: "fees_raw / fees_verified / fees_published three-tier schema (migration 20260420_fees_tier_tables.sql)"
  - phase: 62B-agent-foundation-runtime-layer
    provides: "lineage_graph() SQL function + /admin/agents Lineage tab (plan 62B-13 RecentPicker)"
provides:
  - "Idempotent seed script that inserts 10 full-lineage chains (fees_raw → fees_verified → fees_published) so UAT Test 6 has trace targets"
  - "Reversal script that sentinel-filters DELETE statements in reverse FK order"
  - "Operator notes documenting why the seed exists, how to run, how to reverse, and when to delete"
affects: [62B-13, 63-knox, 64-darwin, lineage-uat]

# Tech tracking
tech-stack:
  added: []  # no new deps — reuses `postgres` npm client + `dotenv` per established scripts/apply-*.mjs pattern
  patterns:
    - "Sentinel-tagged seed data: fee_name prefix 'DEMO: ' + canonical_fee_key '__demo_62b_14__' + outlier_flags 'demo_62b_14' for idempotence + clean reversal"
    - "Transactional seed with sql.begin() to keep full FK chains atomic"
    - "Env-gated ops scripts — early-exit if DATABASE_URL missing (matches scripts/apply-drift.mjs)"

key-files:
  created:
    - "scripts/seed-62b-lineage-demo.mjs — idempotent 30-row seed (10 raw + 10 verified + 10 published) with sentinel markers"
    - "scripts/unseed-62b-lineage-demo.mjs — reverse-FK-order DELETE filtered by sentinels"
    - ".planning/phases/62B-agent-foundation-runtime-layer/62B-14-SEED-NOTES.md — operator reference (why/how/reverse/when-to-delete)"
  modified: []

key-decisions:
  - "Use fees_raw.source = 'manual_import' (CHECK-compliant) and overload outlier_flags with 'demo_62b_14' as the raw-tier sentinel instead of widening the CHECK constraint for a demo"
  - "Direct INSERT into fees_published bypasses the promote_to_tier3 stub (which requires an adversarial handshake that hasn't been exercised) — documented as intentional in the seed script docstring"
  - "Sentinel UUID '00000000-0000-0000-0000-dead62b14aaa' for all three agent_event_id fields — recognizable, valid UUID format, easy to query"
  - "Institution IDs 1..10 hard-coded — migration comment notes the institution_id FK is not enforced at the table level"

patterns-established:
  - "Sentinel-based idempotent/reversible seed script: any future UAT unblock can follow this template (pre-check count → no-op if present; reverse-FK-order DELETE filtered by the sentinel)"
  - "Demo data cross-tier tagging: mark demo rows at every tier so downstream filters (Hamilton, /admin/market) can exclude them when real data ships"

requirements-completed: [OBS-02]

# Metrics
duration: 3min
completed: 2026-04-18
---

# Phase 62B Plan 14: Lineage Demo Seed Summary

**Idempotent seed + unseed scripts that inject 10 full-lineage chains (fees_raw → fees_verified → fees_published) with sentinel markers so UAT Test 6 (Lineage tab) has trace targets until Phase 63/64 produces real data.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-18T18:33:00Z
- **Completed:** 2026-04-18T18:35:23Z
- **Tasks:** 3
- **Files created:** 3
- **Files modified:** 0

## Accomplishments
- Unblocked UAT Gap 6a — `fees_published` now has a deterministic path to 10 trace-ready rows (after the seed is run against `DATABASE_URL`)
- Idempotent: re-running the seed is a no-op; reversal is sentinel-scoped and safe-to-run-multiple-times
- No schema migration, no src/ or fee_crawler/ code changes — pure ops scripts + docs per the plan's must-NOT-modify boundary

## Task Commits

Each task was committed atomically:

1. **Task 1: Create scripts/seed-62b-lineage-demo.mjs** — `5974398` (feat)
2. **Task 2: Create scripts/unseed-62b-lineage-demo.mjs** — `0f32f7d` (feat)
3. **Task 3: Write 62B-14-SEED-NOTES.md operator notes** — `f08c8b7` (docs)

_Plan metadata commit will be added by the final commit step (SUMMARY.md)._

## Files Created/Modified
- `scripts/seed-62b-lineage-demo.mjs` — 157-line idempotent seed script. Checks `fees_published WHERE canonical_fee_key = '__demo_62b_14__'` before inserting; if already present, no-ops. Otherwise runs a single `sql.begin` transaction writing 10 rows to each of `fees_raw`, `fees_verified`, `fees_published` with full FK chain (raw → verified via `fee_raw_id`; verified → published via `lineage_ref = fee_verified_id`). Sentinel-marked in all 3 tiers.
- `scripts/unseed-62b-lineage-demo.mjs` — 65-line reversal. Deletes rows in reverse FK order (`fees_published` → `fees_verified` → `fees_raw`) filtered by the sentinel values. Transactional. Prints `Nothing to remove` when the seed is absent.
- `.planning/phases/62B-agent-foundation-runtime-layer/62B-14-SEED-NOTES.md` — 7-section operator reference (Why / What / How to run / How to reverse / When to delete / Invariants / Related).

## Decisions Made

- **Source value = `manual_import`.** The `fees_raw.source` CHECK constraint only allows `('knox','migration_v10','manual_import')`. Widening the CHECK for a demo would be schema churn; instead we pick the closest semantic match and overload `outlier_flags` with `'demo_62b_14'` as the raw-tier sentinel.
- **Direct INSERT into `fees_published`.** The `promote_to_tier3` stub requires an adversarial handshake event that hasn't been exercised end-to-end; the seed bypasses it and writes directly, using the sentinel UUID for `published_by_adversarial_event_id`. Flagged explicitly in the script docstring and SEED-NOTES so future operators don't read this as a pattern for real promotion.
- **Hard-coded `institution_id` values 1..10.** The `fees_raw.institution_id` FK is not enforced at the table level (per migration comment), so the seed doesn't need to JOIN to `institutions` to find valid ids.
- **Sentinel UUID `00000000-0000-0000-0000-dead62b14aaa`.** Valid UUID format, recognizable by eye, easy to query (`WHERE agent_event_id = '00000000-0000-0000-0000-dead62b14aaa'`). Used for all three UUID fields on every seeded row.

## Deviations from Plan

None - plan executed exactly as written. The plan specified the exact script contents; each file was produced verbatim per the `<action>` blocks, with only whitespace preserved to match the `Write` tool's output format. All acceptance criteria verified with `grep`/`node --check`.

_Minor note on acceptance-criteria inconsistency:_ Task 1 acceptance asks for `grep -c "manual_import"` to return `1`, but the plan's own `<action>` block contains two occurrences of `manual_import` — one in a code comment (`// Tier 1 — fees_raw (source='manual_import' is allowed by CHECK constraint)`) and one in the actual INSERT value. The plan's exact-content directive takes precedence over the count, and the underlying intent (CHECK-compliant source is used) is satisfied. No code change needed.

## Issues Encountered

None.

## Self-Check: PASSED

Verified:
- `scripts/seed-62b-lineage-demo.mjs` — FOUND (syntax OK; 3 INSERTs; sql.begin; DATABASE_URL guard; sentinel markers)
- `scripts/unseed-62b-lineage-demo.mjs` — FOUND (syntax OK; 3 WHERE-filtered DELETEs; reverse-FK order; sql.begin; DATABASE_URL guard)
- `.planning/phases/62B-agent-foundation-runtime-layer/62B-14-SEED-NOTES.md` — FOUND (7 required sections present; Phase 63 cross-reference)
- Commits `5974398` (seed), `0f32f7d` (unseed), `f08c8b7` (notes) — all present in `git log`

## User Setup Required

**Operator must run the seed manually against `DATABASE_URL` to actually close UAT Gap 6a:**

```bash
# from repo root, with DATABASE_URL set in .env
node scripts/seed-62b-lineage-demo.mjs
```

Expected output:
```
Inserted (this run): raw=10 verified=10 published=10
Total present:       raw=10 verified=10 published=10
Reverse with:        node scripts/unseed-62b-lineage-demo.mjs
```

After this runs, `/admin/agents/lineage` (plan 62B-13's RecentPicker) will render 10 demo rows, and UAT Test 6 can be re-run end-to-end.

## Next Phase Readiness

- UAT Gap 6a is closed at the artifact level — scripts + docs shipped; running the seed is a one-command operator action.
- Plan 62B-13's RecentPicker will render real rows once the seed is applied.
- Delete window: as soon as Phase 63 (Knox) or Phase 64 (Darwin) produces real `fees_published` rows, run `node scripts/unseed-62b-lineage-demo.mjs` to remove the demo rows before they can pollute Hamilton queries or the national/market index aggregations.

---
*Phase: 62B-agent-foundation-runtime-layer*
*Plan: 14*
*Completed: 2026-04-18*

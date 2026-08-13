---
phase: 21-knowledge-automation
plan: 01
subsystem: pipeline
tags: [python, knowledge, wave-orchestrator, coverage-tracking, pattern-promotion]

# Dependency graph
requires:
  - phase: 20-iterative-deepening
    provides: wave orchestrator with iterative pass loop and _run_single_state
  - phase: 19-wave-orchestrator
    provides: run_wave, run_campaign, wave DB models
provides:
  - append_coverage_note() in loader.py — per-pass coverage delta annotation in state files
  - promoter.py with promote_cross_state_patterns() — automatic cross-state pattern promotion
  - orchestrator wiring: coverage_before/after captured, coverage note appended, post-wave promotion
affects:
  - 21-02-knowledge-automation
  - 22-wave-reporting
  - future wave runs (national.md enriched automatically)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Coverage instrumentation at orchestrator boundary, not inside state agent (single responsibility)"
    - "Non-fatal try/except wrapping for all knowledge side-effects in orchestrator"
    - "Two-level bullet extraction: section-scoped (_extract_patterns) for state files, all-bullets (_extract_all_bullets) for national.md dedup"

key-files:
  created:
    - fee_crawler/knowledge/promoter.py
  modified:
    - fee_crawler/knowledge/loader.py
    - fee_crawler/wave/orchestrator.py

key-decisions:
  - "append_coverage_note placed in loader.py (not orchestrator) to keep orchestrator-level metrics out of state_agent — single responsibility"
  - "promoter.py imports from pruner.py (not duplicating prune logic) — auto-prune fires after promotion if threshold met"
  - "national.md dedup uses _extract_all_bullets (all bullet lines) not _extract_patterns (section-scoped) because promotion blocks use ## not ### New Patterns headers"
  - "All knowledge side-effects in orchestrator wrapped in try/except — corruption or missing file cannot abort a wave run"

patterns-established:
  - "Coverage instrumentation: capture before/after at orchestrator call site, pass both to knowledge layer"
  - "Idempotent promotion: _extract_all_bullets strips state-count annotations to match raw pattern text"

requirements-completed:
  - KNOW-01
  - KNOW-02

# Metrics
duration: 35min
completed: 2026-04-07
---

# Phase 21 Plan 01: Knowledge Automation — Coverage Notes and Cross-State Promotion Summary

**Per-pass coverage delta annotations in state knowledge files, plus automatic promotion of patterns seen in 3+ states to national.md at wave completion**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-04-07T22:30:00Z
- **Completed:** 2026-04-07T23:05:00Z
- **Tasks:** 2
- **Files modified:** 3 (loader.py modified, orchestrator.py modified, promoter.py created)

## Accomplishments
- `append_coverage_note()` added to loader.py — inserts "Coverage after pass: X.X% (+/-Y.Y% delta)" after the stats line in each run block, callable from orchestrator without coupling coverage logic into state_agent
- `fee_crawler/knowledge/promoter.py` created with `promote_cross_state_patterns(min_states=3)` — scans all state files for `### New Patterns` bullets, promotes those appearing in 3+ states to national.md with dedup
- orchestrator.py wired: coverage_before captured before each `run_state_agent()` call, coverage_after + delta computed after, `append_coverage_note()` called with non-fatal exception guard, `promote_cross_state_patterns()` called after `update_wave_run(..., status="complete")` with non-fatal guard

## Task Commits

Each task was committed atomically:

1. **Task 1 + Task 2: Coverage notes (loader + orchestrator) and promoter.py** - `b0afed3` (feat)

**Plan metadata:** committed as part of task commit

## Files Created/Modified
- `fee_crawler/knowledge/loader.py` - Added `append_coverage_note()` after `_promote_to_national()`
- `fee_crawler/knowledge/promoter.py` - New file: `promote_cross_state_patterns()`, `_extract_patterns()`, `_extract_all_bullets()`
- `fee_crawler/wave/orchestrator.py` - Added imports, coverage_before/after in `_run_single_state`, post-wave hook in `run_wave`

## Decisions Made
- `_extract_all_bullets()` added (deviation from plan spec) because the plan's `_extract_patterns()` only scans `### New Patterns` sections, but national.md promotion blocks use `## Cross-State Promotion` headers — making dedup fail on idempotency check. All-bullets scan with annotation stripping (`  [3 states]`) fixes this correctly.
- Both tasks committed in a single commit since they form a cohesive atomic unit (promoter.py is imported by orchestrator.py at the same change point).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed dedup failure in promote_cross_state_patterns idempotency**
- **Found during:** Task 2 verification (inline Python test)
- **Issue:** Plan spec used `_extract_patterns()` for national.md dedup, but that function only scans `### New Patterns` sections. national.md writes under `## Cross-State Promotion` headers with no `### New Patterns` subsection — so already-promoted patterns were invisible to the dedup check, causing re-promotion on every call (idempotency assertion failed: expected 0, got 1).
- **Fix:** Added `_extract_all_bullets()` that scans all bullet lines in a file with state-count annotation stripping (`  [3 states]`). Used this for national.md dedup while keeping `_extract_patterns()` for state file collection (section-scoped is correct there).
- **Files modified:** fee_crawler/knowledge/promoter.py
- **Verification:** Inline test now asserts `count2 == 0` on second run — PASS
- **Committed in:** b0afed3

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug in plan spec)
**Impact on plan:** Essential correctness fix. Without it, every wave completion would re-duplicate every pattern in national.md. No scope creep.

## Issues Encountered
- Worktree is a sparse directory (only `fee_crawler/knowledge/`) — not a git worktree with full checkout. Edits to `loader.py` and `orchestrator.py` initially sent to non-existent worktree paths, had no effect. Resolved by editing main repo paths directly (`/Users/jgmbp/Desktop/feeschedule-hub/fee_crawler/...`).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 21-02 (knowledge CLI `prune` and `status` subcommands) already has a SUMMARY — it was completed in a prior session
- Wave runs will now automatically annotate coverage deltas per pass and promote cross-state patterns post-wave
- national.md will compound with each wave without manual editing

---
*Phase: 21-knowledge-automation*
*Completed: 2026-04-07*

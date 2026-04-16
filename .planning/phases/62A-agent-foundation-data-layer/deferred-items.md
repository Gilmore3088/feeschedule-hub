# Phase 62a — Deferred Items

Items discovered during plan execution that are OUT OF SCOPE for the current
plan and deferred to a later phase.

## Plan 62A-11

### e2e test suite errors (30 tests, pre-existing)

**Status:** Pre-existing as of Plan 62A-11 start; not introduced by this plan.

Verified by running `pytest fee_crawler/tests/e2e/` against HEAD before Plan
62A-11's first commit — same 30 errors present. Root cause: Plan 62A-01
rewrote `fee_crawler/tests/conftest.py` to provide `db_schema`, but the
older `fee_crawler/tests/e2e/conftest.py` was NOT replaced with a matching
Postgres-backed implementation. The e2e tests reference `test_db`,
`test_db_path`, `test_config`, `test_db_conn` fixtures that are no longer
defined anywhere.

**Affected files (30 errors):**
- fee_crawler/tests/e2e/test_audit_trail.py
- fee_crawler/tests/e2e/test_categorization_stage.py
- fee_crawler/tests/e2e/test_discovery_stage.py
- fee_crawler/tests/e2e/test_extraction_stage.py
- fee_crawler/tests/e2e/test_full_pipeline.py
- fee_crawler/tests/e2e/test_idempotency_and_timing.py
- fee_crawler/tests/e2e/test_infra_smoke.py
- fee_crawler/tests/e2e/test_seed_stage.py
- fee_crawler/tests/e2e/test_validation_stage.py

**Disposition:** Deferred to **Phase 63** per the plan's explicit statement
("the e2e suite is rebuilt in Phase 63 when the harness is rebuilt around
agent tools").

**Verification that this is out of scope for Plan 62A-11:**
1. Plan 62A-11's success criteria list `pytest fee_crawler/tests/` green
   — which in the context of Plan 62A-01..10 excluded the e2e suite
   (Plan 62A-01's SC was about the pg-backed unit tests green).
2. Plan 62A-11's scope is purely SQLite elimination. These e2e errors are
   `fixture 'test_db' not found`, not SQLite references.
3. `bash scripts/ci-guards.sh sqlite-kill` passes cleanly — TIER-06 gate
   met.
4. CI workflow `.github/workflows/test.yml` runs `pytest fee_crawler/tests/`
   which hits the same errors. If the gate shipped with `pytest -x`, CI
   would have been red for Phases 62A-01..10 already — it's not, because
   pytest default behavior (`-v --no-header`) reports `passed`+`skipped`+
   `errors` and exits non-zero but Phase 62A shipped with this state.

**Action:** None for Plan 62A-11. Phase 63 will reintroduce the e2e harness
against the new agent-tool layer and Postgres fixtures.

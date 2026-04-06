# Phase 11: Modal Pre-flight - Context

**Gathered:** 2026-04-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Create a Modal function that runs the pipeline test in Modal's execution environment, using an isolated test database (SQLite in /tmp, not production Supabase). This is a pre-flight validation — run before production crons to confirm Modal environment is healthy.

</domain>

<decisions>
## Implementation Decisions

### Modal Function
- **D-01:** Add a `preflight_e2e` function to the existing `fee_crawler/modal_app.py` (or a new `modal_preflight.py`). Uses Modal's `@app.function()` decorator.
- **D-02:** The function seeds 1-3 FDIC institutions, runs discovery + extraction + categorize + validate, and returns a structured pass/fail result.
- **D-03:** Uses SQLite in `/tmp/preflight_test.db` (Modal's ephemeral filesystem) — not production Supabase.

### Isolation
- **D-04:** Assert no production DB writes by: (a) never connecting to DATABASE_URL, (b) using a Config with `database.path=/tmp/preflight_test.db`.
- **D-05:** R2 storage bypassed (no R2_ENDPOINT in preflight env).

### Triggering
- **D-06:** Callable via `modal run fee_crawler/modal_preflight.py::preflight_e2e` or via HTTP endpoint.
- **D-07:** Returns JSON: `{"status": "pass"|"fail", "institutions": N, "fees_extracted": N, "duration_s": float, "errors": [...]}`

### Claude's Discretion
- Whether to add to existing modal_app.py or create a new file
- Image definition (reuse existing Modal image or define preflight-specific)
- How to integrate with production cron (manual trigger vs automatic pre-check)

</decisions>

<canonical_refs>
## Canonical References

- `fee_crawler/modal_app.py` — Existing Modal app with scheduled functions
- `fee_crawler/config.py` — Config class for DB path override
- `fee_crawler/tests/e2e/test_full_pipeline.py` — Phase 9 full pipeline pattern

</canonical_refs>

---

*Phase: 11-modal-pre-flight*
*Context gathered: 2026-04-06*

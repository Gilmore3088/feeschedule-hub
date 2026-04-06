# Phase 8: Idempotency and Timing - Context

**Gathered:** 2026-04-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Test that running pipeline stages twice against the same data produces no duplicate rows (idempotency), and that each stage completes within a configurable time budget (timing). Uses synthetic data for idempotency; timing assertions wrap stage invocations.

</domain>

<decisions>
## Implementation Decisions

### Idempotency (IDEM-01)
- **D-01:** Use synthetic data: pre-populate crawl_targets + extracted_fees, run categorize + validate twice, assert row counts are identical. This avoids expensive real LLM calls for the idempotency check.
- **D-02:** The key idempotency concern is `merge_fees` and categorize — these are the stages most likely to create duplicate rows. Test both.
- **D-03:** Assert exact row count equality between run 1 and run 2, not just "no new rows" — catches both insertions and deletions.
- **D-04:** Mark `@pytest.mark.e2e` only (synthetic data, no LLM).

### Timing (TIME-01)
- **D-05:** Use `time.monotonic()` around each stage invocation and assert against configurable budgets. Don't test real extraction timing (too variable) — test categorize and validate which are deterministic.
- **D-06:** Time budgets should be generous (10x expected) to avoid flaky failures. The point is catching hangs, not benchmarking.
- **D-07:** Mark timing tests `@pytest.mark.e2e` only.

### Claude's Discretion
- Specific time budget values
- Which stages to time (at minimum: categorize, validate)
- Whether to use a single fixture or separate ones

</decisions>

<canonical_refs>
## Canonical References

- `fee_crawler/commands/categorize.py` — categorize CLI command
- `fee_crawler/commands/validate.py` — validate CLI command
- `fee_crawler/pipeline/executor.py` — PIPELINE_STAGES list
- `fee_crawler/db.py` — extracted_fees schema
- `fee_crawler/tests/e2e/test_categorization_stage.py` — synthetic data pattern

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable
- Synthetic data fixture pattern from Phases 5-7
- Function-scoped fixtures for fast tests

### Key Concern
- `merge_fees` stage may INSERT ON CONFLICT — test that second run doesn't create dupes

</code_context>

<specifics>
## Specific Ideas

No specific requirements.

</specifics>

<deferred>
## Deferred Ideas

None

</deferred>

---

*Phase: 08-idempotency-and-timing*
*Context gathered: 2026-04-06*

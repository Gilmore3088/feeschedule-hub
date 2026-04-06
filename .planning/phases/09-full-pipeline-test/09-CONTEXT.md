# Phase 9: Full Pipeline Test - Context

**Gathered:** 2026-04-06
**Status:** Ready for planning

<domain>
## Phase Boundary

A single `@pytest.mark.slow` test that chains seed → discover → extract → categorize → validate for 3-5 institutions from a random geography. Produces a human-readable summary report to stdout. This is the capstone e2e test — everything live, real APIs, real LLM.

</domain>

<decisions>
## Implementation Decisions

### Pipeline Chain
- **D-01:** Single test function that calls each stage sequentially: seed_fdic → _discover_one → _crawl_one → categorize_fees.run → backfill_validation.run. Reuses the patterns proven in Phases 2-6.
- **D-02:** Use the `geography` fixture from Phase 1 conftest for random state selection. Default pool: VT, RI, NH, ME, DE (small states, WY excluded).
- **D-03:** Mark `@pytest.mark.e2e @pytest.mark.llm @pytest.mark.slow` — this test does everything.

### Summary Report
- **D-04:** Print a structured report to stdout at test end using `print()` (captured by pytest -s). Include: state used, institutions processed, fees extracted per institution, failures with stage/reason, wall-clock time per stage.
- **D-05:** Also write the report to a file (`fee_crawler/tests/e2e/reports/` directory) for CI artifact collection.

### Failure Handling
- **D-06:** The test should pass as long as at least 1 institution completes the full pipeline. Individual institution failures are logged in the report but don't fail the test.
- **D-07:** If ALL institutions fail at any stage, the test fails with a clear message about which stage was the bottleneck.

### Fixture Design
- **D-08:** Module-scoped `pipeline_db` fixture: clean slate → seed → discover → extract → categorize → validate. Yield DB + report data for the test to assert and print.
- **D-09:** Socket timeout (15s for discovery, 30s for extraction) from Phase 3/4 learnings.

### Claude's Discretion
- Report formatting (table vs prose)
- Whether to time individual institutions or just stages
- File location for report output

</decisions>

<canonical_refs>
## Canonical References

### Stage Entry Points
- `fee_crawler/commands/seed_institutions.py` — seed_fdic (limit param)
- `fee_crawler/commands/discover_urls.py` — _discover_one
- `fee_crawler/commands/crawl.py` — _crawl_one
- `fee_crawler/commands/categorize.py` — categorize_fees.run() or equivalent
- `fee_crawler/commands/validate.py` — backfill_validation.run() or equivalent

### Test Infrastructure
- `conftest.py` (root) — geography fixture with --geography CLI option
- `fee_crawler/tests/e2e/conftest.py` — test_db, test_config fixtures
- `fee_crawler/tests/e2e/test_extraction_stage.py` — self-contained seed→discover→extract pattern

</canonical_refs>

<code_context>
## Existing Code Insights

### Pattern to Follow
- Phase 4's `extracted_db` fixture already chains seed → discover → extract
- Phase 9 extends this with categorize → validate → report

### Learnings Applied
- seed_fdic(limit=N) fetches 1000 rows — cap target queries with LIMIT
- No threading for discovery/extraction — run in main thread
- socket.setdefaulttimeout() for hung SSL reads
- Module-scoped fixtures can't cross files — self-contained fixture

</code_context>

<specifics>
## Specific Ideas

No specific requirements beyond what's in the roadmap.

</specifics>

<deferred>
## Deferred Ideas

None

</deferred>

---

*Phase: 09-full-pipeline-test*
*Context gathered: 2026-04-06*

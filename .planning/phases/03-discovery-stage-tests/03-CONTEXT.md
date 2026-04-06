# Phase 3: Discovery Stage Tests - Context

**Gathered:** 2026-04-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Test that the URL discoverer finds fee schedule URLs for seeded institutions and records every attempt in `discovery_cache`. Uses Phase 2's seeded DB as input. Discovery hits real websites — failure tolerance and timing are key design concerns.

</domain>

<decisions>
## Implementation Decisions

### Failure Tolerance
- **D-01:** Assert at least 1 institution out of the seeded set gets a `fee_schedule_url` populated. Do NOT assert all succeed — real websites fail for legitimate reasons (site down, no fee schedule published, JS-only).
- **D-02:** Assert that ALL seeded institutions have discovery_cache entries regardless of outcome — every attempt must be recorded, success or failure.
- **D-03:** Mark the test `@pytest.mark.slow` in addition to `@pytest.mark.e2e` — discovery involves real HTTP requests and may take 30-120 seconds per institution.

### Discovery Depth
- **D-04:** Run the full cascading discovery pipeline (the real `discover` command or `UrlDiscoverer` class) — don't test individual methods in isolation. This is an e2e test, not a unit test.
- **D-05:** Use a reasonable timeout per institution (e.g., 60s) to prevent the test from hanging on an unresponsive site. If the discoverer doesn't have a built-in timeout, wrap the call.

### Cache Assertions
- **D-06:** Assert each `discovery_cache` row has non-null `method` and `result` fields. The `result` should be one of the expected enum values (found/not_found/error).
- **D-07:** For institutions where discovery succeeded, assert the `found_url` field is populated and looks like a valid URL (starts with http/https).
- **D-08:** Don't assert on specific discovery method order — the cascade is an implementation detail. Just verify the cache records what was tried.

### Claude's Discretion
- Test file location and organization
- Whether to reuse the `seeded_db` fixture from Phase 2 or create a discovery-specific fixture
- How to handle the slow test scenario (timeout, skip conditions)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Discovery Implementation
- `fee_crawler/pipeline/url_discoverer.py` — UrlDiscoverer class, cascading discovery methods
- `fee_crawler/commands/seed_institutions.py` — seed functions (already tested in Phase 2)

### Database Schema
- `fee_crawler/db.py` — `discovery_cache` table schema, `crawl_targets.fee_schedule_url` field

### Test Infrastructure
- `fee_crawler/tests/e2e/conftest.py` — `test_db`, `test_config` fixtures
- `fee_crawler/tests/e2e/test_seed_stage.py` — `seeded_db` fixture pattern

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `seeded_db` fixture from Phase 2: provides a DB with institutions already in `crawl_targets`
- `test_config` fixture: provides Config with all paths overridden

### Established Patterns
- Phase 2 tests use function-scoped `seeded_db` that truncates before/after
- Discovery may need a session-scoped or module-scoped seeded fixture to avoid re-seeding per test

### Integration Points
- Discovery reads from `crawl_targets` (populated by Phase 2 seed)
- Discovery writes to `crawl_targets.fee_schedule_url` and `discovery_cache`
- Phase 4 (extraction) will read `fee_schedule_url` from discovered institutions

</code_context>

<specifics>
## Specific Ideas

- VT/RI institutions are real — some community banks/CUs may have simple static sites where discovery works well
- The full discovery cascade can be slow; consider testing with a subset of seeded institutions (e.g., first 3)
- Discovery success depends on the institution's website being up — test must be resilient to transient failures

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-discovery-stage-tests*
*Context gathered: 2026-04-06*

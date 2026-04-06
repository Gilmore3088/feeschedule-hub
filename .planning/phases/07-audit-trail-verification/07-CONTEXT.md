# Phase 7: Audit Trail Verification - Context

**Gathered:** 2026-04-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Test FK integrity across pipeline tables (crawl_targets → crawl_results → extracted_fees → fee_reviews), detect orphaned rows via LEFT JOIN queries, verify non-zero extraction, and confirm status transition audit trail. Uses synthetic pre-populated data.

</domain>

<decisions>
## Implementation Decisions

### Test Strategy
- **D-01:** Use synthetic data with a full FK chain (crawl_targets → crawl_runs → crawl_results → extracted_fees → fee_reviews). Pre-populate all tables with known relationships, then assert no orphans via LEFT JOIN.
- **D-02:** Mark tests `@pytest.mark.e2e` only — pure SQL assertions, no network/LLM calls.
- **D-03:** AUDT-03 (non-zero extraction) can be tested with the same synthetic data — just assert count > 0.
- **D-04:** AUDT-04 (status transition audit): insert a fee with review_status='staged' and a corresponding fee_reviews row with action='stage'. Assert the relationship holds.

### Orphan Detection
- **D-05:** Use LEFT JOIN with IS NULL to detect orphans in both directions. Also insert deliberate orphans in setup to verify the JOIN catches them (negative test).
- **D-06:** Test both AUDT-01 (crawl_results → crawl_targets) and AUDT-02 (extracted_fees → crawl_results) with separate assertions.

### Fixture Design
- **D-07:** Function-scoped `audit_db` fixture: insert complete FK chain with known data, yield DB, clean up. Fast execution (< 1s).

### Claude's Discretion
- Specific test data values
- Whether to test deliberate orphan insertion + detection
- Test file organization

</decisions>

<canonical_refs>
## Canonical References

### Database Schema
- `fee_crawler/db.py` — All table schemas: crawl_targets, crawl_runs, crawl_results, extracted_fees, fee_reviews
- FK constraints: crawl_results.crawl_target_id → crawl_targets.id, extracted_fees.crawl_result_id → crawl_results.id

### Test Infrastructure
- `fee_crawler/tests/e2e/conftest.py` — `test_db`, `test_config` fixtures
- `fee_crawler/tests/e2e/test_categorization_stage.py` — synthetic data fixture pattern

</canonical_refs>

<code_context>
## Existing Code Insights

### Key Pattern
- Same synthetic data approach as Phases 5-6
- Pure SQL assertion tests — LEFT JOIN orphan detection
- Function-scoped fixtures (fast)

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

*Phase: 07-audit-trail-verification*
*Context gathered: 2026-04-06*

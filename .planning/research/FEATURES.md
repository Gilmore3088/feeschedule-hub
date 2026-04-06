# Feature Landscape: E2E Pipeline Test Suite

**Domain:** End-to-end tests for a Python data extraction pipeline (seed → discover → crawl → extract → categorize → validate → audit)
**Researched:** 2026-04-06
**Confidence:** HIGH (based on codebase inspection + verified against Start Data Engineering articles and community patterns)

---

## Table Stakes

Features without which the tests are useless or untrustworthy.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Isolated test database | Without this, tests corrupt dev/prod data or are contaminated by prior state. Non-negotiable. | Low | Use `tmp_path` or in-memory SQLite. `db.py` already supports path injection via `Config`. |
| Geography-scoped institution seeding | Tests must start from a real cold start. Seeding 3-5 institutions from a real state/county gives a realistic, bounded corpus. | Low | `seed_institutions.py` + FDIC API already support `--state` filtering. |
| Stage-by-stage execution with a captured run_id | Must be able to drive the pipeline programmatically and reference the run for post-run assertions. | Low | `run_pipeline()` already returns `run_id`. E2e test wraps it. |
| Non-zero fee extraction assertion | Proves the pipeline isn't silently returning empty results. Must assert `extracted_fees` count > 0 across the seeded institutions. | Low | Flexible bound: ≥1 fee per institution that had a URL discovered. |
| URL discovery assertion | Proves discovery stage works: at least 1 of the seeded institutions must have a `fee_schedule_url` populated in `crawl_targets`. | Low | Discovery may fail for some institutions — assert at least partial success. |
| Crawl result record verification | Each attempted crawl must produce a `crawl_results` row with a non-null status. Verifies the audit trail at the crawl layer. | Low | Assert status IN ('success', 'failed', 'unchanged') — all are valid, but NULL is not. |
| Extracted fees FK integrity | Every `extracted_fees` row must reference a valid `crawl_result_id` and `crawl_target_id`. Catches silent FK violations (especially after schema migrations). | Low | One SQL assertion: `LEFT JOIN` check for orphaned rows. |
| Fee categorization coverage | At least one extracted fee must have a non-null `fee_category`. Verifies `categorize_fees.py` ran and produced output. | Low | Does not require 100% categorization — pipeline is expected to leave some uncategorized. |
| Confidence scoring populated | At least one extracted fee must have `extraction_confidence > 0`. Confirms validation ran and scored fees. | Low | `backfill_validation.py` populates this field. |
| Auto-staging result assertion | At least one fee with `extraction_confidence >= 0.85` must have `review_status = 'staged'`. Confirms `auto_review.py` ran. | Low | This is the 0.85 threshold in `Config.extraction.confidence_auto_stage_threshold`. |
| Human-readable summary report | Tests must emit what was found, what was extracted, and which stages failed. Required for debugging failures in CI. | Low | Mirrors `_print_run_report()` from `executor.py` but scoped to the test run's institutions. |
| Teardown / cleanup | Test database and any downloaded documents must be removed after the run. Prevents disk accumulation in CI. | Low | `tmp_path` fixture handles SQLite. Need explicit cleanup for `data/documents/` if R2 is bypassed. |

---

## Differentiators

Features that elevate test quality beyond "it ran without crashing."

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Per-institution funnel trace | For each seeded institution: was a URL found? Was it crawled? Were fees extracted? Were fees categorized? Surfaces exactly where the pipeline broke per institution rather than just aggregate counts. | Medium | Implemented as a structured dict keyed by `crawl_target_id`, built from joins across 4 tables. |
| Audit trail completeness check | Verify that `fee_reviews` rows exist for every fee that transitioned to 'staged' or 'approved'. The pipeline must leave an immutable record of every status change. | Medium | One SQL assertion: `extracted_fees` with `review_status = 'staged'` must have corresponding `fee_reviews` rows with `action = 'stage'`. |
| fee_category distribution assertion | Among extracted fees, assert the distribution spans at least N distinct `fee_category` values (e.g., ≥ 2). Proves categorization didn't collapse everything into one bucket. | Low | Fragile if institution count is very small — guard with `if total_fees >= 5`. |
| Confidence distribution sanity check | Assert that no fee has `extraction_confidence > 1.0` or `< 0.0`. Also assert median confidence is above some floor (e.g., 0.6). Catches broken confidence scoring. | Low | Pure SQL — fast and always valid regardless of institution selection. |
| Validation flags format check | `validation_flags` is a JSON array. Assert it parses as valid JSON for all non-null rows. Catches serialization bugs in `validation.py`. | Low | `json.loads()` in a loop — trivial to implement. |
| Parametric geography fixture | Rather than hardcoding a state, accept `--geography state=XX` as a pytest CLI option. Lets CI run the same test suite against different geographies on different days. | Medium | Uses `pytest_addoption` + fixture that reads the option. Falls back to a deterministic default (e.g., 'VT' — small state, fast run). |
| Stage timing capture | Record wall-clock time per pipeline stage and emit it in the summary. Catches performance regressions (e.g., a query becoming 10x slower) without formal benchmarking. | Low | Wrap `_execute_stage()` calls with `time.perf_counter()`. |
| Idempotency test | Run the full pipeline twice against the same institutions. Assert that the second run does not create duplicate `extracted_fees` rows. Tests the `UNIQUE(source, cert_number)` constraint and merge logic in `merge_fees.py`. | High | Requires running the pipeline twice in the same test. Valuable but slow (doubles run time). Mark as `@pytest.mark.slow`. |
| Skip-stage selective execution | Allow the e2e test to skip specific stages (e.g., skip `publish` and `snapshot` which have external side effects). Maps directly to `run_pipeline(skip=frozenset(...))`. | Low | Already supported by `executor.py` — test just needs to pass the right `skip` set. |
| Document content hash verification | For institutions where a document was downloaded, assert `crawl_results.content_hash` is non-null and is a valid SHA-256 hex string (64 chars). Verifies the R2/local store wrote correctly. | Low | Regex match on the hash column. |

---

## Anti-Features

Features to deliberately NOT build in this milestone.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Exact fee value assertions | LLM extraction is non-deterministic. Asserting `monthly_maintenance = $12.00` will flake across runs and across institutions. | Assert structural properties: non-null, amount > 0, amount < 10000 (sanity bound). |
| Mocking the LLM call | Mocking Claude Haiku removes the point of e2e testing. If the prompt changes or the schema breaks, a mocked test won't catch it. | Use real LLM calls, limited to 3-5 institutions to keep cost under $0.10/run. |
| Mocking HTTP / crawl responses | Same issue. If Playwright or pdfplumber regresses, mock tests won't catch it. The value of e2e is real I/O. | Use real institutions (small state geography) so pages are actually fetched. |
| Assertion on `fee_name` text | Fee names are raw LLM output strings. They will vary. Asserting on exact strings will flake immediately. | Assert `fee_name IS NOT NULL AND LENGTH(fee_name) > 0`. |
| Coverage of all 49 fee categories | You cannot guarantee a random 3-5 institution sample covers all 49 categories. This assertion will randomly fail. | Assert `fee_category IN (select valid categories from taxonomy)` — validate the values, not the count. |
| Performance benchmarking assertions | "Stage must complete in < 30s" will flake in CI based on network conditions and LLM response time. | Emit timing in the report for visibility, but do not assert on it. |
| Testing Modal-specific execution paths in unit test scope | Modal remote execution is an infrastructure concern, not a pipeline logic concern. | Verify that Modal workers call the same `run_pipeline()` entry point. Test that entry point, not Modal. |
| Browser-based admin UI assertions | Out of scope per PROJECT.md. `/admin/fees/catalog` is tested separately. | Defer to a Playwright/Cypress test suite in a future milestone. |
| SerpAPI discovery fallback | PROJECT.md explicitly excludes this. | Do not stub or exercise this path. |
| Testing DB migration scripts | Migration correctness belongs in schema tests, not e2e tests. | Add to the existing `fee_crawler/tests/` unit suite if needed. |
| Parallel institution crawling during tests | `concurrent_per_domain: 1` is required by PROJECT.md constraints. Parallel crawling adds test flakiness. | Always run with `workers=1` in test config. |

---

## Feature Dependencies

```
Geography fixture
  → Institution seeding (requires fixture to know which state)
    → URL discovery assertion (requires seeded institutions)
      → Crawl result assertion (requires discovered URLs)
        → Extracted fees assertion (requires crawl results)
          → FK integrity check (requires extracted fees)
          → Categorization assertion (requires extracted fees)
          → Confidence assertion (requires extracted fees + validation stage)
            → Auto-staging assertion (requires confidence scores)
              → Audit trail assertion (requires staged fees in fee_reviews)

Per-institution funnel trace (depends on all of the above)
Summary report (depends on all of the above)

Idempotency test (depends on the full pipeline completing once, then re-running)
```

---

## MVP Recommendation

Build in this order:

1. **Isolated test database fixture** — pytest fixture using `tmp_path`, injects a `Config` pointing at a temp SQLite file. All other tests depend on this.
2. **Geography-scoped seeding** — call `seed_institutions.py` `run()` with `state='VT'` (or a configurable default). Verify 3-5 institutions are seeded.
3. **Full pipeline execution** via `run_pipeline()` with `skip={'snapshot', 'publish-index'}` (skip external-side-effect stages). Capture `run_id`.
4. **Core assertions** in order: URL discovery → crawl results → extracted fees → FK integrity → categorization → confidence → auto-staging.
5. **Audit trail assertion** — fee_reviews rows exist for staged fees.
6. **Summary report** — emit per-institution funnel + aggregate counts to stdout.

Defer:
- **Idempotency test**: Valuable but doubles run time. Add as `@pytest.mark.slow`, excluded from default CI run.
- **Parametric geography fixture**: Add in a follow-up once the basic test is stable. Default to 'VT' for now.
- **Stage timing capture**: Easy to add to the summary report but not a blocker for MVP.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Table stakes identification | HIGH | Derived directly from pipeline schema and PROJECT.md constraints |
| Differentiator selection | HIGH | Audit trail / FK integrity patterns verified against pipeline schema |
| Anti-feature rationale | HIGH | Non-determinism patterns verified against LLM testing literature |
| Complexity estimates | MEDIUM | Based on codebase familiarity; actual effort depends on fixture setup |

---

## Sources

- [Setting up end-to-end tests for cloud data pipelines — Start Data Engineering](https://www.startdataengineering.com/post/setting-up-e2e-tests/)
- [How to Write Integration Tests for Python Data Pipelines — Start Data Engineering](https://www.startdataengineering.com/post/python-datapipeline-integration-test/)
- [Testing AI Agents: Validating Non-Deterministic Behavior — SitePoint](https://www.sitepoint.com/testing-ai-agents-deterministic-evaluation-in-a-non-deterministic-world/)
- [LLM Testing: A Practical Guide — Langfuse](https://langfuse.com/blog/2025-10-21-testing-llm-applications)
- [A Complete Guide to Data Engineering Testing with Python — Medium/Datainsights](https://medium.com/@datainsights17/a-complete-guide-to-data-engineering-testing-with-python-best-practices-for-2024-bd0d9be2d9ca)
- Codebase inspection: `fee_crawler/pipeline/executor.py`, `fee_crawler/db.py`, `fee_crawler/tests/test_executor.py`

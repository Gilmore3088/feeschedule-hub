# Domain Pitfalls: E2E Pipeline Testing (Crawl + LLM Extraction)

**Domain:** End-to-end testing of Python data pipelines with real HTTP, LLM calls, and DB verification
**Project:** Bank Fee Index — fee_crawler e2e test suite
**Researched:** 2026-04-06

---

## Critical Pitfalls

Mistakes that cause rewrites, contaminate production data, or make the test suite permanently unreliable.

---

### Pitfall 1: Test Database Contamination

**What goes wrong:** The e2e test writes crawl targets, crawl results, and extracted fees into the same
SQLite file used for local development (`data/crawler.db`). After the test run the dev DB contains
3-5 fake institutions and fake fees. Future manual exploration shows misleading data. A re-run without
cleanup double-inserts rows, hitting the `UNIQUE(source, cert_number)` constraint and silently
skipping re-seeding, causing later assertions to pass on stale data.

**Why it happens:** The `Database` class reads its path from `Config`, which defaults to `data/crawler.db`.
If the test fixture does not override the config before constructing the DB object, the default path is used.

**Consequences:**
- Median fee calculations on the admin dashboard are polluted by test institutions.
- The `crawl_targets` UNIQUE constraint means a second e2e run does not re-seed — it silently reuses
  stale rows, which may have a different `status` or `fee_schedule_url` from a previous run.
- CI on Modal shares no filesystem, so contamination may appear only locally, masking the problem.

**Prevention:**
- Create a pytest fixture with `scope="session"` that sets `DATABASE_URL` (or patches `Config.database.path`)
  to a temp file (`tmp_path_factory` or `:memory:`) before any test runs.
- Use `yield` in the fixture so teardown unconditionally deletes the temp file even on assertion failures.
- Assert at fixture teardown that the production DB path was never touched (check `mtime` before/after).

**Detection (warning signs):**
- Admin fee counts spike after running pytest locally.
- Second e2e run completes faster than first (stale targets reused silently).
- `UNIQUE constraint failed` errors in test output that are swallowed.

**Phase:** Address in Phase 1 (test infrastructure) before any real crawling is attempted.

---

### Pitfall 2: SQLite–PostgreSQL Behavioral Divergence

**What goes wrong:** The pipeline uses SQLite locally and PostgreSQL (Supabase) in production. The e2e
test uses an isolated SQLite file. Tests pass locally but the same pipeline logic fails in production
because SQLite and PostgreSQL differ in:

- `RETURNING` clause syntax (SQLite added it in 3.35; older distros lack it)
- `UNIQUE` constraint violation handling on `INSERT OR IGNORE` vs Postgres `ON CONFLICT DO NOTHING`
- `datetime('now')` vs `NOW()` / `CURRENT_TIMESTAMP`
- Case-sensitivity of `LIKE` on text columns
- Foreign key enforcement (SQLite requires `PRAGMA foreign_keys = ON`; easy to forget in test DB setup)

**Why it happens:** Tests written against the isolated SQLite DB pass because SQLite silently accepts
constructs that fail or behave differently on Postgres. The discrepancy surfaces only in production.

**Consequences:** Pipeline stages that pass e2e locally fail on Modal/Supabase deployments. The test
suite provides false confidence.

**Prevention:**
- Set `PRAGMA foreign_keys = ON` in the test DB connection immediately after creation.
- Include at least one smoke-test CI run against a real Postgres instance (e.g., `psycopg2` pointing
  at a Supabase test schema or a Dockerised Postgres).
- Document which SQL constructs the pipeline uses that are SQLite-only.

**Detection (warning signs):**
- Any SQL using `RETURNING`, `ON CONFLICT`, `jsonb`, window functions, or Postgres-specific casts.
- Pipeline passes e2e locally but fails on first Modal deploy.

**Phase:** Note risk in Phase 1 setup; address in Phase 3 (CI/Modal validation).

---

### Pitfall 3: Asserting Exact Values Against Non-Deterministic LLM Output

**What goes wrong:** The test asserts `extracted_fees[0]["amount"] == 15.00` or
`len(extracted_fees) == 12`. Claude Haiku may return slightly different fee counts, different
confidence scores, or rephrase a fee name, causing the assertion to fail on re-run even though the
pipeline is working correctly. Tests become flaky and developers start ignoring failures.

**Why it happens:** LLMs have non-zero temperature by default. Even with `temperature=0`, the Anthropic
API does not guarantee deterministic output across model versions. Tool-use schemas constrain the
structure but not the count or exact values of extracted fees.

**Consequences:**
- Flaky tests erode trust. When the test suite fails 20% of the time by chance, real regressions are
  dismissed as "probably just LLM variance."
- Test runs that re-run on failure to check for flakiness double the real API cost.

**Prevention:**
- Assert structural properties, not exact values:
  - `len(extracted_fees) >= 1` (non-zero extraction)
  - `all(f["amount"] > 0 for f in extracted_fees)` (positive amounts)
  - `all(f["category"] in VALID_CATEGORIES for f in extracted_fees)` (valid taxonomy)
  - `all(0.0 <= f["confidence"] <= 1.0 for f in extracted_fees)` (confidence in range)
- Assert that `crawl_results` rows exist with `status = 'success'` — the pipeline ran — rather than
  auditing every extracted value.
- Test exact extraction logic in unit tests with pre-recorded LLM responses (mocked `anthropic` client).

**Detection (warning signs):**
- Test failures that disappear on re-run with no code change.
- Assertions comparing specific fee amounts extracted from real institution websites.

**Phase:** Address in Phase 1 (assertion design) to prevent the pattern from being baked in.

---

### Pitfall 4: Fixture State Leaking Between Test Functions

**What goes wrong:** A session-scoped fixture creates the test database and populates it with seed
institutions. One test modifies those rows (e.g., marks targets as `crawled`). A later test in the same
session assumes all targets are in the initial state and fails intermittently depending on test
execution order.

**Why it happens:** `scope="session"` fixtures persist across all tests in the session. Any write
in one test is visible to all subsequent tests. Pytest does not run tests in a deterministic order
by default unless `pytest-randomly` is disabled or order is enforced.

**Consequences:**
- Tests pass alone (`pytest tests/e2e/test_crawl.py::test_discovery`) but fail together
  (`pytest tests/e2e/`). Debugging is extremely time-consuming.

**Prevention:**
- Use `scope="session"` only for the database file creation and schema setup.
- Use `scope="function"` fixtures for any data state that individual tests read.
- Use `db.execute("DELETE FROM crawl_targets")` + re-seed in a function-scoped fixture wrapping
  each test that modifies data.
- Alternatively: each test function creates its own temp DB file (slower but completely isolated).

**Detection (warning signs):**
- A test passes in isolation but fails when the full suite runs.
- Test output shows correct row counts on the first run, wrong counts on the second test in the file.

**Phase:** Address in Phase 1 (fixture design) before writing any data-touching tests.

---

### Pitfall 5: Lock File and Pipeline State Surviving Between Test Runs

**What goes wrong:** `fee_crawler/pipeline/executor.py` uses a PID-file lock at `data/pipeline.lock`.
If an e2e test run is interrupted (Ctrl-C, timeout), the lock file is not cleaned up. The next test run
immediately fails with "pipeline already running" before any assertions are reached.

**Why it happens:** The lock is released in teardown, but Ctrl-C raises `KeyboardInterrupt` before
`finally` blocks in the test runner reach the `release_lock()` call. The lock file path is hardcoded
relative to the working directory, so it may also collide with a parallel test run.

**Consequences:**
- CI jobs that time out leave stale locks, causing all subsequent runs to fail until a human manually
  deletes the file. On Modal, the ephemeral container means the lock disappears, but locally it persists.

**Prevention:**
- Override `LOCK_FILE` in the test fixture to point to a path inside `tmp_path`.
- Wrap all pipeline invocations in the test in a `try/finally` that calls `release_lock()`.
- Add a pre-test assertion that no lock file exists at the test-specific path.

**Detection (warning signs):**
- Test output shows "pipeline already running" after a previously interrupted run.
- Stale `data/pipeline.lock` file exists when no pipeline process is running.

**Phase:** Address in Phase 1 (environment setup).

---

## Moderate Pitfalls

Mistakes that cause flakiness, wasted LLM spend, or poor signal-to-noise in test output.

---

### Pitfall 6: Not Accounting for Institution Website Downtime

**What goes wrong:** The test selects 3-5 real institutions from FDIC/NCUA and crawls their actual
websites. One institution's website is down, redirecting to a "site under maintenance" page, or has
changed its fee schedule URL since the last run. The test fails because `fees_extracted == 0` for that
institution, even though the pipeline logic is correct.

**Why it happens:** Real websites fail. The test selects institutions randomly, so no institution is
guaranteed to be stable across runs. Community banks sometimes take their sites down for weeks.

**Consequences:**
- Test suite reports failures that are external infrastructure problems, not pipeline bugs.
- CI blocks merges due to a third-party outage.

**Prevention:**
- Assert against the aggregate, not each institution: `total_fees_extracted >= 1` across all
  institutions, not `fees_extracted >= 1 per institution`.
- Allow a configurable failure tolerance: if 1 of 5 institutions returns zero fees, the test still
  passes (set `MIN_SUCCESSFUL_EXTRACTIONS = 2`).
- Log per-institution results in the test report so failures are diagnosable even when the assertion
  passes overall.

**Detection (warning signs):**
- Test fails only on certain days or certain randomly selected geographies.
- Failure message shows `crawl_results.status = 'failed'` and `error_message` contains HTTP 503 or
  connection timeout.

**Phase:** Address in Phase 2 (assertion strategy and test report design).

---

### Pitfall 7: LLM Cost Runaway from Unguarded Re-runs

**What goes wrong:** The e2e test calls Claude Haiku for real extraction. A developer runs the suite
five times while debugging a fixture problem (unrelated to extraction). Each run incurs ~$0.05-0.20 in
API costs. Over a sprint, this accumulates to tens of dollars in waste.

**Why it happens:** There is no caching of LLM responses between runs, and the test does not check
whether the content being sent to the LLM has changed since the last run. The pipeline's content-hash
deduplication (`last_content_hash`) only works across crawl runs that share a database — not across
isolated test databases.

**Consequences:**
- Unexpected Anthropic API bills. At `daily_budget_usd: 20.0` in config, a CI system that retries
  failed jobs three times per commit could hit the daily limit.

**Prevention:**
- Cache crawled document content to a fixture directory on first run; on subsequent runs, skip
  the HTTP fetch and LLM call if the cached document exists. Use a `--no-cache` flag to force a fresh run.
- In CI, run the e2e suite at most once per day (schedule trigger, not PR trigger).
- Log estimated API cost per run to stdout so it is visible in test output.
- Set `ExtractionConfig.daily_budget_usd` to a lower value (e.g., `2.0`) in the test config.

**Detection (warning signs):**
- Anthropic API usage dashboard shows many small charges from the same IP during development hours.
- Test run time is consistently 3-5 minutes even when the pipeline has not changed.

**Phase:** Address in Phase 2 (LLM integration and cost controls).

---

### Pitfall 8: FDIC/NCUA API Dependency Without a Fallback Seed

**What goes wrong:** The test starts by calling the FDIC API (`https://api.fdic.gov/banks`) to seed
institutions. If the FDIC API is down, rate-limits the test runner, or returns an unexpected response
format, the entire test fails at step one before any pipeline logic is exercised.

**Why it happens:** `api.fdic.gov` is a public government API with no SLA. It has experienced outages
and schema changes without notice. NCUA's bulk CSV download is similarly unversioned.

**Consequences:**
- CI fails on an external dependency unrelated to the pipeline code under test.
- Debugging time is wasted determining whether the failure is in the seeding code or the API.

**Prevention:**
- Ship a small fixture file (`fee_crawler/tests/fixtures/fdic_seed_wy.json`) containing 5-10
  pre-fetched FDIC institution records from a stable, small-state geography (e.g., Wyoming). Use this
  as the default seed in e2e tests, bypassing the live API.
- Add a `--live-seed` flag that calls the real FDIC API for fresh institutions. Run this in scheduled
  CI only, not on every PR.
- The seeding fixture should include `website_url` values so the URL discovery stage is also exercised.

**Detection (warning signs):**
- Test fails at `seed_institutions` stage with an HTTP error or JSON parse error.
- FDIC API returns HTTP 503 or unexpected pagination structure.

**Phase:** Address in Phase 1 (test infrastructure and fixture design).

---

### Pitfall 9: Discovery Stage Timing Out on Slow Bank Websites

**What goes wrong:** Community bank websites are sometimes hosted on shared hosting with response
times of 5-30 seconds per request. The URL discovery stage probes 50+ common paths per institution.
At `delay_seconds: 2.0` and sequential probing, a single institution can take 5-10 minutes.
The test times out before extraction begins.

**Why it happens:** The `COMMON_PATHS` list in `url_discoverer.py` contains 50+ paths. Each probe is
sequential (one request at a time per domain). Slow websites compound this dramatically.

**Consequences:**
- The e2e test exceeds pytest's default timeout or Modal's container time limit.
- Tests appear to hang with no output, making the developer unsure whether to kill them.

**Prevention:**
- Use a shorter `COMMON_PATHS` list (top 10 paths only) in test config, overridable via `Config`.
- Set a per-domain request timeout of 10 seconds in the test config (`CrawlConfig.timeout_seconds`).
- Log discovery progress: which paths were probed and which responded, so a slow test is diagnosable.
- Set a wall-clock timeout for the entire discovery stage per institution (e.g., 60 seconds max).

**Detection (warning signs):**
- Test output stalls at "Discovering fee schedule URL for [institution]" with no progress for > 2 minutes.
- Test only passes for institutions where discovery finds a URL in the first 5 probed paths.

**Phase:** Address in Phase 2 (crawl configuration for test environment).

---

### Pitfall 10: Audit Trail Assertions That Miss Partial Failures

**What goes wrong:** The test asserts `crawl_results` rows exist and `extracted_fees` rows exist, but
does not verify the relational linkage. A bug causes `crawl_results.id` to not match
`extracted_fees.crawl_result_id`, or `fee_reviews` rows are created with a null `fee_id`. The audit
trail is incomplete, but the test passes because it only checks row counts.

**Why it happens:** Row count assertions are easy to write. Relational integrity assertions require
joining tables, which feels like over-specifying the test.

**Consequences:**
- The admin review UI shows fees with no crawl provenance (`fee_id IS NULL` in `fee_reviews`).
- The `fee_reviews` table grows with orphaned records that cannot be traced to source documents.
- The "immutable audit trail" guarantee — a core product property — is silently broken.

**Prevention:**
- Assert the full chain explicitly:
  ```python
  # Every extracted fee must link to a crawl result
  orphaned = db.execute(
      "SELECT COUNT(*) FROM extracted_fees ef "
      "LEFT JOIN crawl_results cr ON cr.id = ef.crawl_result_id "
      "WHERE cr.id IS NULL"
  ).fetchone()[0]
  assert orphaned == 0

  # Every fee_review must link to an extracted fee
  orphaned_reviews = db.execute(
      "SELECT COUNT(*) FROM fee_reviews fr "
      "LEFT JOIN extracted_fees ef ON ef.id = fr.fee_id "
      "WHERE ef.id IS NULL"
  ).fetchone()[0]
  assert orphaned_reviews == 0
  ```
- Run these assertions as a dedicated "audit trail integrity" test phase, not inline with extraction.

**Detection (warning signs):**
- Admin review UI shows fees with missing institution names or blank source URLs.
- `fee_reviews.fee_id IS NULL` rows appear in the database after an e2e run.

**Phase:** Address in Phase 3 (audit trail verification stage).

---

### Pitfall 11: Modal Environment Divergence from Local

**What goes wrong:** The e2e test passes locally (SQLite, local file paths, no container) but fails on
Modal because:
- The Modal container has no access to `data/` paths — everything must use `/tmp/` or environment variables.
- The lock file path (`data/pipeline.lock`) does not exist in the container filesystem.
- The `ANTHROPIC_API_KEY` is present locally but not injected as a Modal secret.
- SQLite in-memory mode works locally but Modal containers do not persist state between function invocations.

**Why it happens:** Local development assumes a stable filesystem. Modal containers are ephemeral and
stateless. The pipeline code uses hardcoded relative paths in several places
(`data/pipeline.lock`, `data/documents/`, `data/logs/`).

**Consequences:**
- The e2e test "runs on Modal" but silently skips stages that fail to initialize, reporting a false pass.

**Prevention:**
- Make all filesystem paths configurable via `Config` (no hardcoded `data/` strings in pipeline code).
- In the Modal e2e test, assert at startup that `ANTHROPIC_API_KEY` is set; fail fast if not.
- The test's Modal function should use `DATABASE_URL` pointing to a Supabase test schema (not SQLite).
- Add a `--dry-run` mode that validates config and connectivity without crawling.

**Detection (warning signs):**
- `FileNotFoundError` for `data/pipeline.lock` in Modal logs.
- Extraction stage is skipped silently because the API key was not injected.
- Modal test passes in 5 seconds (too fast — extraction was skipped).

**Phase:** Address in Phase 3 (Modal environment validation).

---

## Minor Pitfalls

---

### Pitfall 12: Test Report Is Unreadable Without Context

**What goes wrong:** The test run produces a standard pytest pass/fail output. A developer reading CI
logs cannot tell: which institutions were tested, how many fees were extracted, which stages succeeded
vs failed, or what the LLM returned. When a failure occurs, there is no context for diagnosing it.

**Prevention:**
- Print a structured summary at the end of the e2e run:
  - Institutions tested (name, cert number, geography)
  - Per-institution: discovery outcome, crawl outcome, fees extracted, confidence range
  - Total run duration and estimated API cost
  - Any per-institution failures with error messages
- Write this summary to a file (`data/e2e_report.json`) so it survives even if pytest output is truncated.

**Phase:** Address in Phase 3 (reporting).

---

### Pitfall 13: robots.txt Blocking During Tests Is Not Surfaced

**What goes wrong:** A randomly selected institution's website blocks the crawler in `robots.txt`. The
discovery stage silently returns zero URLs (correct behavior — the pipeline respects robots.txt).
The test fails the `total_fees_extracted >= 1` assertion. The failure looks like a pipeline bug but is
actually correct crawler behavior.

**Prevention:**
- Log `robots.txt` check results per institution during discovery: "robots.txt disallowed for
  [institution] — skipping."
- Count `robots_blocked` institutions separately in the test report.
- Adjust the minimum-success assertion to exclude robots-blocked institutions from the denominator.

**Phase:** Address in Phase 2 (discovery stage observability).

---

### Pitfall 14: PDF Extraction Produces Empty Text Without Warning

**What goes wrong:** Some bank fee schedule PDFs are scanned images (no text layer). `pdfplumber`
returns empty text. The pipeline falls back to OCR (Tesseract), but if Tesseract is not installed in
the test environment, the fallback silently produces empty text and the LLM receives an empty document.
Claude returns zero fees. The test fails with `fees_extracted == 0` but no indication that OCR was attempted.

**Prevention:**
- Assert in the test that if a PDF was crawled and produced zero fees, the crawl result includes an
  `error_message` or `document_type = 'pdf_scanned_no_ocr'` flag.
- Verify Tesseract is available in the test environment as a pre-flight check.
- Log which extraction method (pdfplumber, OCR, HTML) was used per document.

**Phase:** Address in Phase 2 (extraction observability).

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|----------------|------------|
| Phase 1: Test DB setup | Contaminating dev DB (Pitfall 1) | Override config path before any DB construction |
| Phase 1: Fixture design | Session-scoped state leaking between tests (Pitfall 4) | Function-scoped data fixtures |
| Phase 1: FDIC seeding | FDIC API downtime (Pitfall 8) | Ship pre-fetched fixture JSON |
| Phase 1: Lock file | Stale lock blocking reruns (Pitfall 5) | Override LOCK_FILE in fixture |
| Phase 2: Assertions | Exact-value assertions on LLM output (Pitfall 3) | Structural assertions only |
| Phase 2: Discovery | Website timeouts (Pitfall 9) | Shorter path list + per-domain timeout |
| Phase 2: Cost | LLM cost runaway (Pitfall 7) | Budget cap + document caching |
| Phase 2: robots.txt | Silent zero-fee from blocked crawls (Pitfall 13) | Log blocks, exclude from denominator |
| Phase 3: DB verification | Missing relational integrity check (Pitfall 10) | Explicit JOIN-based orphan assertions |
| Phase 3: Modal | Environment divergence (Pitfall 11) | Config-driven paths + pre-flight checks |
| Phase 3: Reporting | Unreadable CI output (Pitfall 12) | Structured JSON report per run |
| Phase 3: PDF | OCR fallback silent failure (Pitfall 14) | Pre-flight Tesseract check |

---

## Sources

- [How to Test AI Agents Before They Burn Your Budget](https://dev.to/nebulagg/how-to-test-ai-agents-before-they-burn-your-budget-53kl) — LLM cost control in test contexts
- [You Can't Assert Your Way Out of Non-Determinism](https://medium.com/advisor360-com/you-cant-assert-your-way-out-of-non-determinism-a-practical-qa-strategy-for-llm-applications-fd32e617cdec) — LLM assertion strategy (MEDIUM confidence — single source)
- [The Dangers of Testing in SQLite as a Postgres User](https://neon.com/blog/testing-sqlite-postgres) — SQLite/Postgres divergence (HIGH confidence — official Neon docs)
- [Troubleshooting Fixture Leakage and State Contamination in PyTest](https://www.mindfulchase.com/explore/troubleshooting-tips/testing-frameworks/troubleshooting-fixture-leakage-and-state-contamination-in-pytest.html) — Session scope pitfalls
- [Modern E2E Test Architecture: Patterns and Anti-Patterns](https://www.thunders.ai/articles/modern-e2e-test-architecture-patterns-and-anti-patterns-for-a-maintainable-test-suite) — General e2e anti-patterns
- [Web Scraper Testing](https://datawookie.dev/blog/2025/01/web-scraper-testing/) — Strategy for testing scrapers against live sites (MEDIUM confidence)
- [How to Use SQLite in Testing](https://oneuptime.com/blog/post/2026-02-02-sqlite-testing/view) — SQLite isolation patterns for test suites
- [Testing AI Agents: Validating Non-Deterministic Behavior](https://www.sitepoint.com/testing-ai-agents-deterministic-evaluation-in-a-non-deterministic-world/) — Non-determinism in LLM testing

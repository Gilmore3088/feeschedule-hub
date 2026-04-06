# Phase 4: Extraction Stage Tests - Context

**Gathered:** 2026-04-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Test that the extraction stage downloads fee schedule documents and extracts confidence-scored fees via Claude Haiku, producing `crawl_results` and `extracted_fees` rows. Builds on Phase 3's discovered institutions (which have `fee_schedule_url` populated).

</domain>

<decisions>
## Implementation Decisions

### Extraction Scope
- **D-01:** Run real extraction against institutions discovered in Phase 3 (those with `fee_schedule_url` populated). Use the same top-3 FDIC institutions pattern.
- **D-02:** Real Claude Haiku calls — this is a true e2e test. Cost is accepted (~$0.50-2 per run). Budget guard: `daily_budget_usd=2.0` in test_config (from Phase 1).
- **D-03:** Mark all extraction tests `@pytest.mark.e2e` and `@pytest.mark.llm` (they call real LLM) and `@pytest.mark.slow`.

### Document Type Coverage
- **D-04:** EXTR-02 requires both PDF and HTML document types. The discoverer tags `document_type` during discovery. If only one type is found among discovered institutions, the test should assert what's available and skip the missing type assertion (not fail).
- **D-05:** Don't force both types — real-world institution mix determines what's available.

### Crawl Results
- **D-06:** Assert every extraction attempt has a `crawl_results` row with `status` in ('success', 'failed', 'unchanged'). No unrecorded attempts.
- **D-07:** For successful extractions, assert `extracted_fees` rows have `extraction_confidence` in [0.0, 1.0] range.

### Fixture Design
- **D-08:** Create an `extracted_db` module-scoped fixture that builds on Phase 3's pattern — seeds institutions, runs discovery, then runs extraction. Each stage feeds the next.
- **D-09:** Only extract from institutions that have a `fee_schedule_url` (discovery succeeded).

### Claude's Discretion
- Whether to call the full crawl pipeline or individual extraction functions
- How to handle extraction failures (some institutions may fail — assert at least 1 success)
- Test file organization

</decisions>

<canonical_refs>
## Canonical References

### Extraction Implementation
- `fee_crawler/pipeline/download.py` — Document download, content hash, R2 storage
- `fee_crawler/pipeline/extract_llm.py` — LLM extraction via Claude Haiku with tool-use schema
- `fee_crawler/pipeline/extract_pdf.py` — pdfplumber text extraction
- `fee_crawler/pipeline/extract_html.py` — BeautifulSoup HTML extraction
- `fee_crawler/commands/crawl.py` — Main crawl command orchestrating download + extraction

### Database Schema
- `fee_crawler/db.py` — `crawl_results` and `extracted_fees` table schemas

### Prior Phase Tests
- `fee_crawler/tests/e2e/test_discovery_stage.py` — `discovered_db` fixture pattern

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `discovered_db` fixture from Phase 3: provides DB with institutions that have `fee_schedule_url` populated
- `test_config` fixture: Config with temp paths, budget guard

### Integration Points
- Extraction reads `fee_schedule_url` from `crawl_targets`
- Extraction writes to `crawl_results` and `extracted_fees`
- Phase 5 (categorization) will read from `extracted_fees`

</code_context>

<specifics>
## Specific Ideas

No specific requirements beyond the standard approach.

</specifics>

<deferred>
## Deferred Ideas

None

</deferred>

---

*Phase: 04-extraction-stage-tests*
*Context gathered: 2026-04-06*

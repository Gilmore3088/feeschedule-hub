# Phase 24: Industry Health & Beige Book - Context

**Gathered:** 2026-04-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Compute industry-wide health metrics (ROA, ROE, efficiency ratio, deposit/loan growth) from institution_financials with charter segmentation. Condense Beige Book reports into district-level summaries and extract national themes (growth, employment, prices, lending). All data queryable as structured objects for Hamilton analysis.

Requirements: HEALTH-01, HEALTH-02, HEALTH-03, HEALTH-04, BEIGE-01, BEIGE-02, BEIGE-03

</domain>

<decisions>
## Implementation Decisions

### Health Metrics Shape
- **D-01:** Reuse Phase 23's `RichIndicator` shape for all health metrics: `{ current: number, history: { date: string, value: number }[], trend: 'rising' | 'falling' | 'stable', asOf: string }`. ROA, ROE, efficiency ratio, deposit growth, and loan growth all use this shape. Consistent API for Hamilton.
- **D-02:** Industry health functions live in a new file `src/lib/crawler-db/health.ts`. Keeps domain separation from per-institution queries in `financial.ts`.

### Beige Book Summarization
- **D-03:** District summaries are pre-computed during Beige Book ingestion (Python `ingest-beige-book` command). Use Claude Haiku to generate 2-3 sentence summaries per district. Store in DB (new column or table). Zero latency at query time.
- **D-04:** National themes (growth, employment, prices, lending) are extracted via a second LLM pass during ingestion that reads all 12 district summaries and produces structured theme objects. Stored alongside the edition.

### Growth Computation
- **D-05:** Deposit and loan YoY growth computed in SQL using quarter matching (DATE_TRUNC + self-join or LAG). Handles missing quarters gracefully. Consistent with Phase 23's revenue trend approach.
- **D-06:** An "active" institution is defined as one with a row in `institution_financials` for that quarter. If an institution stops filing, it drops from counts.

### Carrying Forward from Phase 23
- **D-07:** `* 1000` scaling at SQL query level for monetary fields (total_deposits, total_loans are stored in thousands)
- **D-08:** One function per requirement pattern
- **D-09:** Accuracy, consistency, and value for Hamilton reports as guiding principle

### Claude's Discretion
- Import pattern for RichIndicator (re-export from health.ts or import from fed.ts)
- Test file organization (health.test.ts, fed.test.ts extension, or both)
- DB storage format for Beige Book summaries (new column vs new table)
- Haiku prompt design for district summarization and theme extraction

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Data Layer (Phase 23 patterns to follow)
- `src/lib/crawler-db/call-reports.ts` -- Query patterns with `* 1000` scaling, one-function-per-requirement
- `src/lib/crawler-db/fed.ts` -- `RichIndicator` interface, `deriveTrend()`, Beige Book query patterns, `getNationalEconomicSummary()`
- `src/lib/crawler-db/fed.test.ts` -- Test patterns for rich indicator objects
- `src/lib/crawler-db/financial.ts` -- `InstitutionFinancial` interface (roa, roe, efficiency_ratio, total_deposits, total_loans fields)
- `src/lib/crawler-db/connection.ts` -- DB connection pattern (getSql() for read)

### Beige Book Ingestion
- `fee_crawler/commands/ingest_beige_book.py` -- Existing ingestion pipeline to extend with LLM summarization
- `fee_crawler/config.py` -- Config patterns for API keys and model selection

### Requirements
- `.planning/REQUIREMENTS.md` -- HEALTH-01 through HEALTH-04, BEIGE-01 through BEIGE-03

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `RichIndicator` interface in `fed.ts` -- exact shape for health metrics
- `deriveTrend()` in `fed.ts` -- reusable trend computation (rising/falling/stable)
- `getBeigeBookHeadline()` in `fed.ts` -- extracts first sentence, pattern for summary queries
- `getBeigeBookHeadlines()` -- bulk per-district headline query with subquery pattern
- `InstitutionFinancial` interface -- all financial fields already typed

### Established Patterns
- Template literal SQL with `postgres` client (no ORM)
- `getSql()` for read queries
- `Number()` coercion from Postgres results with null handling
- Try-catch with empty array/null fallback

### Integration Points
- `institution_financials` table -- source for ROA, ROE, efficiency, deposits, loans
- `crawl_targets` table -- JOIN for charter_type segmentation
- `fed_beige_book` table -- source for content_text, section_name
- Python `ingest-beige-book` command -- extend for LLM summarization step
- Anthropic API (`@anthropic-ai/sdk`) -- already in project for LLM calls

</code_context>

<specifics>
## Specific Ideas

- LLM summarization during ingestion costs ~$0.12 per Beige Book edition (12 districts x Haiku)
- Theme extraction adds ~$0.02 extra (reads 12 short summaries, produces 4 themes)
- Total cost per edition: ~$0.15 -- negligible vs report value
- District summaries enable Hamilton to say "The Boston district reported moderate growth" rather than dumping raw text
- Health metrics with RichIndicator shape enable Hamilton to say "ROA has been declining for 4 consecutive quarters"

</specifics>

<deferred>
## Deferred Ideas

- **National surveys, BLS data, additional FED data sources** -- User mentioned interest in incorporating these. This is new data ingestion that belongs in Phase 27 (External Intelligence System) which handles ingesting external research/surveys. Phase 24 works with data already in the DB.

</deferred>

---

*Phase: 24-industry-health-beige-book*
*Context gathered: 2026-04-07*

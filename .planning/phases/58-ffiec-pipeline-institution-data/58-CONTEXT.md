# Phase 58: FFIEC Pipeline & Institution Data - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Ingest FFIEC CDR and NCUA 5300 quarterly Call Report data from 2010 to present into Postgres, surface full financial profiles on institution admin pages with hero stat cards, sparklines, and inline peer context. Automate quarterly re-ingestion via Modal cron.

</domain>

<decisions>
## Implementation Decisions

### Ingestion Pipeline Architecture
- **D-01:** Port existing `ingest_call_reports.py` and `ingest_ncua.py` from SQLite `Database` class to psycopg2 `conn` with `%s` placeholders. Keep existing field mappings and parsing logic. Same approach as Phase 56 snapshot rewrite.
- **D-02:** Historical backfill covers 2010 Q1 to present (~60 quarters). FFIEC CDR bulk data going back to 2010 for deep historical context and long-term trend analysis.
- **D-03:** One-time bulk load for initial backfill -- download all FFIEC CDR bulk files from 2010-present in a single pipeline run. ~60 quarters x ~5K institutions = ~300K+ rows. Run once, then quarterly cron for new data.

### Institution Detail Page Data
- **D-04:** Full financial profile on institution detail page: assets, total deposits, service charge revenue, net income, key ratios (efficiency ratio, fee-to-deposit ratio), QoQ and YoY deltas. Like bankregdata.com but integrated with fee data.
- **D-05:** Hero stat cards with sparklines at top of institution page. 4-6 large stat cards showing key metrics with mini sparkline charts showing quarterly trends. Below: existing fee table. Consulting-grade visual hierarchy -- must look beautiful, not like a data dump.
- **D-06:** Inline peer context on each stat card. Show institution value + peer median/percentile badge (e.g., "Assets: $1.2B (P72 among community banks)"). Drives immediate insight without requiring a separate peer section.

### Data Freshness & Automation
- **D-07:** Modal quarterly cron for re-ingestion. Schedule at 3am on Feb 15, May 15, Aug 15, Nov 15 (approximate FFIEC release dates, ~45 days after quarter end). Falls back gracefully if data not yet available.
- **D-08:** Retry + alert error handling. 3 retries with exponential backoff on FFIEC/NCUA download failures. On failure, log error and continue (don't block other pipeline steps). Staleness badge on admin pages when data is older than expected.

### Coverage Matching Strategy
- **D-09:** Cert/charter number first, then fuzzy name+state match for remaining. Priority-based: deterministic cert_number join for FDIC banks and charter_number for NCUA credit unions. Fallback fuzzy matching on institution name + state for records missing cert numbers. Log all match types for audit.
- **D-10:** Ingest all FFIEC/NCUA data regardless of crawl_target match. Store with cert_number as primary key. Link to crawl_targets via nullable FK. Unmatched institutions still provide aggregate and district-level data. Match later as crawl_targets expand.

### Claude's Discretion
- Database schema for institution_financials table (column names, indexes, partitioning strategy for 60+ quarters)
- Specific FFIEC CDR field codes beyond the core ones (RIAD4080, RIAD4079, RIAD4107) already documented in existing code
- Sparkline chart implementation (SVG inline vs Recharts mini) -- existing sparkline.tsx component is available
- Which financial ratios to compute and display (efficiency ratio, fee-to-deposit, ROA, etc.)
- Staleness badge design and threshold (e.g., show "stale" if data is > 90 days old for current quarter)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Ingestion Commands (Port to Postgres)
- `fee_crawler/commands/ingest_call_reports.py` -- FFIEC CDR ingestion with field mappings (RIAD4080, RIAD4079, RIAD4107). Currently SQLite, port to psycopg2.
- `fee_crawler/commands/ingest_ncua.py` -- NCUA 5300 ingestion with FS220_FIELDS mapping. Currently SQLite, port to psycopg2.

### Existing Query Layer
- `src/lib/crawler-db/financial.ts` -- 15+ financial query functions (getFinancialsByInstitution, getFinancialStats, getMarketConcentration, etc.)
- `src/lib/crawler-db/call-reports.ts` -- getInstitutionRevenueTrend, getInstitutionPeerRanking, getDistrictFeeRevenue
- `src/lib/crawler-db/call-reports.test.ts` -- Existing tests for call report queries

### Institution Detail Page
- `src/app/admin/institution/[id]/page.tsx` -- Current institution page (already imports call-reports queries)
- `src/app/admin/institution/[id]/fee-table.tsx` -- Existing fee table component
- `src/components/sparkline.tsx` -- Existing pure SVG sparkline component (reuse for quarterly trends)

### Pipeline Infrastructure
- `fee_crawler/modal_app.py` -- Modal cron patterns (2am-6am schedule, secrets, run_post_processing)
- `fee_crawler/__main__.py` -- CLI command registration pattern
- `fee_crawler/config.py` -- Config class pattern

### Design Reference
- `src/app/admin/districts/[id]/page.tsx` -- Phase 57 tabbed layout with stat cards (reference for visual hierarchy)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ingest_call_reports.py`: Complete FFIEC CDR download + parse logic with field mappings -- just needs SQLite->Postgres swap
- `ingest_ncua.py`: Complete NCUA 5300 ZIP download + CSV parse with FS220 field mapping -- same swap needed
- `financial.ts`: 15+ query functions already built for financial data retrieval
- `call-reports.ts`: Revenue trend + peer ranking queries already used on institution page
- `sparkline.tsx`: Pure SVG mini chart component ready for quarterly sparklines
- Phase 56 pattern: `classify_nulls.py` and `snapshot_fees.py` rewrites demonstrate the SQLite->Postgres migration pattern

### Established Patterns
- SQLite->Postgres migration: swap `Database`/`?` for `psycopg2.connect(DATABASE_URL)`/`%s`, use `ON CONFLICT` for upserts
- Modal cron: `@app.function(schedule=modal.Cron("..."), secrets=secrets, timeout=...)`
- Institution queries: tagged template SQL via `postgres` client, typed return interfaces

### Integration Points
- `institution_financials` table (or similar) needs to be created/extended for quarterly data
- Institution detail page needs new data fetch calls + hero card layout
- Modal cron schedule has 5am slot taken by Roomba, need new quarterly slot
- CLI needs `ingest-call-reports` and `ingest-ncua` commands registered (may already exist for SQLite version)

</code_context>

<specifics>
## Specific Ideas

- Institution page must look "beautiful" -- hero stat cards with sparklines, not dense data tables. Reference the Salesforce Connected FINS report aesthetic: bold numbers, clean typography, generous whitespace.
- Peer context on each stat card makes the data immediately actionable ("your fee revenue is P85 among peers" tells a story, raw numbers don't).
- 2010 backfill enables powerful trend analysis: "This bank's fee revenue has grown 340% since 2010 while peer median grew 180%."
- bankregdata.com is the reference for data comprehensiveness but NOT for visual design -- we should look dramatically better.

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

*Phase: 58-ffiec-pipeline-institution-data*
*Context gathered: 2026-04-10*

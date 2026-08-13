# Phase 27: External Intelligence System — Context

## Phase Goal

Admin users can ingest external research, surveys, and reports into the platform; Hamilton can search and cite external sources alongside internal data.

## Existing Work (Pre-Phase)

Significant implementation already exists from prior work:

### Already Built
- **DB query layer**: `src/lib/crawler-db/intelligence.ts` — full CRUD + tsvector full-text search (insertIntelligence, searchExternalIntelligence, listIntelligence, deleteIntelligence)
- **Admin UI**: Intelligence tab on `/admin/national?tab=intelligence` with add form, table listing, delete buttons
- **Server actions**: `src/app/admin/national/intelligence-actions.ts` — addIntelligenceAction, deleteIntelligenceAction with auth + validation
- **Client components**: IntelligenceAddForm (text paste, URL, tags, category, date) and IntelligenceDeleteButton
- **Unit tests**: `src/lib/crawler-db/intelligence.test.ts` — 10 tests covering all CRUD + search + type checks
- **Tab navigation**: Intelligence tab wired into TabNav and NationalPage

### Missing (This Phase Must Deliver)
1. **DB migration script**: `external_intelligence` table does not exist in production Postgres. Need CREATE TABLE + tsvector column + GIN index + trigger for auto-updating search_vector.
2. **Hamilton tool integration**: `searchExternalIntelligence` is not wired into `queryNationalData` in `tools-internal.ts`. Hamilton cannot access external intelligence.
3. **Citation instruction**: Hamilton's system prompt does not mention external intelligence or how to cite it.

## Decisions

### D-01: Add "external" as a new source in queryNationalData
The existing `queryNationalData` tool has 11 sources. Add `"external"` as the 12th source that calls `searchExternalIntelligence`. This follows the established pattern rather than creating a separate tool.

### D-02: Citation format — inline `[Source: name, date]`
Hamilton should cite external sources inline using `[Source: source_name, source_date]` format. This is added to the system prompt via a regulation-style instruction block.

### D-03: Migration script at `scripts/migrations/027-external-intelligence.sql`
Follow existing migration naming convention (023, 024, 025 already exist).

### D-04: No new UI work needed
The admin ingest UI already exists and is functional. Plan 27-01 only needs the migration script to make it work against production.

### D-05: search_vector uses source_name + content_text
The tsvector column should concatenate source_name (weight A) and content_text (weight B) for relevance ranking.

## Deferred Ideas

- File/PDF upload (text paste only for now)
- Intelligence expiration/archival
- Bulk import from CSV
- Intelligence quality scoring

## Claude's Discretion

- Exact column types and constraints for the migration
- Whether to add a `query` parameter alias (e.g., "search" view) to the external source handler
- Error handling style for empty search queries

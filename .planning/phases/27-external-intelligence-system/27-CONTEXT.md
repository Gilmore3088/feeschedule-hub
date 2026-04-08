# Phase 27: External Intelligence System - Context

**Gathered:** 2026-04-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Admin users can ingest external research, surveys, and reports into the platform with structured metadata. Hamilton can search and cite external sources alongside internal data in analysis output.

Requirements: INTEL-01, INTEL-02, INTEL-03, INTEL-04

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion (all areas)

User delegated all implementation decisions to Claude. The following are Claude's chosen approaches based on project patterns and requirements:

### Ingestion Method (INTEL-01)
- **D-01:** Admin ingestion via a simple form on `/admin/national` (new "Intelligence" tab) or dedicated `/admin/intelligence` page. Form fields: source name (required), date (required), category (dropdown: research, survey, regulation, news, analysis), relevance tags (comma-separated), content (paste text or URL to fetch). File upload deferred to v6.0 -- text paste + URL fetch covers 90% of use cases with zero file storage complexity.
- **D-02:** URL fetch uses server action with `fetch()` + `sanitize-html` to extract text content. Already in project dependencies.

### Storage & Search (INTEL-02, INTEL-03)
- **D-03:** New `external_intelligence` Postgres table with: `id`, `source_name`, `source_date`, `category`, `tags` (text array), `content_text`, `source_url`, `created_at`, `created_by`. Full-text search via Postgres `tsvector` + `GIN` index on `content_text` and `source_name`. No vector embeddings -- overkill for the expected volume (<1000 documents).
- **D-04:** Search function `searchExternalIntelligence(query, filters?)` with optional category and tag filters. Returns ranked results with highlighted snippets.

### Hamilton Integration (INTEL-04)
- **D-05:** New `searchIntelligence` tool added to `buildHamiltonTools()` in `hamilton-agent.ts`. Takes a search query + optional category filter. Returns matching documents with source attribution.
- **D-06:** Citation format: Hamilton includes `[Source: {source_name}, {date}]` inline when referencing external data. System prompt updated to instruct Hamilton to always cite external sources with attribution.

### Architecture
- **D-07:** Query functions in new `src/lib/crawler-db/intelligence.ts`. Matches existing domain-specific file pattern.
- **D-08:** Server actions for create/search in a new actions file. Matches existing admin action patterns.
- **D-09:** Admin UI as a new tab on the Data Hub page (extending Phase 26's `/admin/national` with an "Intelligence" tab), or a separate `/admin/intelligence` page -- Claude picks based on complexity.

### Carrying Forward
- **D-10:** Hamilton is THE universal agent -- new tool integrates into existing `buildHamiltonTools()`
- **D-11:** Design system conventions (.admin-card, Geist, tabular-nums)
- **D-12:** Server components by default, client only for interactivity

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Hamilton Tool System (Phase 25)
- `src/lib/hamilton/hamilton-agent.ts` -- `buildHamiltonTools()`, `queryNationalData` tool pattern
- `src/lib/research/agents.ts` -- Consolidated agent definitions

### Data Layer Patterns
- `src/lib/crawler-db/derived.ts` -- Recent query file pattern to follow
- `src/lib/crawler-db/connection.ts` -- `getSql()` for read queries
- `scripts/migrate-schema.sql` -- Schema migrations

### Admin UI (Phase 26)
- `src/app/admin/national/page.tsx` -- Tab panel pattern
- `src/app/admin/national/tab-nav.tsx` -- Tab navigation component

### Dependencies
- `sanitize-html` 2.17.1 -- Already in project for HTML sanitization

### Requirements
- `.planning/REQUIREMENTS.md` -- INTEL-01, INTEL-02, INTEL-03, INTEL-04

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `sanitize-html` -- for cleaning fetched URL content
- `tool()` from `ai` SDK + `z` from `zod` -- Hamilton tool pattern
- `.admin-card` CSS class, form patterns from existing admin pages
- `getSql()` for read queries, server actions for mutations

### Established Patterns
- New data domains get their own file in `crawler-db/` (intelligence.ts)
- Hamilton tools defined in `hamilton-agent.ts` using `tool()` + Zod schemas
- Admin forms use server actions with Zod validation
- Postgres full-text search available via `to_tsvector()` + `to_tsquery()`

### Integration Points
- `buildHamiltonTools()` in `hamilton-agent.ts` -- add `searchIntelligence` tool
- `scripts/migrate-schema.sql` -- add `external_intelligence` table
- `/admin/national/page.tsx` or new `/admin/intelligence` route

</code_context>

<specifics>
## Specific Ideas

- External intelligence enables Hamilton to say "According to a 2025 CFPB survey..." or "Per the ABA's annual fee study..." with proper attribution
- Full-text search with Postgres tsvector is lightweight and proven -- no need for vector DB at <1000 documents
- Text paste handles most use cases: copy key findings from a PDF, paste a press release, or extract quotes from industry reports
- URL fetch adds convenience for web-accessible reports without file upload complexity

</specifics>

<deferred>
## Deferred Ideas

- File upload (PDF, DOCX) with text extraction -- v6.0 when volume justifies storage complexity
- Vector embeddings for semantic search -- v6.0 if document volume exceeds 1000+
- Automated RSS/feed ingestion of industry publications -- separate future phase
- BLS data integration, additional FRED series -- mentioned in Phase 25 discussion, belongs here or v6.0

</deferred>

---

*Phase: 27-external-intelligence-system*
*Context gathered: 2026-04-07*

---
phase: 27-external-intelligence-system
plan: "01"
subsystem: data-layer + hamilton-agent
tags: [external-intelligence, full-text-search, hamilton, tsvector, postgres]
dependency_graph:
  requires: []
  provides:
    - external_intelligence Postgres table with tsvector FTS
    - intelligence.ts CRUD/search query module
    - Hamilton searchIntelligence tool
    - Hamilton [Source: name, date] citation prompt
  affects:
    - src/lib/hamilton/hamilton-agent.ts
    - scripts/migrate-schema.sql
tech_stack:
  added:
    - tsvector GENERATED ALWAYS AS (Postgres 12+ stored generated column)
    - GIN indexes for full-text search and array containment
  patterns:
    - getSql() parameterized tagged templates for all DB queries (T-27-01 mitigated)
    - plainto_tsquery + ts_headline + ts_rank for ranked FTS
    - Window function COUNT(*) OVER () for total in list queries
key_files:
  created:
    - scripts/migrate-schema.sql (external_intelligence DDL appended)
    - src/lib/crawler-db/intelligence.ts
    - src/lib/crawler-db/intelligence.test.ts
  modified:
    - src/lib/hamilton/hamilton-agent.ts
decisions:
  - Used plainto_tsquery (not to_tsquery) for natural language input — handles multi-word queries without syntax errors
  - Category constraint enforced in application layer (not DB CHECK) per plan spec for flexibility
  - listIntelligence uses COUNT(*) OVER() window function to return total and items in one query
  - citation_note included in searchIntelligence tool response to reinforce Hamilton prompt instruction at runtime
metrics:
  duration: "~20 minutes"
  completed_date: "2026-04-07"
  tasks_completed: 2
  tasks_total: 2
  files_created: 3
  files_modified: 1
---

# Phase 27 Plan 01: External Intelligence Data Layer + Hamilton Tool Summary

Postgres external_intelligence table with tsvector full-text search, four CRUD/search query functions, and a Hamilton searchIntelligence tool with inline [Source: name, date] citation enforcement.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Schema migration + intelligence.ts query module | bc609b2 | scripts/migrate-schema.sql, src/lib/crawler-db/intelligence.ts, src/lib/crawler-db/intelligence.test.ts |
| 2 | Hamilton searchIntelligence tool + citation prompt | 7c3e649 | src/lib/hamilton/hamilton-agent.ts |

## What Was Built

**external_intelligence table** — Postgres table with `tsvector GENERATED ALWAYS AS` combining `source_name` (weight A) and `content_text` (weight B). Three indexes: GIN on search_vector for FTS, btree on category, GIN on tags array for containment queries.

**intelligence.ts** — Four exported functions:
- `insertIntelligence` — INSERT RETURNING * with full type safety
- `searchExternalIntelligence` — plainto_tsquery FTS with optional category/tags filters, ts_headline snippets, ts_rank ordering, LIMIT 20
- `listIntelligence` — paginated SELECT with COUNT(*) OVER() window function, ORDER BY source_date DESC
- `deleteIntelligence` — DELETE RETURNING id, returns boolean

**Hamilton searchIntelligence tool** — Added to `buildHamiltonTools()`. Zod schema with `query` (required string) and `category` (optional enum: research/survey/regulation/news/analysis). Returns source_name, source_date, category, tags, snippet (ts_headline), source_url.

**Citation prompt** — EXTERNAL INTELLIGENCE block appended to `buildHamiltonSystemPrompt()` requiring inline `[Source: {source_name}, {date}]` attribution for all external intelligence references.

## Verification

- `npx vitest run src/lib/crawler-db/intelligence.test.ts` — 12 tests pass
- `npx tsc --noEmit` — zero errors in new files (hamilton-agent.ts, intelligence.ts)
- `scripts/migrate-schema.sql` contains `external_intelligence` table with tsvector + GIN indexes
- `buildHamiltonTools()` returns object with `searchIntelligence` key

## Deviations from Plan

None — plan executed exactly as written. Test mock format for `listIntelligence` was adjusted during TDD RED→GREEN cycle (window function embeds count per row, not as separate first element — this matched the implementation, not a plan deviation).

## Threat Surface Scan

No new trust boundaries beyond those in the plan's threat model. T-27-01 (SQL injection) mitigated via parameterized getSql() tagged templates throughout intelligence.ts. T-27-03 (insert auth) deferred to server action layer (outside this plan's scope — admin UI plan will add requireAuth wrapper).

## Self-Check: PASSED

- `src/lib/crawler-db/intelligence.ts` — EXISTS
- `src/lib/crawler-db/intelligence.test.ts` — EXISTS
- `scripts/migrate-schema.sql` contains `external_intelligence` — CONFIRMED
- `src/lib/hamilton/hamilton-agent.ts` contains `searchIntelligence` — CONFIRMED
- Commit bc609b2 — EXISTS
- Commit 7c3e649 — EXISTS

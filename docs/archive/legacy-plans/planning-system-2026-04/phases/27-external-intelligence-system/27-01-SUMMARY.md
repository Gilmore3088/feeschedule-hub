---
phase: 27-external-intelligence-system
plan: 01
subsystem: data-layer
tags: [database, migration, full-text-search, intelligence]
dependency_graph:
  requires: []
  provides: [external_intelligence_table, tsvector_search]
  affects: [intelligence.ts, intelligence-actions.ts, hamilton-tools]
tech_stack:
  added: []
  patterns: [idempotent-migration, tsvector-weighted-search, gin-index]
key_files:
  created:
    - scripts/migrations/027-external-intelligence.sql
  modified: []
decisions:
  - "Used CREATE OR REPLACE for trigger function + DROP IF EXISTS/CREATE for trigger to achieve idempotency"
  - "Weighted tsvector: source_name gets weight A, content_text gets weight B for relevance ranking"
metrics:
  duration: 48s
  completed: "2026-04-08T20:03:04Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 1
  files_modified: 0
---

# Phase 27 Plan 01: External Intelligence Migration Summary

Idempotent Postgres migration for external_intelligence table with weighted tsvector full-text search and GIN indexes.

## What Was Done

### Task 1: Create external_intelligence migration script
Created `scripts/migrations/027-external-intelligence.sql` with:
- CREATE TABLE IF NOT EXISTS with all 10 columns matching the ExternalIntelligence TypeScript interface
- CHECK constraint on category matching server action VALID_CATEGORIES: research, survey, regulation, news, analysis
- 4 indexes: GIN on search_vector, B-tree on category, B-tree on source_date DESC, GIN on tags
- Trigger function `ext_intel_search_vector_update()` auto-populates search_vector with weighted source_name (A) + content_text (B)
- Fully idempotent using IF NOT EXISTS, CREATE OR REPLACE, and DO $$ blocks

**Commit:** `9de132b`

### Task 2: Verify existing intelligence tests pass
All 12 tests pass (insertIntelligence, searchExternalIntelligence, listIntelligence, deleteIntelligence, type checks). Validated migration column names match ExternalIntelligence interface. Category CHECK constraint confirmed matching VALID_CATEGORIES in intelligence-actions.ts.

No code changes required -- validation-only task.

## Commits

| Hash | Message |
|------|---------|
| 9de132b | feat(27-01): create external_intelligence migration with full-text search |

## Deviations from Plan

None -- plan executed exactly as written.

## Self-Check: PASSED

- [x] scripts/migrations/027-external-intelligence.sql exists (FOUND)
- [x] Commit 9de132b exists (FOUND)
- [x] All 12 intelligence tests pass
- [x] Migration contains CREATE TABLE, tsvector, GIN index, trigger
- [x] No console.log statements

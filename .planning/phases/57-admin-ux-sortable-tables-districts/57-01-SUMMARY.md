---
phase: 57-admin-ux-sortable-tables-districts
plan: 01
subsystem: admin-ui
tags: [sortable-tables, url-params, ux]
dependency_graph:
  requires: []
  provides: [sortable-table-url-params, admin-table-consistency]
  affects: [admin-index, admin-pipeline, admin-research, admin-hamilton, admin-leads, admin-reports]
tech_stack:
  added: []
  patterns: [url-param-sort-state, shared-client-table-components]
key_files:
  created:
    - src/components/articles-table.tsx
    - src/components/usage-tables.tsx
    - src/app/admin/hamilton/reports/reports-table.tsx
  modified:
    - src/components/sortable-table.tsx
    - src/app/admin/index/index-table.tsx
    - src/app/admin/pipeline/data-sources-status.tsx
    - src/app/admin/pipeline/discovery-stats.tsx
    - src/app/admin/research/articles/page.tsx
    - src/app/admin/research/usage/page.tsx
    - src/app/admin/hamilton/research/articles/page.tsx
    - src/app/admin/hamilton/research/usage/page.tsx
    - src/app/admin/hamilton/leads/leads-table.tsx
    - src/app/admin/hamilton/reports/page.tsx
decisions:
  - SortableTable uses useSearchParams+useRouter for URL-persisted sort state
  - Default sort direction changed from desc to asc (alphabetical)
  - Skip coverage-table (server-paginated), category-coverage (custom widget), methodology (static), institutions (8000+ rows)
  - Shared ArticlesTable and usage table components extracted to reduce duplication
metrics:
  duration: 329s
  completed: 2026-04-10T18:20:04Z
  tasks_completed: 2
  tasks_total: 2
  files_changed: 15
---

# Phase 57 Plan 01: SortableTable URL Params + Admin Rollout Summary

SortableTable updated to persist sort/dir/page in URL params via useSearchParams/useRouter, then rolled out to 9 admin pages with bounded tables.

## What Was Done

### Task 1: SortableTable URL Param Persistence

Replaced three `useState` calls (sortKey, sortDir, page) with values derived from URL search params. Sort clicks call `router.push()` to update the URL, making sort state bookmarkable and back-button friendly. Default sort direction changed from `desc` to `asc` per D-02 (alphabetical default). Pagination buttons also use `router.push()` with URL params. Page resets to 0 on sort column change.

### Task 2: Rollout to Bounded Admin Tables

Converted 9 admin pages from raw `<table>` markup to use `SortableTable<T>` with typed Column arrays:

| Page | Rows | Change |
|------|------|--------|
| /admin/index (index-table) | 49 | Updated defaultSort to display_name asc, added Suspense |
| /admin/pipeline data-sources | 11 | Full conversion from server table to SortableTable |
| /admin/pipeline discovery-stats | ~5-10 | Full conversion from server table to SortableTable |
| /admin/research/articles | bounded | Extracted shared ArticlesTable client component |
| /admin/hamilton/research/articles | bounded | Uses same shared ArticlesTable component |
| /admin/research/usage (3 tables) | bounded | Extracted AgentUsageTable, UserUsageTable, DailyUsageTable |
| /admin/hamilton/research/usage | bounded | Same shared usage table components |
| /admin/hamilton/leads | bounded | SortableTable with onRowClick for expand/collapse |
| /admin/hamilton/reports | ~100 max | Extracted ReportsTable client component |

### Pages Deliberately Skipped

- **coverage-table.tsx**: Already has server-side sort via SortHeader/Link, server-paginated with thousands of rows
- **category-coverage.tsx**: Complex widget with its own sort/filter/groupBy/expand -- not a simple table
- **methodology/page.tsx**: Static editorial reference tables (3-5 rows of hardcoded data)
- **institutions/page.tsx**: Server-side paginated with 8000+ rows, needs Plan 02 ServerSortableTable

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Duplicate column key in DailyUsageTable**
- **Found during:** Task 2
- **Issue:** Two columns with key "cost_cents" (one for Est. Cost, one for Avg/Query) would cause React key conflict
- **Fix:** Changed avg column key to "avg_cost" with sortable: false since it's a computed value
- **Files modified:** src/components/usage-tables.tsx
- **Commit:** aa6c526

**2. [Rule 1 - Bug] user_id type mismatch in UserUsageTable**
- **Found during:** Task 2 (TypeScript check)
- **Issue:** Dashboard returns user_id as number but component declared it as string | null
- **Fix:** Widened type to number | string | null
- **Files modified:** src/components/usage-tables.tsx
- **Commit:** aa6c526

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 55c8fd7 | SortableTable URL param persistence |
| 2 | aa6c526 | Rollout to all bounded admin tables |

## Self-Check: PASSED

All created files exist. Both commits verified in git log. SortableTable uses useSearchParams and router.push. All converted pages use SortableTable (directly or via shared wrapper components ArticlesTable, usage-tables, ReportsTable). TypeScript compilation passes for all changed files (zero new errors).

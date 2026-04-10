---
phase: 57-admin-ux-sortable-tables-districts
plan: 02
subsystem: admin-ui
tags: [server-components, pagination, sortable-tables, reusable-components]
dependency_graph:
  requires: []
  provides: [ServerSortableTable, PageSizeSelector, server-side-pagination]
  affects: [review-queue, fees-catalog]
tech_stack:
  added: []
  patterns: [server-sortable-table, url-based-page-size, link-based-pagination-controls]
key_files:
  created:
    - src/components/server-sortable-table.tsx
    - src/components/page-size-selector.tsx
  modified:
    - src/app/admin/review/page.tsx
    - src/app/admin/fees/catalog/page.tsx
decisions:
  - ServerSortableTable is a pure server component (no "use client") with Link-based sort headers
  - PageSizeSelector uses Link buttons instead of select element for server component compatibility
  - Default page size changed from 20 to 50 per D-06
  - Per param validated against allowlist [25,50,100] with fallback to 50 (threat mitigation T-57-02, T-57-03)
metrics:
  duration: 243s
  completed: 2026-04-10T18:17:45Z
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 2
---

# Phase 57 Plan 02: Server-Side Sortable Tables Summary

Reusable ServerSortableTable server component with Link-based sort headers, Pagination integration, and PageSizeSelector (25/50/100) wired into review queue and fees catalog.

## Task Results

### Task 1: Create ServerSortableTable and PageSizeSelector components
**Commit:** 2147b9b

Created two reusable server components:

- **ServerSortableTable** (`src/components/server-sortable-table.tsx`): Generic `<T>` server component accepting `ServerColumn<T>[]`, sort/dir/page/perPage props, and basePath. Renders sortable column headers as `<Link>` elements, integrates Pagination and PageSizeSelector in the footer. No "use client" directive -- all state flows from URL params via props.

- **PageSizeSelector** (`src/components/page-size-selector.tsx`): Renders 25/50/100 as Link buttons. Active size gets dark background treatment matching admin design system. Resets page to 1 on size change by deleting the `page` param.

### Task 2: Wire ServerSortableTable into review queue and fees catalog
**Commit:** 16c40ad

- **Review queue** (`src/app/admin/review/page.tsx`): Replaced hardcoded `PAGE_SIZE = 20` with URL-driven `perPage` (default 50). Replaced raw `<table>` markup and `ReviewSortLink` helper with `ServerSortableTable`. Column definitions use `render` functions for fee name links, amount formatting, category display names, institution links, confidence badges, and date display.

- **Fees catalog** (`src/app/admin/fees/catalog/page.tsx`): Added server-side pagination (previously showed all rows). Replaced raw `<table>` markup and `SortLink` helper with `ServerSortableTable`. All 10 columns preserved including sticky first column, family color badges, range bar visualization, and bank/CU count badges. Filter params (show, family, search) preserved across sort and pagination links.

## Deviations from Plan

None -- plan executed exactly as written.

## Threat Mitigations Applied

- **T-57-02 (Tampering):** `per` param validated against `[25, 50, 100]` allowlist before use. Invalid values default to 50.
- **T-57-03 (DoS):** Maximum page size capped at 100 via allowlist. Custom values like `?per=99999` fall back to 50.
- **T-57-07 (Tampering):** Sort param flows through ServerSortableTable's column key system; only defined column keys generate sort links.

## Self-Check: PASSED

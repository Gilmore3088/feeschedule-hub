---
created: 2026-04-08T15:00:00.000Z
title: Wire SortableTable into admin pages
area: ui
files:
  - src/components/sortable-table.tsx
  - src/app/admin/index/page.tsx
  - src/app/admin/fees/catalog/page.tsx
  - src/app/admin/districts/page.tsx
---

## Problem

SortableTable component exists but isn't wired into any admin pages yet. The national index, districts index, and other table-heavy pages use static tables. User needs sortable columns to validate high/low fee values quickly.

## Solution

Wire SortableTable into:
1. `/admin/index` — National Fee Index table (sort by median, institution count, P25/P75)
2. `/admin/districts` — Districts index table (sort by institution count, coverage, fees)
3. `/admin/fees/catalog` — Already has SortLink but convert to SortableTable for consistency
4. Any other table-heavy admin page that benefits from sorting

---
phase: 57-admin-ux-sortable-tables-districts
plan: 03
subsystem: admin-districts
tags: [districts, tabs, sortable-table, bug-fix]
dependency_graph:
  requires: []
  provides: [getDistrictFeeMedians, DistrictTabs, sortable-districts-index]
  affects: [/admin/districts, /admin/districts/[id]]
tech_stack:
  added: []
  patterns: [tabbed-layout, sentiment-cards, PERCENTILE_CONT-aggregate]
key_files:
  created:
    - src/app/admin/districts/[id]/district-tabs.tsx
  modified:
    - src/app/admin/districts/[id]/page.tsx
    - src/app/admin/districts/page.tsx
    - src/lib/crawler-db/fee-index.ts
decisions:
  - "Used useState for tab state (not URL params) per RESEARCH assumption A3"
  - "PERCENTILE_CONT single-query approach for district fee medians (avoids N+1)"
  - "Computed fee_related percentage from fee_related_complaints / total_complaints (fixed bug)"
metrics:
  duration: 173s
  completed: 2026-04-10T18:16:24Z
  tasks_completed: 2
  tasks_total: 2
  files_created: 1
  files_modified: 3
---

# Phase 57 Plan 03: District Tabs & Sortable Index Summary

Tabbed district detail page (Economy/Fees/Complaints/Beige Book) with new PERCENTILE_CONT fee medians query and sortable districts index table.

## Task Results

| Task | Name | Commit | Key Changes |
|------|------|--------|-------------|
| 1 | Create DistrictTabs and restructure detail page | df31c92 | DistrictTabs client component, getDistrictFeeMedians query, 4-tab layout, fee_related_pct bug fix, sentiment-colored theme cards |
| 2 | Upgrade districts index to sortable table | bc2b978 | Card grid replaced with SortableTable, 5 columns, default sort by name asc |

## Implementation Details

### Task 1: Tabbed District Detail
- Created `DistrictTabs` client component with 4 tabs using useState
- Economy tab: economic summary (unemployment, nonfarm payroll), fee revenue, FRED indicators, speeches/research
- Fees tab: per-category medians table from new `getDistrictFeeMedians` query using PERCENTILE_CONT aggregate with HAVING >= 3 institutions
- Complaints tab: total complaints, fee-related count with computed percentage, top products list
- Beige Book tab: summary with accordion sections, sentiment-colored theme cards (emerald/red/amber/gray)
- Fixed bug: old code checked for nonexistent `fee_related_pct` property; now correctly uses `fee_related_complaints / total_complaints`

### Task 2: Sortable Districts Index
- Replaced card grid with SortableTable component
- Columns: District (number), Name, Institutions, With Fees, Coverage (%)
- Default sort: name ascending (D-02)
- District number and name both link to detail page

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Dark mode support added to tab content**
- **Found during:** Task 1
- **Issue:** Original flat layout lacked dark mode classes on several elements
- **Fix:** Added dark: variants to all card backgrounds, text colors, and borders in tab content
- **Files modified:** src/app/admin/districts/[id]/page.tsx

## Known Stubs

None -- all tab content is wired to live database queries.

## Self-Check: PASSED

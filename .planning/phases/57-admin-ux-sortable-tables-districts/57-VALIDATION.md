# Phase 57: Admin UX Sortable Tables & Districts - Validation

**Created:** 2026-04-10

## Validation Approach

This phase is primarily UI/UX work (component updates, layout restructuring, responsive fixes). Validation combines automated TypeScript compilation checks with manual visual verification.

### Automated Validation

| Check | Command | When |
|-------|---------|------|
| TypeScript compilation | `npx tsc --noEmit` | After every task |
| Existing test suite | `npx vitest run src/lib` | After every task (regression) |
| Full test suite | `npx vitest run` | After each wave completes |

### Manual Validation

| Requirement | Validation Method | Plan |
|-------------|-------------------|------|
| ADM-01: SortableTable on all admin pages | Click column headers on each admin page, verify URL updates with ?sort=...&dir=... | 57-01 |
| ADM-02: Server-side sort + page-size selector | Visit /admin/review, change page size to 100, verify URL updates to ?per=100, navigate pages, verify per persists | 57-02 |
| ADM-03: District intelligence tabs | Visit /admin/districts/1, click each tab (Economy, Fees, Complaints, Beige Book), verify content renders | 57-03 |
| ADM-04: Responsive at 768px | Open devtools at 768px, visit all admin pages, verify no horizontal page overflow | 57-04 |

### Visual Verification Checkpoint

Plan 57-04 Task 2 is a `checkpoint:human-verify` that gates phase completion. The user must visually confirm:

1. No horizontal overflow at 768px on any admin page
2. Dashboard and market grids collapse appropriately
3. Sortable tables function on all pages
4. District tabs render correctly
5. Page-size selectors appear on review and catalog

### Decision Traceability

| Decision | Validation |
|----------|------------|
| D-01 (all tables sortable) | Click headers on every admin table -- sort arrows appear, rows reorder |
| D-02 (alphabetical default) | Fresh visit to any admin table page shows rows sorted A-Z by name column |
| D-03 (URL persistence) | Sort a table, copy URL, open in new tab -- same sort state |
| D-04 (hybrid approach) | Bounded tables use SortableTable (client), review/catalog use ServerSortableTable (server) |
| D-05 (server-side pagination) | Review queue with ?per=100&page=2 returns correct slice of data |
| D-06 (page-size selector) | 25/50/100 buttons visible on review and catalog, clicking changes row count |
| D-07 (ServerSortableTable) | File exists at src/components/server-sortable-table.tsx, no "use client" directive |
| D-08 (URL params in SortableTable) | grep confirms useSearchParams in sortable-table.tsx, no useState for sort |
| D-09 (district intelligence) | District detail shows economic, fee, complaint, and Beige Book data |
| D-10 (tabbed layout) | Four tabs visible, clicking switches content without page reload |
| D-11 (districts index table) | /admin/districts shows sortable table, not card grid |
| D-12 (sentiment cards) | Beige Book tab shows colored cards (emerald/red/gray/amber by sentiment) |
| D-13 (adaptive layouts) | Dashboard at 768px: grids collapse to fewer columns |
| D-14 (overflow-x-auto) | Wide tables at 768px scroll horizontally within container, not the page |
| D-15 (triage discretion) | Complex pages (dashboard, market, districts) get full adaptive; simpler pages get overflow-x-auto |

### Risk Areas

1. **Suspense boundaries** -- SortableTable with useSearchParams requires Suspense wrapping at every call site. Missing wrapping causes build errors.
2. **Pagination param preservation** -- PageSizeSelector and Pagination must both preserve the `per` param. Missing preservation causes page-size reset on navigation.
3. **getDistrictFeeMedians performance** -- New SQL query with PERCENTILE_CONT. Monitor for slow execution on large datasets.

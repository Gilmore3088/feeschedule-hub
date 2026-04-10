# Phase 57: Admin UX -- Sortable Tables & Districts - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-04-10
**Phase:** 57-admin-ux-sortable-tables-districts
**Areas discussed:** Sortable table rollout strategy, Server-side sort for large tables, District detail page content, Responsive / tablet pass

---

## Sortable Table Rollout Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| All tables sortable | Adopt SortableTable for every table with 3+ rows. 11 pages to update. | Y |
| Only data tables | Skip config/settings tables and small summary tables. | |
| You decide | Claude picks based on row count and use case. | |

**User's choice:** All tables sortable
**Notes:** Consistent UX across all admin pages.

| Option | Description | Selected |
|--------|-------------|----------|
| Keep current order | Tables render in DB query order. Sorting opt-in. | |
| Alphabetical by name | Default to name/label column ascending. | Y |
| Most relevant first | Domain-specific defaults per table. | |

**User's choice:** Alphabetical by name

| Option | Description | Selected |
|--------|-------------|----------|
| URL params | Sort column and direction in ?sort=name&dir=asc. | Y |
| Local state only | useState inside SortableTable. Resets on navigate. | |

**User's choice:** URL params

| Option | Description | Selected |
|--------|-------------|----------|
| Hybrid | Client-side for bounded, server-side for unbounded. | Y |
| All server-side | Every table sorts via URL params + server query. | |
| All client-side | Keep everything in SortableTable. | |

**User's choice:** Hybrid

---

## Server-Side Sort for Large Tables

| Option | Description | Selected |
|--------|-------------|----------|
| Server-side pagination | URL params ?page=1&per=50&sort=name&dir=asc. | Y |
| Virtual scrolling | Render visible window, load more on scroll. | |
| You decide | Claude picks based on complexity. | |

**User's choice:** Server-side pagination

| Option | Description | Selected |
|--------|-------------|----------|
| 50 rows | Good balance of density and performance. | |
| 100 rows | More data per page, fewer clicks. | |
| User-selectable | Dropdown with 25/50/100 options. | Y |

**User's choice:** User-selectable (25/50/100)

| Option | Description | Selected |
|--------|-------------|----------|
| Separate ServerSortableTable | Server component reading searchParams. Clean separation. | Y |
| Extend existing SortableTable | Add server-side mode via props. One component. | |

**User's choice:** Separate ServerSortableTable

---

## District Detail Page Content

| Option | Description | Selected |
|--------|-------------|----------|
| Full intelligence panel | Beige Book + FRED + CFPB + median fees + Call Reports. | Y |
| Core metrics only | Beige Book headline + top 3 indicators + fee medians. | |
| Match current imports | Wire whatever is imported but not rendered. | |

**User's choice:** Full intelligence panel

| Option | Description | Selected |
|--------|-------------|----------|
| Tabbed sections | Economy / Fees / Complaints / Beige Book tabs. | Y |
| Single long scroll | All sections stacked vertically. | |
| Two-column dashboard | Left charts, right tables. | |

**User's choice:** Tabbed sections

| Option | Description | Selected |
|--------|-------------|----------|
| Upgrade both | Index page becomes sortable table with metrics. | Y |
| Detail pages only | Index stays as-is, focus on detail. | |
| You decide | Claude decides based on effort. | |

**User's choice:** Upgrade both

| Option | Description | Selected |
|--------|-------------|----------|
| Theme cards with sentiment | Card per theme with sentiment indicator + excerpt. | Y |
| Summary paragraph + quotes | AI-generated summary with inline quotes. | |
| You decide | Claude picks based on data shape. | |

**User's choice:** Theme cards with sentiment

---

## Responsive / Tablet Pass

| Option | Description | Selected |
|--------|-------------|----------|
| No horizontal overflow | Minimum viable -- tables scroll, cards stack. | |
| Adaptive layouts | Full mobile-first treatment -- stacked cards, collapsed sidebar. | Y |
| You decide | Claude picks depth per page. | |

**User's choice:** Adaptive layouts

| Option | Description | Selected |
|--------|-------------|----------|
| Horizontal scroll | overflow-x-auto container. User scrolls for columns. | Y |
| Hide low-priority columns | Responsive classes hide certain columns. | |
| Both | Hide some + scroll rest. | |

**User's choice:** Horizontal scroll

| Option | Description | Selected |
|--------|-------------|----------|
| Districts + Dashboard first | Most visual pages get priority. | |
| All pages equal | Every page gets full adaptive treatment. | |
| You decide | Claude triages by visual complexity. | Y |

**User's choice:** You decide (Claude's Discretion)

---

## Claude's Discretion

- Which pages get full adaptive layout vs just overflow fixes (D-15)

## Deferred Ideas

None

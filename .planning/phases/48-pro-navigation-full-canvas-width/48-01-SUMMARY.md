---
phase: 48-pro-navigation-full-canvas-width
plan: "01"
status: complete
started: 2026-04-09
completed: 2026-04-09
tasks_completed: 2
tasks_total: 2
---

# Plan 48-01: Delete Legacy Pro Routes + Add Redirects — Summary

## What Was Built

Eliminated all 9 legacy Pro tab route directories and dead nav components. Added 10 permanent redirects in next.config.ts mapping old URLs to Hamilton screens. Updated Pro loading skeleton for full-width.

## Tasks Completed

| # | Task | Status |
|---|------|--------|
| 1 | Delete old Pro route directories and dead nav components | Complete |
| 2 | Add permanent redirects in next.config.ts and update loading skeleton | Complete |

## Key Files

### Deleted (19 files across 9 directories)
- `src/app/pro/categories/` — old categories tab
- `src/app/pro/peers/` — old peers tab (page, actions, saved-groups)
- `src/app/pro/market/` — old market tab
- `src/app/pro/districts/` — old districts tab
- `src/app/pro/data/` — old data tab
- `src/app/pro/news/` — old news tab (page, actions, news-feed)
- `src/app/pro/research/` — old research tab (page, analyst-hub)
- `src/app/pro/reports-legacy/` — old reports (page, new/page)
- `src/app/pro/brief/` — old brief API routes
- `src/app/pro/dashboard.tsx` — dead dashboard component
- `src/components/pro-nav.tsx` — dead nav component

### Modified
- `next.config.ts` — 10 permanent redirects added
- `src/app/pro/loading.tsx` — removed max-w-7xl constraint

## Verification

- `ls src/app/pro/` shows only: `(hamilton)/ layout.tsx loading.tsx page.tsx`
- `grep -c "permanent: true" next.config.ts` returns 10
- No max-w in loading.tsx

## Self-Check: PASSED

## Commits

1. `dee0fbb` — refactor(48): delete 9 legacy Pro tab routes and dead nav components
2. `e14e15d` — feat(48): add permanent redirects for old Pro routes + full-width loading skeleton

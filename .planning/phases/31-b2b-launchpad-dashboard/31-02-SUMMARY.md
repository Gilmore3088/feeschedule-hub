---
phase: 31-b2b-launchpad-dashboard
plan: "02"
subsystem: pro-dashboard
tags: [pro, dashboard, recent-activity, beige-book, hamilton, reports]

dependency_graph:
  requires:
    - src/lib/research/history.ts (ensureResearchTables, listConversations, Conversation)
    - src/lib/crawler-db/fed.ts (getBeigeBookThemes, BeigeBookTheme)
    - src/lib/crawler-db/connection.ts (sql — raw query for published_reports)
    - src/lib/fed-districts.ts (DISTRICT_NAMES)
    - src/lib/format.ts (timeAgo)
  provides:
    - ProDashboard with recent activity panel + Beige Book digest below the four-door grid
  affects:
    - src/app/pro/dashboard.tsx (extends Plan 01 output)

tech_stack:
  added: []
  patterns:
    - sequential try/catch data fetches for optional tables (research_conversations, published_reports, beige_book_themes)
    - raw sql template literal for published_reports (no query helper exists yet)
    - category priority sort for Beige Book themes (growth > employment > prices > lending_conditions)
    - inline sentiment dot: bg-emerald-500 / bg-red-400 / bg-amber-400 / bg-gray-400

key_files:
  created: []
  modified:
    - src/app/pro/dashboard.tsx

decisions:
  - "Tasks 1 and 2 committed together — both target same file and are tightly coupled"
  - "published_reports queried via raw sql (no helper function exists); wrapped in try/catch so missing table degrades gracefully"
  - "DISTRICT_NAMES imported from fed-districts.ts (exported there), not from fed.ts (local-only constant in that file)"
  - "Beige Book digest only renders when beigeBookDigest.length > 0 AND district is non-null — no empty state shown per CONTEXT.md"
  - "listConversations signature is (userId, agentId?, limit?) — agentId passed as 'hamilton' to scope to Hamilton agent only"

metrics:
  duration_minutes: 6
  completed_date: "2026-04-08"
  tasks_completed: 2
  tasks_total: 3
  files_changed: 1
---

# Phase 31 Plan 02: Recent Activity + Beige Book Digest Summary

Extended `ProDashboard` with a two-column recent activity panel (last 3 Hamilton conversations + last 3 reports) and a Beige Book district digest showing up to 3 economic themes with sentiment indicators, all below the four-door grid from Plan 01.

## What Was Built

**Recent activity panel (lg:col-span-8 main area, mt-8 below door grid):**
- Section header: "Recent Activity" in 10px uppercase tracking label
- Two-column grid (sm:grid-cols-2)
- Left card: "Hamilton Conversations" — last 3 conversations from `listConversations(user.id, 'hamilton', 3)`, each row links to `/pro/research?conversation={id}`, shows `c.title || 'Untitled conversation'` + `timeAgo(c.updated_at)`. Empty state: "No conversations yet. Start one in Hamilton."
- Right card: "Generated Reports" — last 3 from `published_reports` via raw SQL, each row links to `/research/{slug}`, shows title + report_type badge + `timeAgo(published_at)`. Empty state: "No reports yet. Generate one from Reports."
- Both cards: `rounded-xl border border-[#E8DFD1] bg-white/80 backdrop-blur-sm` with `FAF7F2/60` header band and terracotta "View all" links

**Beige Book district digest (mt-6 below recent activity):**
- Only renders when `beigeBookDigest.length > 0 && district !== null`
- Card header: "Economic Outlook: {DISTRICT_NAMES[district]}" in Newsreader serif, "Latest Beige Book Summary" sub-label, "Full district report" link to `/pro/districts/{district}`
- Up to 3 themes sorted: growth → employment → prices → lending_conditions
- Each theme: sentiment dot (6x6 rounded-full, emerald/red/amber/gray) + category label (Growth/Employment/Prices/Lending) + summary text in `text-[#5A5347]`

**Data fetching additions (all try/catch wrapped):**
1. `ensureResearchTables()` then `listConversations(user.id, 'hamilton', 3)`
2. Raw SQL on `published_reports` table — degrades silently when table absent
3. `getBeigeBookThemes()` (latest release) then filtered by `district` and sorted

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Correctness] DISTRICT_NAMES sourced from fed-districts.ts, not fed.ts**
- **Found during:** Task 2 implementation
- **Issue:** Plan referenced `DISTRICT_NAMES` from `@/lib/fed-districts`, which is correct. However `fed.ts` also defines a private (non-exported) `DISTRICT_NAMES` constant internally. Confirmed the fed-districts.ts export is the canonical one and imported from there.
- **Fix:** Import `DISTRICT_NAMES` from `@/lib/fed-districts` (already imported for `STATE_TO_DISTRICT`); added to the destructured import.
- **Files modified:** src/app/pro/dashboard.tsx
- **Commit:** 23e970c

## Known Stubs

None. All data sources are wired:
- `listConversations` queries live `research_conversations` table
- `published_reports` SQL query reads live data
- `getBeigeBookThemes` queries live `beige_book_themes` table
- Graceful empty states shown when data is absent (not placeholder text passed to UI)

## Threat Flags

None. No new network endpoints or auth paths introduced. All three data fetches are user-scoped (conversations by user_id via listConversations) or public Fed data (Beige Book). `published_reports` query is not user-scoped — shows globally recent reports, consistent with plan note: "If published_reports does not have a user_id column, show the 3 most recent published reports instead."

## Self-Check: PASSED

- [x] `src/app/pro/dashboard.tsx` exists and modified (234 insertions)
- [x] Commit `23e970c` exists in git log
- [x] `npx tsc --noEmit` reports zero errors in `src/app/pro/` routes
- [x] Pre-existing MockSql test file errors unchanged from Plan 01 baseline
- [x] Task 3 is a checkpoint:human-verify — execution paused for visual verification

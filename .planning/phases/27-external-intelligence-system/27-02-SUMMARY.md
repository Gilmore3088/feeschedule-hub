---
phase: 27-external-intelligence-system
plan: "02"
subsystem: admin-ui + server-actions
tags: [external-intelligence, admin-portal, server-actions, national-portal, intelligence-tab]
dependency_graph:
  requires:
    - external_intelligence Postgres table (27-01)
    - intelligence.ts CRUD/search query module (27-01)
    - /admin/national portal shell (26-01)
  provides:
    - Intelligence tab in /admin/national tab nav (5th tab)
    - IntelligencePanel server component with paginated list
    - IntelligenceAddForm client component with useActionState
    - IntelligenceDeleteButton client component with confirm + useTransition
    - intelligence-actions.ts server actions (add + delete, requireAuth edit)
  affects:
    - src/app/admin/national/tab-nav.tsx
    - src/app/admin/national/page.tsx
tech_stack:
  added: []
  patterns:
    - Server component panel fetches list, delegates mutations to client sub-components
    - useActionState for form submission with pending/success/error states
    - useTransition for async delete with optimistic disabled state
    - requireAuth("edit") guards write actions (analysts + admins only)
    - revalidatePath("/admin/national") after mutations for fresh SSR data
key_files:
  created:
    - src/app/admin/national/intelligence-panel.tsx
    - src/app/admin/national/intelligence-add-form.tsx
    - src/app/admin/national/intelligence-delete-button.tsx
    - src/app/admin/national/intelligence-actions.ts
  modified:
    - src/app/admin/national/tab-nav.tsx (TABS const + type extended with "intelligence")
    - src/app/admin/national/page.tsx (IntelligencePanel import + render branch)
decisions:
  - Used requireAuth("edit") not "admin" role — "edit" permission is held by analysts + admins, appropriate for content curation
  - Server component for panel list (SSR, no hydration overhead) with client leaf components for mutations only
  - Restored all national portal files (deleted in 27-01 cherry-pick) as part of task 1 to unblock tab work
metrics:
  duration: "~15 minutes"
  completed_date: "2026-04-07"
  tasks_completed: 2
  tasks_total: 2
  files_created: 4
  files_modified: 2
---

# Phase 27 Plan 02: Intelligence Admin UI Summary

Intelligence tab added to /admin/national with a curated-intelligence list, add form, and delete action. Admins can paste external research (CFPB surveys, ABA studies, regulatory guidance) into the system for Hamilton to retrieve via the searchIntelligence tool built in 27-01.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Restore national portal + add Intelligence tab | 1ed0481 | tab-nav.tsx, page.tsx, all panel files restored |
| 2 | Intelligence panel: list, add form, delete action | 79806b9 | intelligence-panel.tsx, intelligence-add-form.tsx, intelligence-delete-button.tsx, intelligence-actions.ts |

## What Was Built

**Intelligence tab** — "intelligence" added to TABS const in tab-nav.tsx (5th tab, after "health"). Page.tsx gains IntelligencePanel render branch.

**intelligence-panel.tsx** — Server component that calls `listIntelligence(50, 0)`. Renders a header showing record count + a table with Source (name/date, linked if URL present), Category (color-coded badge), Content (3-line clamp + tag chips), and Actions (delete). Empty state guides user to add first record. Delegates to two client sub-components.

**intelligence-add-form.tsx** — Client component. `useActionState` wraps `addIntelligenceAction`. Form fields: source_name (text, required), source_date (date, required), category (select of 5 options, required), source_url (url, optional), tags (text, comma-separated), content_text (textarea, required). Shows "Saving..." pending state, inline success/error feedback. Resets form on success via `formRef.current?.reset()`.

**intelligence-delete-button.tsx** — Client component. `useTransition` wraps `deleteIntelligenceAction`. `window.confirm` guard before delete. Shows "Deleting..." pending state, disabled during flight.

**intelligence-actions.ts** — Two server actions:
- `addIntelligenceAction(formData)` — validates all required fields, enforces category enum, splits comma-separated tags, calls `insertIntelligence`, revalidates `/admin/national`
- `deleteIntelligenceAction(id)` — calls `deleteIntelligence(id)`, handles not-found case, revalidates `/admin/national`
- Both: `requireAuth("edit")` guard (analysts + admins)

## Deviations from Plan

**[Deviation - Restoration] Restored national portal files deleted in 27-01 cherry-pick**
- Found during: Task 1 setup
- Issue: Commit dfb3a27 (27-01) had deleted src/app/admin/national/page.tsx and tab-nav.tsx as a side effect of its cherry-pick process. The restore commit (2cab78c) only restored admin-nav.tsx, not the national portal.
- Fix: `git checkout dfb3a27^ -- src/app/admin/national/` restored all 8 panel files from their last good state. Also restored intelligence.ts/test from dfb3a27.
- Files restored: page.tsx, tab-nav.tsx, overview-panel.tsx, call-reports-panel.tsx, economic-panel.tsx, health-panel.tsx, growth-chart.tsx, revenue-trend-chart.tsx

**[Rule 1 - Bug] Fixed invalid Permission type "admin" in server actions**
- Found during: Task 2 TypeScript check
- Issue: Used `requireAuth("admin")` but "admin" is a role, not a Permission. Valid permissions: view, approve, reject, edit, bulk_approve, manage_users, trigger_jobs, cancel_jobs, research.
- Fix: Changed to `requireAuth("edit")` — "edit" is held by analysts and admins, appropriate for intelligence curation.

## Known Stubs

None — IntelligencePanel renders live data from `listIntelligence()`. Empty state message shown when no records exist (correct behavior before first record is added).

## Threat Surface Scan

No new trust boundaries beyond plan scope.
- `addIntelligenceAction` and `deleteIntelligenceAction` are both guarded by `requireAuth("edit")` — only authenticated analysts/admins can write.
- content_text is stored as plain text (not rendered as HTML), no XSS surface.
- source_url is stored as-is; rendered with `target="_blank" rel="noopener noreferrer"`.

## Self-Check: PASSED

- `src/app/admin/national/intelligence-panel.tsx` — EXISTS
- `src/app/admin/national/intelligence-add-form.tsx` — EXISTS
- `src/app/admin/national/intelligence-delete-button.tsx` — EXISTS
- `src/app/admin/national/intelligence-actions.ts` — EXISTS
- `src/app/admin/national/tab-nav.tsx` contains "intelligence" — CONFIRMED
- `src/app/admin/national/page.tsx` contains IntelligencePanel — CONFIRMED
- `npx vitest run src/lib/crawler-db/intelligence.test.ts` — 12 tests pass
- Commit 1ed0481 — EXISTS
- Commit 79806b9 — EXISTS

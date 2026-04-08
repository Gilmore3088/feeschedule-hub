---
phase: 35-unified-chat-persona
plan: "02"
subsystem: research
tags: [research, chat, routing, cleanup]
dependency_graph:
  requires: [35-01]
  provides: [unified-hamilton-routing]
  affects: [admin-research-hub, pro-research, chat-transport]
tech_stack:
  added: []
  patterns:
    - Hardcoded transport URL /api/research/hamilton in all chat components
    - Single Hamilton card on Research Hub (no agent picker grid)
key_files:
  created: []
  modified:
    - src/app/admin/hamilton/research/page.tsx
    - src/app/admin/hamilton/research/[agentId]/page.tsx
    - src/app/admin/hamilton/research/[agentId]/research-chat.tsx
    - src/app/pro/research/page.tsx
    - src/app/pro/research/analyst-hub.tsx
  deleted:
    - src/app/api/research/[agentId]/route.ts
decisions:
  - Old [agentId] API route deleted entirely — /api/research/[agentId] now returns 404 (T-35-05 mitigated)
  - Research Hub simplified to single Hamilton card; roleOrder multi-agent grid removed
  - listConversations key changed from "fee-analyst" to "hamilton" in pro research page
metrics:
  duration: ~10 min
  tasks_completed: 2
  tasks_total: 2
  files_modified: 5
  files_deleted: 1
  completed_date: "2026-04-08"
---

# Phase 35 Plan 02: Remove Old Agent Route + Unify Chat Transport Summary

Delete the legacy `[agentId]` API route, replace the 4-agent Research Hub grid with a single Hamilton card, and hardcode `/api/research/hamilton` as the transport URL in all chat components.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Delete old [agentId] route + update Research Hub pages | 466d610 | route.ts deleted, research/page.tsx, [agentId]/page.tsx |
| 2 | Hardcode /api/research/hamilton in chat components | f2e89b2 | research-chat.tsx, analyst-hub.tsx, pro/research/page.tsx |

## What Was Built

**Task 1:** Deleted `src/app/api/research/[agentId]/route.ts` and its directory. Rewrote the admin Research Hub (`page.tsx`) to call `getHamilton("admin")` once and render a single card linking to `/admin/hamilton/research/hamilton`. Removed the `roleOrder` constant, the `agents.map()` grid, and the access-check logic. Updated the `[agentId]/page.tsx` chat page to call `getHamilton("admin")` directly (no `params` needed), and hardcode `"hamilton"` as the `listConversations` key and `agentId` prop.

**Task 2:** Changed both chat transport constructors from the dynamic `` `/api/research/${agentId}` `` template to the hardcoded string `"/api/research/hamilton"` — one in `research-chat.tsx` (admin) and one in `analyst-hub.tsx` (pro). Updated `pro/research/page.tsx` to pass `agentId="hamilton"` to `AnalystHub` and log conversations under the `"hamilton"` key instead of `"fee-analyst"`.

## Verification Results

- `npx tsc --noEmit` — no errors for any modified file
- `ls src/app/api/research/` — shows only `hamilton/` directory
- No references to `/api/research/fee-analyst`, `/api/research/ask` (in app/), `/api/research/content-writer`, or `/api/research/custom-query` in `src/app/`
- No calls to `getAdminAgents()`, `getPublicAgents()`, or `getAgent()` in `src/app/`
- `/api/research/hamilton` confirmed present in both `research-chat.tsx` and `analyst-hub.tsx`

## Deviations from Plan

None — plan executed exactly as written.

Note: `ask-search-bar.tsx` and `ask-widget.tsx` in `src/components/public/` still reference `/api/research/ask` — these are public consumer widgets that were not in scope for this migration and reference a separate endpoint.

## Known Stubs

None. All data flows are wired.

## Threat Flags

None. T-35-05 (Elevation of Privilege via agentId URL param) is fully mitigated — old route deleted, `/api/research/[agentId]` now returns 404.

## Self-Check: PASSED

- research/page.tsx: FOUND
- [agentId]/page.tsx: FOUND
- research-chat.tsx: FOUND
- pro/research/page.tsx: FOUND
- analyst-hub.tsx: FOUND
- [agentId]/route.ts: DELETED (confirmed)
- commit 466d610: FOUND
- commit f2e89b2: FOUND

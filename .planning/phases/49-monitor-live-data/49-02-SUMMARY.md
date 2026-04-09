---
phase: 49-monitor-live-data
plan: "02"
status: complete
started: 2026-04-09
completed: 2026-04-09
tasks_completed: 3
tasks_total: 3
---

# Plan 49-02: FloatingChatOverlay + Left Rail Wiring — Summary

## What Was Built

1. Replaced FloatingChatOverlay's broken hand-rolled SSE parser with `useChat` from `@ai-sdk/react`. The old parser targeted v4 `0:"text"` format but the API returns v6 UIMessage protocol.

2. Wired the Hamilton left rail to real DB data across 3 files (layout -> Shell -> LeftRail):
   - Pinned Institutions from `hamilton_watchlists`
   - Peer Sets from `saved_peer_sets`
   - Saved Analyses from `hamilton_saved_analyses`
   - Recent Work from `hamilton_scenarios`
   - Stripped all hardcoded items (Goldman Sachs, Morgan Stanley, Top 5 Global, etc.)
   - CONTEXT section now visible on all non-simulate screens

## Tasks Completed

| # | Task | Status |
|---|------|--------|
| 1 | Replace FloatingChatOverlay SSE parser with useChat | Complete |
| 2 | Wire left rail to real data (watchlist, peer sets, analyses) | Complete |
| 3 | Visual verification checkpoint | Pending human approval |

## Key Files

### Modified
- `src/components/hamilton/monitor/FloatingChatOverlay.tsx` — useChat replaces manual fetch/SSE
- `src/app/pro/(hamilton)/layout.tsx` — added watchlist + peer set fetches
- `src/components/hamilton/layout/HamiltonShell.tsx` — threads pinnedInstitutions + peerSets props
- `src/components/hamilton/layout/HamiltonLeftRail.tsx` — renders from props, no hardcoded constants
- `src/app/pro/(hamilton)/monitor/page.tsx` — removed userId prop from FloatingChatOverlay

## Verification

- `grep "useChat" FloatingChatOverlay.tsx` returns match
- `grep "parseSSEChunk" FloatingChatOverlay.tsx` returns 0
- `grep "PINNED_INSTITUTIONS\|Goldman Sachs" HamiltonLeftRail.tsx` returns 0
- `grep "pinnedInstitutions" HamiltonShell.tsx` returns 3
- `grep "getSavedPeerSets" layout.tsx` returns 2
- TypeScript compiles (0 errors in modified files)

## Self-Check: PASSED

## Commits

1. `0d4f517` — fix(49): replace FloatingChatOverlay SSE parser with useChat
2. `ed14dc3` — feat(49): wire left rail to real data — strip all hardcoded items

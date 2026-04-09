---
phase: 51-analyze-live-data
plan: "01"
subsystem: hamilton-pro-analyze
tags: [analyze, streaming, save-load, security, prompt-injection]
dependency_graph:
  requires: []
  provides: [loadAnalysis-server-action, analysisFocus-validation, save-load-end-to-end]
  affects: [pro/analyze, hamilton-api-route]
tech_stack:
  added: []
  patterns: [server-action-load-by-id, searchParams-promise-next16, useState-initializer-prop]
key_files:
  created: []
  modified:
    - src/app/api/research/hamilton/route.ts
    - src/app/pro/(hamilton)/analyze/actions.ts
    - src/app/pro/(hamilton)/analyze/page.tsx
    - src/components/hamilton/analyze/AnalyzeWorkspace.tsx
    - src/components/hamilton/analyze/WhatThisMeansPanel.tsx
decisions:
  - "Used VALID_FOCUS Set guard in route.ts rather than TypeScript narrowing — TypeScript types are client-only; the API boundary requires runtime validation"
  - "loadAnalysis uses response_json::text cast + JSON.parse because postgres driver may return JSONB as a string depending on driver version"
  - "isSaved initialized to true when initialAnalysis provided — prevents duplicate auto-save on load without needing a separate loaded flag"
  - "Removed hardcoded fallback paragraph from WhatThisMeansPanel — it was fabricated analysis text, not a structural placeholder"
metrics:
  duration: "~10 minutes"
  completed: "2026-04-09T21:41:49Z"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 5
---

# Phase 51 Plan 01: Analyze Live Data Wiring Summary

**One-liner:** Server-side analysisFocus validation via VALID_FOCUS Set guards prompt injection, and loadAnalysis() server action + searchParam wiring closes the save/load gap so clicking a saved analysis restores the full workspace.

## What Was Built

### Task 1: analysisFocus Validation + Demo Content Audit (ANL-01, ANL-02, ANL-04)

Added a `VALID_FOCUS` Set guard in `src/app/api/research/hamilton/route.ts` at the point where `analysisFocus` flows into `buildAnalyzeModeSuffix()`. Before this fix, any arbitrary string from the client body was embedded directly in the system prompt — a low-severity prompt injection vector (T-51-01). The guard replaces unknown values with `"Pricing"` before they reach the system prompt.

Audited all 9 Analyze components for hardcoded demo content per ANL-04/D-08. Found and removed a fabricated fallback paragraph in `WhatThisMeansPanel.tsx` ("This pricing position is increasingly difficult to defend and may lead to elevated scrutiny if peer movement continues.") that appeared when `content` was empty. The `DEFAULT_PROMPTS` in `ExploreFurtherPanel` are retained per D-07 — they are acceptable starter suggestions shown only when Hamilton returns no `exploreFurther` items.

ANL-01 and ANL-02 were confirmed already implemented: the `DefaultChatTransport` sends `mode: "analyze"` and `analysisFocus` on every request, and `buildAnalyzeModeSuffix()` in agents.ts fully implements focus tab context injection. No implementation changes needed for those requirements.

### Task 2: loadAnalysis Server Action + Save/Load End-to-End (ANL-03)

Added `loadAnalysis(id: string): Promise<AnalyzeResponse | null>` to `actions.ts`. The action:
- Requires an authenticated user (`getCurrentUser()`) — returns null if unauthenticated
- Scopes the query by `user_id` — a user cannot load another user's analysis (T-51-02)
- Casts the `id` parameter with `::uuid` — rejects malformed non-UUID strings before DB evaluation (T-51-03)
- Returns `null` on any error (silent — not surfaced to the client)

Updated `page.tsx` to accept `searchParams: Promise<{ analysis?: string }>` (Next.js 16 async pattern), await the param, call `loadAnalysis(analysisId)`, and pass the result as `initialAnalysis` to `AnalyzeWorkspace`.

Updated `AnalyzeWorkspace` to accept `initialAnalysis?: AnalyzeResponse | null` and pre-populate `parsedResponse` state via a `useState` initializer function. Sets `isSaved` to `true` when `initialAnalysis` is provided to prevent the `onFinish` auto-save from creating a duplicate record on next query submission.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed hardcoded fallback paragraph from WhatThisMeansPanel**
- **Found during:** Task 1 component audit (ANL-04)
- **Issue:** WhatThisMeansPanel had a fabricated analysis sentence rendered when `content` was falsy — a hardcoded fake insight that would show to users before any analysis was submitted
- **Fix:** Removed the `{!content && <p>…</p>}` branch; the component now renders nothing when content is empty (the parent `AnalyzeWorkspace` only renders the card when `displayedResponse` is truthy)
- **Files modified:** `src/components/hamilton/analyze/WhatThisMeansPanel.tsx`
- **Commit:** 9519e99

## Known Stubs

None. All data flows from real API responses or the database. `DEFAULT_PROMPTS` in `ExploreFurtherPanel` are intentional fallback suggestions per D-07, not stubs blocking the plan's goal.

## Threat Flags

No new threat surface introduced beyond what the plan's threat model already covers. The `loadAnalysis` action closes T-51-02 and T-51-03 as designed.

## Self-Check

Files verified:
- `src/app/api/research/hamilton/route.ts` — VALID_FOCUS present (grep confirmed)
- `src/app/pro/(hamilton)/analyze/actions.ts` — loadAnalysis export present (grep confirmed)
- `src/app/pro/(hamilton)/analyze/page.tsx` — searchParams + loadAnalysis wiring present
- `src/components/hamilton/analyze/AnalyzeWorkspace.tsx` — initialAnalysis prop present (8 matches)
- `src/components/hamilton/analyze/WhatThisMeansPanel.tsx` — hardcoded paragraph removed

Commits verified:
- 9519e99: fix(51-01): validate analysisFocus server-side and strip hardcoded demo content
- 7f01c40: feat(51-01): add loadAnalysis action and wire save/load end-to-end (ANL-03)

TypeScript: no errors in modified files (pre-existing errors in test files and FloatingChatOverlay are out of scope).

## Self-Check: PASSED

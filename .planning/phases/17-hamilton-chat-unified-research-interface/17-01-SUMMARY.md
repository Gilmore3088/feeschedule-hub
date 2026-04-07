---
phase: 17-hamilton-chat-unified-research-interface
plan: "01"
subsystem: hamilton-chat
tags: [hamilton, chat, api, streaming, supabase, tool-registry]
dependency_graph:
  requires:
    - 12-hamilton-foundation
    - 13-report-engine-core
  provides:
    - hamilton-chat-api
    - hamilton-tool-registry
    - hamilton-memory
  affects:
    - src/lib/hamilton/
    - src/app/api/hamilton/
tech_stack:
  added: []
  patterns:
    - Vercel AI SDK streamText with tool-use (same as research agents)
    - Supabase UUID PKs via gen_random_uuid()
    - Analyst/admin role gate (T-17-02)
key_files:
  created:
    - src/lib/hamilton/hamilton-agent.ts
    - src/lib/hamilton/chat-memory.ts
    - src/app/api/hamilton/chat/route.ts
  modified: []
decisions:
  - "loadConversationHistory requires user_id parameter to scope queries by owner (T-17-04)"
  - "z.record() requires two arguments in Zod v4 — fixed z.record(z.unknown()) to z.record(z.string(), z.unknown())"
  - "triggerReport uses X-Cron-Secret header to authenticate internal fetch to /api/reports/generate"
metrics:
  duration: "~20 minutes"
  completed: "2026-04-06"
  tasks_completed: 2
  tasks_total: 2
  files_created: 3
  files_modified: 0
---

# Phase 17 Plan 01: Hamilton Chat Backend Summary

Hamilton chat API backend fully implemented: streaming POST endpoint, agent tool registry, and Supabase-backed conversation persistence.

## One-liner

Auth-gated streaming Hamilton chat endpoint at `/api/hamilton/chat` with 14-tool registry (fee index, district, institution, report trigger) and Supabase conversation memory using UUID PKs.

## Files Created

| File | Purpose |
|------|---------|
| `src/lib/hamilton/hamilton-agent.ts` | Tool registry, system prompt builder, query classifier |
| `src/lib/hamilton/chat-memory.ts` | Supabase conversation + message persistence (6 exports) |
| `src/app/api/hamilton/chat/route.ts` | Streaming POST endpoint, auth-gated, cost-guarded |

## Tool Registry Contents

`buildHamiltonTools()` returns:

**From `src/lib/research/tools.ts` (public tools):**
- `searchFees` — fee category stats (median, P25/P75, all 49 categories)
- `searchIndex` — national or filtered peer fee index
- `searchInstitutions` — paginated institution list with filters
- `getInstitution` — single institution profile with all fees

**From `src/lib/research/tools-internal.ts` (admin tools):**
- `queryDistrictData` — Fed district stats + Beige Book content
- `queryStateData` — state-level institution and fee coverage
- `queryFeeRevenueCorrelation` — call report correlation data
- `queryOutliers` — validation-flagged outlier fees
- `getCrawlStatus` — pipeline health and crawl stats
- `getReviewQueueStats` — pending/approved/rejected counts
- `searchInstitutionsByName` — fuzzy institution name search
- `rankInstitutions` — rank by fee positioning metrics
- `queryJobStatus` — pipeline job history
- `queryDataQuality` — data quality funnel metrics
- `triggerPipelineJob` — safe pipeline command trigger

**Hamilton-specific:**
- `triggerReport` — calls `/api/reports/generate` internally; validates `report_type` against explicit allowlist before fetch (T-17-01)

## Memory Schema

```sql
hamilton_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL,
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

hamilton_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES hamilton_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  token_count INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_hamilton_conv_user ON hamilton_conversations(user_id, updated_at DESC);
CREATE INDEX idx_hamilton_msg_conv ON hamilton_messages(conversation_id, created_at ASC);
```

## chat-memory.ts Exports

- `ensureHamiltonTables(): Promise<void>` — idempotent table creation
- `createConversation(userId): Promise<string>` — returns UUID string
- `appendMessage(conversationId, role, content, tokenCount?)` — insert + bump updated_at
- `loadConversationHistory(conversationId, userId, limit?)` — scoped to user (T-17-04), returns ASC chronological messages
- `listConversations(userId, limit?)` — sorted by updated_at DESC
- `updateConversationTitle(conversationId, title)` — title update
- `ConversationSummary` interface

## Threat Model Coverage

| Threat | Mitigation | Implemented |
|--------|-----------|-------------|
| T-17-01 Tampering: triggerReport | report_type validated against `VALID_REPORT_TYPES` Set | Yes |
| T-17-02 EoP: auth gate | `getCurrentUser()` + analyst/admin role check | Yes |
| T-17-03 DoS: tool loop | `stepCountIs(10)` + `maxDuration=60` | Yes |
| T-17-04 Info Disclosure: history | `loadConversationHistory` requires `userId`, queries filter by `user_id` | Yes |
| T-17-05 Tampering: conversation_id | UUID_REGEX validation before any DB call | Yes |

## Decisions Made

1. `loadConversationHistory` signature extended with `userId: number` parameter beyond what the plan specified — required for T-17-04 cross-user protection. The route.ts passes `user.id` when calling it.

2. `z.record(z.string(), z.unknown())` — Zod v4 requires explicit key schema; corrected from single-arg `z.record(z.unknown())` which caused TS2554.

3. `triggerReport` uses `X-Cron-Secret` header (same as cron jobs) to authenticate the internal `fetch` to `/api/reports/generate`, avoiding the need for a separate internal bypass mechanism.

## TypeScript Compilation Status

```
npx tsc --noEmit 2>&1 | grep -E "hamilton-agent\.ts|chat/route\.ts|chat-memory\.ts"
```
Zero errors.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Security] Extended loadConversationHistory signature with userId**
- **Found during:** Task 2 — implementing T-17-04
- **Issue:** Plan specified `loadConversationHistory(conversationId, limit?)` but without `userId` the query cannot scope to the requesting user
- **Fix:** Added `userId: number` as second parameter; updated route.ts to pass `user.id`
- **Files modified:** `chat-memory.ts`, `route.ts`
- **Commit:** f8e6bb3

**2. [Rule 1 - Bug] Zod v4 z.record() requires two arguments**
- **Found during:** Task 1 TypeScript verification
- **Issue:** `z.record(z.unknown())` is invalid in Zod v4 (TS2554)
- **Fix:** Changed to `z.record(z.string(), z.unknown())`
- **Files modified:** `hamilton-agent.ts`
- **Commit:** f8e6bb3

## Self-Check: PASSED

- [x] `src/lib/hamilton/hamilton-agent.ts` exists
- [x] `src/lib/hamilton/chat-memory.ts` exists
- [x] `src/app/api/hamilton/chat/route.ts` exists
- [x] Commit f8e6bb3 exists
- [x] `maxDuration = 60` exported from route
- [x] `HAMILTON_SYSTEM_PROMPT` used via `buildHamiltonSystemPrompt()`
- [x] `classifyQuery`, `buildHamiltonSystemPrompt`, `buildHamiltonTools` exported
- [x] All 6 memory functions + ConversationSummary exported from chat-memory

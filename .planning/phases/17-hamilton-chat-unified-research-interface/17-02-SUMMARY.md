---
phase: 17-hamilton-chat-unified-research-interface
plan: "02"
subsystem: hamilton-chat-ui
tags: [hamilton, chat, streaming, ai-sdk, supabase, frontend]
dependency_graph:
  requires: [17-01]
  provides: [hamilton-chat-ui, conversation-api-routes]
  affects: [admin-hamilton-nav]
tech_stack:
  added:
    - chat-memory.ts (Supabase conversation persistence)
    - hamilton-agent.ts (LLM tool registry + system prompt builder)
  patterns:
    - useChat with body function for dynamic conversation_id passthrough
    - isMiniReport heuristic for editorial card rendering (D-16 warm palette)
    - simpleMarkdown with entity escaping before processing (T-17-06 XSS)
key_files:
  created:
    - src/app/admin/hamilton/chat/page.tsx
    - src/app/admin/hamilton/chat/hamilton-chat.tsx
    - src/app/admin/hamilton/chat/chat-message.tsx
    - src/app/api/hamilton/chat/route.ts
    - src/app/api/hamilton/conversations/route.ts
    - src/app/api/hamilton/conversations/[id]/messages/route.ts
    - src/lib/hamilton/chat-memory.ts
    - src/lib/hamilton/hamilton-agent.ts
  modified: []
decisions:
  - "Used DefaultChatTransport body as a function (() => object) instead of prepareRequestBody — prepareRequestBody is not on HttpChatTransportInitOptions in ai@6.0.116; body accepts Resolvable<object> which includes () => object, enabling dynamic conversation_id per request"
  - "requireAuth('research') used in page.tsx — 'analyst' is a role not a Permission; 'research' permission maps to analyst + admin roles"
  - "chat-memory.ts and hamilton-agent.ts included in this plan — Plan 01 files were on a separate worktree branch (commits 49553e0, f8e6bb3) not yet merged into this worktree's main; recreated from git show to unblock Plan 02"
metrics:
  completed: "2026-04-06"
  tasks_completed: 2
  files_created: 8
  files_modified: 0
---

# Phase 17 Plan 02: Hamilton Chat UI Summary

Hamilton chat frontend — full-height conversational interface at `/admin/hamilton/chat` with streaming AI responses, mini-report editorial card styling (amber accent, D-16 palette), conversation history sidebar backed by Supabase, and export actions (Markdown + Report print).

## Files Created

| File | Purpose |
|------|---------|
| `src/app/admin/hamilton/chat/page.tsx` | Server component — requireAuth("research"), ensureHamiltonTables fire-and-forget, listConversations(30), renders HamiltonChat |
| `src/app/admin/hamilton/chat/hamilton-chat.tsx` | Client component — useChat wired to /api/hamilton/chat, conversation sidebar, 5 example chips empty state, handleLoadConversation |
| `src/app/admin/hamilton/chat/chat-message.tsx` | Message renderer — isMiniReport detection, amber card (D-16), pull quotes border-l-4 border-amber-500, InlineChart, Export Markdown/Report/CSV actions |
| `src/app/api/hamilton/chat/route.ts` | POST streaming endpoint — auth (analyst/admin), rate limit, $50/day cost breaker, conversation memory inject, stepCountIs(10) tool cap |
| `src/app/api/hamilton/conversations/route.ts` | GET — auth-gated conversation list for sidebar refresh |
| `src/app/api/hamilton/conversations/[id]/messages/route.ts` | GET — UUID validated, user-scoped (T-17-07), returns loadConversationHistory |
| `src/lib/hamilton/chat-memory.ts` | Supabase persistence — ensureHamiltonTables, createConversation, appendMessage, loadConversationHistory (user_id scoped), listConversations, updateConversationTitle |
| `src/lib/hamilton/hamilton-agent.ts` | Tool registry — buildHamiltonTools (publicTools + internalTools + triggerReport), buildHamiltonSystemPrompt, classifyQuery |

## Mini-Report Detection

`isMiniReport(content: string)` heuristic:
- Returns `true` if content contains `"## Key Finding"` OR has 3+ `###` headings
- When true: wraps prose in `.admin-card p-5` with `border-t-2 border-amber-400` (D-16 warm editorial)
- Pull quotes rendered with `border-l-4 border-amber-500 pl-4 italic font-medium` (D-16)

## Conversation API Routes Added

- `GET /api/hamilton/conversations` — lists user's conversations for sidebar refresh after each exchange
- `GET /api/hamilton/conversations/[id]/messages` — returns conversation history; UUID regex validated, conversation ownership verified via user_id scope in `loadConversationHistory` (T-17-07)

## Security Checks

- **T-17-06 (XSS):** `simpleMarkdown()` escapes `&`, `<`, `>` as HTML entities before any regex processing; links only allow `http://` and `https://` protocols
- **T-17-07 (Info Disclosure):** `/api/hamilton/conversations/[id]/messages` validates UUID format + `loadConversationHistory` is scoped to `(conversation_id, user_id)` — cross-user access impossible
- **T-17-08 (Tampering):** conversation_id passed through client body is re-validated as UUID v4 in the chat API route (Plan 01 T-17-05)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Plan 01 files absent from worktree**
- **Found during:** Task 1 setup
- **Issue:** `src/lib/hamilton/chat-memory.ts`, `src/lib/hamilton/hamilton-agent.ts`, and `src/app/api/hamilton/chat/route.ts` were committed on a separate worktree branch (commits `f8e6bb3`, `49553e0`) not yet merged into this worktree's `main` (HEAD `064ea80`). Page.tsx and hamilton-chat.tsx would not compile without them.
- **Fix:** Retrieved full file contents via `git show 97468fd:src/lib/hamilton/...` and recreated them exactly. No functional changes.
- **Files modified:** chat-memory.ts, hamilton-agent.ts, api/hamilton/chat/route.ts (created)
- **Commits:** e2dbe3c

**2. [Rule 1 - Bug] prepareRequestBody not available on DefaultChatTransport**
- **Found during:** Task 2 TypeScript check
- **Issue:** `prepareRequestBody` is not a property of `HttpChatTransportInitOptions` in `ai@6.0.116`. Plan spec referenced this API which doesn't exist in the installed version.
- **Fix:** Used `body: () => ({ conversation_id: conversationIdRef.current ?? undefined })` — `body` accepts `Resolvable<object>` which includes a function, enabling dynamic conversation_id per request via a ref.
- **Files modified:** hamilton-chat.tsx

**3. [Rule 1 - Bug] requireAuth("analyst") wrong type**
- **Found during:** Task 1 TypeScript check
- **Issue:** `requireAuth` accepts a `Permission` not a role name. `"analyst"` is a role; the correct permission for analyst+admin access is `"research"`.
- **Fix:** Changed to `requireAuth("research")`.
- **Files modified:** page.tsx

## TypeScript Compilation Status

Zero errors across all 8 new files. Pre-existing `vitest` type declaration errors in test files (`src/lib/hamilton/validate.test.ts`, `voice.test.ts`, etc.) are unrelated to this plan and were present before execution.

## Self-Check: PASSED

All 8 files verified present on disk. Commits e2dbe3c and c4a9d74 verified in git log.

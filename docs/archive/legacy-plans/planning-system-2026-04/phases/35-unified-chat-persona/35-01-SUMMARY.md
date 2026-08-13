---
phase: 35-unified-chat-persona
plan: 01
subsystem: research-agents
tags: [agents, hamilton, role-based-access, api-routes, tdd]
dependency_graph:
  requires: []
  provides: [getHamilton, HamiltonRole, /api/research/hamilton]
  affects: [src/app/api/research/[agentId]/route.ts, src/app/pro/research/page.tsx, src/app/admin/hamilton/research]
tech_stack:
  added: []
  patterns: [role-gated AgentConfig, session-derived role resolution, toolset gating by OPS_TOOL_NAMES set]
key_files:
  created:
    - src/lib/research/agents.test.ts
    - src/app/api/research/hamilton/route.ts
  modified:
    - src/lib/research/agents.ts
    - src/app/api/research/[agentId]/route.ts
    - src/app/admin/hamilton/research/[agentId]/page.tsx
    - src/app/admin/hamilton/research/page.tsx
    - src/app/admin/hamilton/research/usage/page.tsx
    - src/app/admin/research/usage/page.tsx
    - src/app/pro/research/page.tsx
decisions:
  - "OPS_TOOL_NAMES set gates pro vs admin toolsets — single source of truth for which tools are ops-only"
  - "Old [agentId] route kept with legacy agentId→role mapping for backward compat; hamilton route is the new permanent home"
  - "getHamilton builds fresh per call (no caching) — same pattern as old buildAgents"
metrics:
  duration: "~25 minutes"
  completed: "2026-04-08T18:41:00Z"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 9
---

# Phase 35 Plan 01: Unified Hamilton Persona Summary

Replace the 4-agent system (ask/fee-analyst/content-writer/custom-query) with a single `getHamilton(role)` function and a dedicated `/api/research/hamilton` endpoint — three role depths sharing one Hamilton voice.

## What Was Built

**agents.ts rewrite:** `buildHamilton(role)` replaces 4 separate prompt builders. Single `getHamilton(role: HamiltonRole)` export with role-specific tool gating, model selection, and prompt prefixes prepended before `HAMILTON_SYSTEM_PROMPT`.

- Consumer: `claude-haiku-4-5-20251001` + `publicTools` only + plain-language prefix, `maxSteps=3`, no auth required
- Pro: `claude-sonnet-4-5-20250929` + `publicTools + non-ops internalTools` + competitive peer framing, `maxSteps=5`, requires premium subscription
- Admin: `claude-sonnet-4-5-20250929` + all tools including `triggerPipelineJob` + operational prefix + live ops context, `maxSteps=8`, requires admin role

**Ops tool gating:** `OPS_TOOL_NAMES` set (`getCrawlStatus`, `getReviewQueueStats`, `queryJobStatus`, `queryDataQuality`, `triggerPipelineJob`) — pro gets `internalTools` minus these 5.

**`/api/research/hamilton/route.ts`:** New permanent endpoint. Role derived from session (`getCurrentUser()`): unauthenticated/viewer → consumer, premium → pro, analyst/admin → admin. All cross-cutting logic from old `[agentId]` route copied verbatim: daily cost circuit breaker, skill injection, `logUsage("hamilton", ...)`, per-role rate limiting.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Migrated all callers of removed `getAgent`/`getAdminAgents` functions**
- **Found during:** Task 2 — `npx tsc --noEmit` revealed 5 files importing removed exports
- **Issue:** `getAgent`, `getAdminAgents`, `getPublicAgents` removed from agents.ts; 5 consumer files broke
- **Fix:** Replaced `getAgent(agentId)` with `getHamilton(role)` using legacy agentId→role mapping; replaced `getAdminAgents()` with `Promise.all([getHamilton("pro"), getHamilton("admin")])`
- **Files modified:** `[agentId]/route.ts`, `admin/hamilton/research/[agentId]/page.tsx`, `admin/hamilton/research/page.tsx`, `admin/hamilton/research/usage/page.tsx`, `admin/research/usage/page.tsx`, `pro/research/page.tsx`
- **Commits:** 21edfd3

## Known Stubs

None — all data flows through live `getPublicStats()` and `opsContext()` DB queries.

## Threat Flags

All T-35-01 through T-35-04 mitigations from the plan's threat register are implemented:
- T-35-01 (Elevation of Privilege): Role derived exclusively from `getCurrentUser()` session; unauthenticated → consumer always
- T-35-02 (Tampering): `OPS_TOOL_NAMES` set gates `triggerPipelineJob` — consumer/pro configs cannot reference those tools
- T-35-03 (DoS): `getDailyCostCents()` checked before every request; 503 returned if >= $50/day
- T-35-04 (Info Disclosure): Consumer prompt is intentionally minimal; no operational data in consumer AgentConfig

## Self-Check

**Files created:**
- `src/lib/research/agents.test.ts` — exists
- `src/app/api/research/hamilton/route.ts` — exists
- `src/lib/research/agents.ts` — rewritten (exists)

**Commits:**
- `f586c02` — agents.ts rewrite + test
- `21edfd3` — hamilton route + caller migrations

**Tests:** 8/8 pass (`npx vitest run src/lib/research/agents.test.ts`)

**TypeScript:** Clean — no errors on files modified by this plan

## Self-Check: PASSED

# Phase 35: Unified Chat Persona - Context

**Gathered:** 2026-04-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace 4 separate chat agents (Ask/Analyst/ContentWriter/CustomQuery) with one unified Hamilton that adjusts depth, language, and tool access based on user role. Hard cutover — remove old agent IDs, single endpoint, clean break.

</domain>

<decisions>
## Implementation Decisions

### Routing strategy
- **D-01:** Single `/api/research/hamilton` endpoint. Reads user role from session (getCurrentUser). Old [agentId] routes removed entirely (hard cutover, not redirect).
- **D-02:** `getAgent(agentId)` replaced with `getHamilton(userRole)` that returns a single AgentConfig with role-appropriate prompt, model, and tools.

### Role-based depth
- **D-03:** Both system prompt prefix AND tool access gating per role:
  - **Consumer** (no auth / viewer): Simple language, no jargon, explain-first. Public tools only (searchFees, searchInstitutions, searchIndex, getInstitution).
  - **Pro** (premium): Peer-focused competitive analysis with revenue context. Public + internal tools (minus ops tools).
  - **Admin** (admin/analyst): Full depth, operational flags, data quality signals. All tools including ops (triggerPipelineJob, getCrawlStatus, getReviewQueueStats).
- **D-04:** One base Hamilton system prompt (from voice.ts v3.1) with a role-specific prefix block prepended. The prefix adjusts tone and focus, not the core identity.

### Model selection
- **D-05:** Role-based model:
  - Consumer: `claude-haiku-4-5-20251001` (fast, cheap, high volume)
  - Pro: `claude-sonnet-4-5-20250929` (deeper analysis)
  - Admin: `claude-sonnet-4-5-20250929` (full depth)
- **D-06:** Model can be overridden via env vars (BFI_MODEL_CONSUMER, BFI_MODEL_PRO, BFI_MODEL_ADMIN).

### Migration
- **D-07:** Hard cutover. Remove old agent IDs (ask, fee-analyst, content-writer, custom-query) from agents.ts entirely. Single `hamilton` export.
- **D-08:** Update Hamilton chat UI to call `/api/research/hamilton` instead of `/api/research/[agentId]`.
- **D-09:** Remove `getPublicAgents()` and `getAdminAgents()` functions. Replace with `getHamilton(role)`.
- **D-10:** Update any pages that list available agents (e.g., agent picker in chat UI) to show one Hamilton, not four options.

### Claude's Discretion
- Exact role-specific prefix wording
- How to handle unauthenticated users (default to consumer role)
- maxTokens and maxSteps per role (consumer may get lower limits)
- Whether to keep example questions per role or generate them dynamically

</decisions>

<canonical_refs>
## Canonical References

### Agent system (being replaced)
- `src/lib/research/agents.ts` — 4 agent definitions, getAgent(), getPublicAgents(), getAdminAgents()
- `src/app/api/research/[agentId]/route.ts` — API route that dispatches by agent ID

### Hamilton chat UI
- `src/app/admin/hamilton/chat/` — Chat interface (calls [agentId] route)
- `src/app/admin/hamilton/layout.tsx` — Hamilton layout

### Tool definitions
- `src/lib/research/tools-internal.ts` — 12+ internal tools (queryNationalData, queryDistrictData, etc.)
- `src/lib/research/tools.ts` — 4 public tools (searchFees, searchInstitutions, etc.)

### Voice (shared by unified Hamilton)
- `src/lib/hamilton/voice.ts` — v3.1.0 voice prompt (base for all roles)

</canonical_refs>

<code_context>
## Existing Code Insights

### Current architecture
- agents.ts exports 4 AgentConfig objects with separate systemPrompt, tools, model, maxTokens, maxSteps, requiresAuth, requiredRole
- API route reads agentId from URL, calls getAgent(agentId), checks auth, streams response
- Chat UI has agent picker dropdown (or hardcoded agent ID)

### What changes
- agents.ts: 4 configs → 1 `buildHamilton(role)` function
- API route: [agentId] → /hamilton, role from session
- Chat UI: remove agent picker, always call /hamilton

### What stays the same
- Tool definitions (tools.ts, tools-internal.ts) — unchanged
- Rate limiting, cost tracking, usage logging — unchanged
- Voice rules and forbidden terms — unchanged (shared base)
- Skill detection and injection — unchanged

</code_context>

<deferred>
## Deferred Ideas

- Dynamic example questions based on user's institution/district — v9.0 personalization
- Conversation memory across sessions — future enhancement
- Consumer-specific Hamilton landing page (separate from admin chat) — v9.0

</deferred>

---

*Phase: 35-unified-chat-persona*
*Context gathered: 2026-04-08*

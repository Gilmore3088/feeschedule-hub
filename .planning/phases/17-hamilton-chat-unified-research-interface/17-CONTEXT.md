# Phase 17: Hamilton Chat — Unified Research Interface - Context

**Gathered:** 2026-04-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Build a unified conversational interface at `/admin/hamilton` (Chat tab) where Hamilton acts as an on-demand real-time research consultant. Hamilton orchestrates all existing research capabilities internally — the user never picks which agent. Replaces Research Hub, Scout, and FeeScout as separate pages. Chat has persistent memory across sessions.

</domain>

<decisions>
## Implementation Decisions

### Chat UX
- **D-01:** Hybrid response mode — quick questions get streaming chat (SSE, like current Research Hub). Complex requests ("analyze Kansas", "compare these banks") produce structured mini-reports after processing. Hamilton decides which mode based on the query.
- **D-02:** Two tabs at `/admin/hamilton`: **Chat** (primary) and **Reports** (existing report management). Chat is the default landing.
- **D-03:** On-demand real-time consulting — Hamilton is available whenever you need him, not just for scheduled work.

### Memory
- **D-04:** Persistent memory across sessions — conversations stored in Supabase. "Remember that Kansas analysis from last week?" works. Hamilton has full context of past interactions.
- **D-05:** Session continuity — within a session, Hamilton tracks context. "Now compare that to Montana" works without repeating the question.

### Capabilities (Hamilton's internal tools)
- **D-06:** Query fee data — pull medians, P25/P75, institution counts, peer comparisons, any pipeline DB query. Uses existing `src/lib/crawler-db/` query layer.
- **D-07:** Generate reports — "Generate the Kansas state report" triggers the Phase 13 report engine from within chat. Hamilton shows progress inline.
- **D-08:** Research institutions — "What's First National Bank charging?" runs Scout/FeeScout pipeline internally. Hamilton surfaces the results conversationally.
- **D-09:** Economic context — "What's the Beige Book saying about the 10th district?" pulls Fed data from existing ingestion tables.
- **D-10:** Hamilton routes internally — user never sees or picks which agent/pipeline runs. The plumbing is invisible.

### Agent Consolidation
- **D-11:** Existing FeeScout 4-agent SSE pipeline becomes a Hamilton capability, not a standalone UI.
- **D-12:** Existing Research Hub agent interactions become Hamilton's research mode.
- **D-13:** Scout institution lookup becomes Hamilton's institution query capability.
- **D-14:** Old pages (`/admin/research`, `/admin/scout`) redirect to `/admin/hamilton` or are removed from nav.

### Voice & Presentation
- **D-15:** Hamilton uses the locked voice from `src/lib/hamilton/voice.ts` — McKinsey Partner tone, subtle authority, data-backed.
- **D-16:** Chat output uses the consumer brand palette (warm editorial) for rich responses.
- **D-17:** Structured responses include tables, charts (inline), and pull quotes — not just plain text.

### Claude's Discretion
- Chat component architecture (streaming, message store)
- How Hamilton decides streaming vs structured response
- Persistent memory schema design
- How to wire existing agent capabilities as Hamilton tools
- SSE implementation details

</decisions>

<canonical_refs>
## Canonical References

### Hamilton Foundation (Phase 12)
- `src/lib/hamilton/voice.ts` — locked voice rules
- `src/lib/hamilton/generate.ts` — generateSection() API
- `src/lib/hamilton/types.ts` — SectionInput, SectionOutput

### Existing Research Infrastructure
- `src/app/admin/research/` — Research Hub (agent chat, articles, usage)
- `src/app/admin/scout/` — FeeScout institution research
- `src/app/pro/research/` — Pro research page with analyst hub

### Data Layer
- `src/lib/crawler-db/` — all DB query functions (fee-index, market, dashboard, etc.)
- Fed data tables: `fed_beige_book`, `fed_content`, `fed_economic_indicators`

### Report Engine (Phase 13)
- `src/app/api/reports/generate/route.ts` — report generation trigger
- `src/lib/report-engine/` — types, freshness, editor, presign

### Existing Chat Patterns
- `src/app/admin/research/[agentId]/research-chat.tsx` — existing SSE chat component

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable
- `research-chat.tsx` — existing SSE streaming chat component with markdown rendering
- FeeScout pipeline — 4-agent SSE (Scout → Classifier → Extractor → Analyst)
- All `crawler-db/` query functions — direct SQL access to fee data
- `generateSection()` — Hamilton's narrative generation API
- Vercel AI SDK may already be in the project for streaming

### Key Rewrite
- The chat needs to be Hamilton-branded, not generic "Research Hub"
- Hamilton needs tool-use capability (decide which queries/agents to invoke)
- Persistent memory needs a new Supabase table

### Integration Points
- Chat → Hamilton voice (system prompt from voice.ts)
- Chat → DB queries (fee data, Fed data, institution lookup)
- Chat → Report engine (trigger report generation inline)
- Chat → Persistent memory (store/recall conversations)

</code_context>

<specifics>
## Specific Ideas

- Hamilton should feel like texting your lead analyst — casual input, professional output
- "What's Kansas?" should produce a rich summary without needing to specify what you want
- The transition from chat to report should be seamless — "make that a report" generates a PDF

</specifics>

<deferred>
## Deferred Ideas

- Voice/audio interface for Hamilton (speak to your consultant)
- Hamilton proactive alerts ("I noticed overdraft fees moved 5% this month")
- Multi-user Hamilton (different team members have their own conversation history)

</deferred>

---

*Phase: 17-hamilton-chat-unified-research-interface*
*Context gathered: 2026-04-06*

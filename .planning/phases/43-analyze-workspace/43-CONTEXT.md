# Phase 43: Analyze Workspace - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the Analyze workspace at `/pro/analyze` — Hamilton's deep analysis screen with focus tabs, streaming responses, saved analyses, explore further prompts, and screen boundary enforcement (no recommendations). Replaces the current `/pro/research` chat with a structured analysis experience.

</domain>

<decisions>
## Implementation Decisions

### Analysis & Streaming
- **D-01:** Hamilton responds via streaming markdown using existing Vercel AI SDK `streamText` — reuse `/api/research/hamilton` endpoint with `mode: "analyze"` parameter that adjusts the system prompt to analyze-only behavior.
- **D-02:** Analysis Focus tabs (Pricing, Risk, Peer Position, Trend) are client-side — tab switch updates the system prompt context injected into the chat. No page reload. Uses `ANALYSIS_FOCUS_TABS` from navigation.ts (Phase 38).
- **D-03:** Analyses saved via server action inserting into `hamilton_saved_analyses` table (Phase 39). Fields: title (auto-derived from prompt), analysis_focus, prompt, response_json. Left rail shows saved analyses on next page load.

### Explore Further & Screen Boundaries
- **D-04:** Hamilton generates 3-4 follow-up questions appended to each analysis response. Rendered as clickable pill buttons that pre-fill the chat input when clicked.
- **D-05:** "No recommendation" boundary enforced via: (1) system prompt instruction "do not recommend a position or pricing action, only analyze", (2) AnalyzeResponse type has no `recommendedPosition` field (ARCH-05 from Phase 38).
- **D-06:** CTA hierarchy at bottom of analysis: "Simulate a Change" (primary) > "Show Peer Distribution" > "View Risk Drivers" — per CONTEXT D-08 from Phase 38.

### Layout & Workspace
- **D-07:** Match Screen 2 prototype from `Hamilton-Design/2-ask_hamilton_deep_analysis_workspace/screen.png` — left rail workspace, main content area, analysis tabs at top.
- **D-08:** Chat input at bottom of main content area — editorial-styled floating input with send button. Similar to current research chat but within Hamilton shell.
- **D-09:** Hamilton's View card at top of analysis response — shows confidence level and high-level verdict before the detailed analysis.

### Claude's Discretion
- Whether to create a new API route or add mode param to existing hamilton chat route
- Exact explore further prompt generation approach (inline vs post-processing)
- How to handle streaming + saved analysis reconciliation (save after stream completes)

</decisions>

<canonical_refs>
## Canonical References

### Design Target
- `Hamilton-Design/2-ask_hamilton_deep_analysis_workspace/screen.png` — Visual target
- `Hamilton-Design/hamilton_revamp_package/03-screen-specs.md` — Screen 2 spec
- `Hamilton-Design/hamilton_revamp_package/06-api-and-agent-contracts.md` — AnalyzeResponse interface

### Existing Code
- `src/app/api/research/hamilton/route.ts` — Existing Hamilton streaming chat endpoint
- `src/lib/research/agents.ts` — getHamilton(role) agent builder
- `src/lib/hamilton/hamilton-agent.ts` — System prompt builder
- `src/lib/hamilton/types.ts` — AnalyzeResponse DTO (Phase 38)
- `src/lib/hamilton/navigation.ts` — ANALYSIS_FOCUS_TABS, CTA_HIERARCHY (Phase 38)
- `src/lib/hamilton/pro-tables.ts` — hamilton_saved_analyses table (Phase 39)
- `src/app/pro/(hamilton)/analyze/page.tsx` — Current stub to replace

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Vercel AI SDK `streamText` + `@ai-sdk/anthropic` for streaming responses
- `useChat` hook from `@ai-sdk/react` for client-side chat state
- Existing Hamilton system prompt with role-based prefixes
- `ANALYSIS_FOCUS_TABS` from navigation.ts

### Integration Points
- Replace stub at `src/app/pro/(hamilton)/analyze/page.tsx`
- New components in `src/components/hamilton/analyze/`
- Server action for saving analyses to hamilton_saved_analyses
- May modify `/api/research/hamilton/route.ts` to accept mode parameter

</code_context>

<specifics>
## Specific Ideas

- Analyze is for understanding, not deciding — the "no recommendation" rule is a core product differentiator
- Explore Further prompts keep users engaged and discovering deeper insights
- Saved analyses build the workspace memory that makes the left rail valuable over time

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 43-analyze-workspace*
*Context gathered: 2026-04-09*

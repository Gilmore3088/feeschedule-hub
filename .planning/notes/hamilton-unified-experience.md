# Hamilton Unified Experience

**Captured:** 2026-04-06
**Source:** /gsd-explore conversation

## Vision

Hamilton is one interface, not a collection of tools. The user talks to Hamilton and Hamilton figures out the rest. No picking between Scout, Research Hub, or Fee Analyst — you just ask.

## Two faces of Hamilton

### Chat (primary interface)
- Conversational — "What's Kansas look like?" "Compare these 3 banks."
- Hamilton orchestrates internally: DB queries, FeeScout pipeline, Fed data, whatever's needed
- Replaces: Research Hub, Scout, FeeScout as separate pages
- Can flow into reports: "That analysis looks good — generate the state report"

### Reports (structured output)
- Generate, preview, publish, cancel (already built)
- Template-driven: national quarterly, state index, monthly pulse, competitive briefs
- Triggered from chat or directly from Reports tab

## /admin/hamilton structure
- **Chat tab** — talk to Hamilton, ad hoc research
- **Reports tab** — structured report management (current page)
- **Methodology** — stays standalone (published document)

## What gets absorbed
- `/admin/research` (Research Hub) → Hamilton chat capability
- `/admin/scout` (FeeScout) → Hamilton chat capability  
- Fee Analyst agent → Hamilton internal routing
- URL Audit pipeline → Hamilton internal routing

## Key principle
The user never picks which agent. Hamilton routes internally. The plumbing is invisible.

## Current state
- Hamilton chat: NOT YET BUILT (Research Hub has a chat but it's a separate experience)
- Hamilton reports: BUILT (Phase 12-16)
- Agent consolidation: NOT YET DONE (agents exist but aren't unified under Hamilton's orchestration)

## Next steps
- Build the Hamilton chat interface at `/admin/hamilton` (Chat tab)
- Wire existing agent capabilities as Hamilton's internal tools
- Deprecate standalone Research Hub, Scout pages (redirect to Hamilton)

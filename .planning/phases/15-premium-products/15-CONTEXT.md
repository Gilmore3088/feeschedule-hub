# Phase 15: Premium Products - Context

**Gathered:** 2026-04-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the premium subscriber experience: on-demand competitive briefs with peer group confirmation, pro report library with RLS gating, and live polling UI for report generation status. This is the $2,500/mo product.

</domain>

<decisions>
## Implementation Decisions

### Competitive Briefs
- **D-01:** Hamilton-heavy analysis — 3-6 sections per brief, each calling Claude Sonnet. Cost ~$5-10 per brief. Uses the `peer-competitive` template from Phase 12.
- **D-02:** Peer group confirmation UI before generation — subscriber selects institution, then sees/confirms the peer group (by asset tier + charter + geography). Can adjust before triggering.
- **D-03:** Peer group must have n=5-200 institutions for stable medians. If too few, show warning but allow generation.
- **D-04:** Fee change event timeline ("who moved first") included where `fee_change_events` data exists. Graceful degradation if table is empty or missing.

### Pro Portal
- **D-05:** Authenticated report library at `/pro/reports` — browse, filter by type and date, download past reports via presigned URL.
- **D-06:** Access gated by Supabase RLS — `report_jobs` rows visible only to the user who generated them (or admin). Uses existing auth session.
- **D-07:** On-demand generation trigger with live polling — POST to generate route, poll status endpoint, show progress inline (pending → assembling → rendering → complete). No page refresh.

### UI Design
- **D-08:** Consumer brand palette (warm editorial from Phase 12) for the pro portal pages.
- **D-09:** Peer group selector: dropdown/search for institution, then display peer group as a table with confirm/adjust before generate button.
- **D-10:** Report library: table with columns (type, date, status, download). Filter chips for report type.

### Claude's Discretion
- All implementation details
- Polling UI component design (SSE vs interval polling)
- Peer group query logic
- RLS policy design

</decisions>

<canonical_refs>
## Canonical References

### Phase 12-14 Foundation
- `src/lib/hamilton/` — generateSection(), voice.ts
- `src/lib/report-templates/templates/peer-competitive.ts` — existing template
- `src/lib/report-engine/` — types, freshness, editor, presign
- `src/app/api/reports/` — generate, status, download routes

### Existing Pro UI
- `src/app/pro/` — existing pro pages
- `src/app/pro/brief/` — existing brief route
- `src/lib/auth.ts` — auth with roles (viewer, analyst, admin)

### Data Layer
- `src/lib/crawler-db/fee-index.ts` — getPeerIndex()
- `src/lib/crawler-db/market.ts` — buildMarketIndex()

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable
- `renderPeerCompetitiveReport()` template from Phase 12
- Report API routes from Phase 13 (generate/status/download)
- Auth system with role-based access
- FeeScout polling pattern (SSE) for live status updates

### Integration Points
- Pro portal pages → report API routes → Modal worker → R2
- RLS policies on report_jobs table
- Peer group query uses existing getPeerIndex() with filter params

</code_context>

<specifics>
## Specific Ideas

No specific requirements beyond roadmap.

</specifics>

<deferred>
## Deferred Ideas

- Stripe billing integration — deferred to v2.1
- Per-report pricing for competitive briefs — deferred to v2.1

</deferred>

---

*Phase: 15-premium-products*
*Context gathered: 2026-04-06*

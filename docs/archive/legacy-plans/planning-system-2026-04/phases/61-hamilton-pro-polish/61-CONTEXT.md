# Phase 61: Hamilton Pro Polish - Context

**Gathered:** 2026-04-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Strip all hardcoded demo data from 5 Pro screens (Home, Analyze, Simulate, Reports, Monitor), wire the Stripe billing portal via a ManageBillingButton in Pro Settings, and apply Tailwind v4 container queries to Analyze and Monitor screens for full 768px responsive coverage.

</domain>

<decisions>
## Implementation Decisions

### Demo Text Audit Strategy
- **D-01:** Strip all displayed demo data (hardcoded institution names, fake fee amounts, demo scenarios, lorem ipsum). Keep form input placeholders (e.g., `placeholder="e.g. First National Bank"`) -- those are UX hints, not fake content. The audit applies to text the user SEES as data, not form affordances.
- **D-02:** Real data first, empty state fallback. If a pipeline query can supply real data, wire it in. If not, show a designed empty state. No fake data survives.

### Empty State Designs
- **D-03:** Designed empty states with CTAs per screen. Icon + title + 1-sentence explanation + action button. Example: "No fee data yet -- configure your peer set in Settings to see comparisons" with a "Configure Peers" button. Not skeleton loaders.
- **D-04:** Explain why data is missing. Empty states should reference the data source or configuration step needed, making them educational. "Monitor will show alerts when you configure watchlist institutions." Users know what to do next.

### Stripe Billing Portal (Claude's Discretion)
- `createPortalSession()` already exists in `src/lib/stripe-actions.ts`
- Need to build `ManageBillingButton` component and place it in Pro Settings
- Error handling for users without a subscription (disabled button or different CTA)

### Responsive Treatment
- **D-05:** Use Tailwind v4 container queries (@container / @md: / @lg:). Components adapt to parent container, not viewport. Aligns with Phase 57 adaptive layouts precedent and handles nested panels better than viewport breakpoints.
- **D-06:** Full responsive pass on both Analyze and Monitor. Every panel, card, and table gets container query treatment. Matches phase success criteria scope.

### Claude's Discretion
- Specific empty state copy per screen (icon choice, exact wording, CTA text)
- Which pipeline queries to wire for real data replacement (Claude should check what data exists vs what each screen displays)
- ManageBillingButton placement and styling in Pro Settings
- Error handling for Stripe portal failures (toast? inline error?)
- Container query breakpoints (e.g., @md = 448px vs @lg = 512px)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Pro Screens (Audit Targets)
- `src/app/pro/(hamilton)/hamilton/page.tsx` -- Home/executive briefing
- `src/app/pro/(hamilton)/analyze/page.tsx` -- Analyze workspace
- `src/app/pro/(hamilton)/simulate/page.tsx` -- Simulation terminal
- `src/app/pro/(hamilton)/reports/page.tsx` -- Report builder
- `src/app/pro/(hamilton)/monitor/page.tsx` -- Monitor signal feed
- `src/app/pro/(hamilton)/settings/page.tsx` -- Settings (where billing button lives)

### Hamilton Components (Potential Demo Data Sources)
- `src/components/hamilton/home/` -- Home cards (HamiltonViewCard, PriorityAlertsCard, etc.)
- `src/components/hamilton/analyze/` -- Analyze panels (AnalyzeWorkspace, EvidencePanel, etc.)
- `src/components/hamilton/simulate/` -- Simulate components
- `src/components/hamilton/monitor/` -- Monitor feed (SignalFeed likely has demo signals)
- `src/components/hamilton/reports/` -- Report builder components

### Stripe Infrastructure
- `src/lib/stripe-actions.ts` -- `createPortalSession()` already implemented (line 36)
- `src/lib/auth.ts` -- User type includes `subscription_status` and `stripe_customer_id`

### Real Data Sources (For Replacement)
- `src/lib/crawler-db/` -- All database query functions
- `src/lib/hamilton/` -- Hamilton-specific utilities and data helpers
- Phase 58 institution financials (hero cards precedent)

### Design System
- Phase 57 container query pattern (proven working at 768px)
- Empty state design: Icon (lucide-react) + title + description + CTA button

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `createPortalSession()` in stripe-actions.ts -- already implemented
- Hamilton component tree is well-organized by screen folder
- Lucide React icons available for empty state iconography
- Phase 58 hero-cards.tsx shows the "graceful degradation when no data" pattern

### Established Patterns
- Pro screens use Hamilton-specific components under `src/components/hamilton/`
- Settings page imports user data via `getCurrentUser()` from auth.ts
- Tailwind v4 container queries: `@container` on parent, `@md:` / `@lg:` on children

### Integration Points
- ManageBillingButton needs to be placed in Pro Settings page
- Each Pro screen needs an audit pass + empty state wiring
- Analyze and Monitor need full responsive treatment (not just overflow fixes)

</code_context>

<specifics>
## Specific Ideas

- Empty states should feel designed, not apologetic. "No data yet" is weak. "Set up your first peer group to unlock benchmarking" is actionable.
- Container queries are specifically requested over viewport breakpoints -- Tailwind v4 supports them natively
- The audit should produce a diff showing every line of demo data removed (transparency for what changed)

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

*Phase: 61-hamilton-pro-polish*
*Context gathered: 2026-04-14*

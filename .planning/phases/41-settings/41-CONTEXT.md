# Phase 41: Settings - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the Settings page within the Hamilton shell — institution profile editing, peer set management, feature access toggles, billing display, and intelligence snapshot panel. This is the configuration source of truth that feeds institutional context to all other Hamilton screens.

</domain>

<decisions>
## Implementation Decisions

### Settings Page Design
- **D-01:** Use the Strategy Settings (editorial) design variant — warm parchment aesthetic with serif headers, matching the Hamilton shell premium feel. Visual target: `Hamilton-Design/setting-options/hamilton_strategy_settings_terminal/screen.png`
- **D-02:** Settings is accessed via user avatar dropdown in the top nav, NOT a top-level nav item. Route: `/pro/settings` but not in HAMILTON_NAV array.
- **D-03:** Settings page updates the existing users table directly via server actions — institution_name, institution_type, asset_tier, state_code, fed_district already exist as columns. No new table needed for user profile.
- **D-04:** Peer set management reuses the existing `saved_peer_sets` system from `src/lib/crawler-db/peers.ts`. Pro users share the same peer set infrastructure as admin.

### Billing Integration
- **D-05:** Read-only Stripe display — show plan name (Professional), renewal date, and "Manage Billing" link to Stripe Customer Portal. No inline payment forms or plan switching in v8.0.
- **D-06:** Admin users see an "Admin Access" badge instead of billing section. No billing UI for admins since they don't pay.

### Intelligence Snapshot
- **D-07:** Snapshot panel shows: account tier, saved analyses count, saved scenarios count, last activity date. Data from hamilton_pro tables (Phase 39).
- **D-08:** No API usage or cost display for users in v8.0. Cost tracking remains internal.

### Settings Page Sections (from Strategy Settings design)
- **D-09:** Page sections in order: Account Overview (name, email, role, plan, join date), Intelligence Snapshot (right panel), Institution Profile (name, cert number, asset size, Fed district, market region), Usage & Limits, Feature Access toggles, Proxy Access, Billing, Quick Actions (Continue Working).

### Claude's Discretion
- Exact form field layout and validation approach
- Whether to use optimistic updates or wait for server confirmation
- Feature access toggle behavior (which features are toggleable vs always-on)

</decisions>

<canonical_refs>
## Canonical References

### Design Targets
- `Hamilton-Design/setting-options/hamilton_strategy_settings_terminal/screen.png` — Visual target for Settings page
- `Hamilton-Design/hamilton_sovereign/DESIGN.md` — Editorial design system (ignore "Sovereign" naming)

### Existing Code
- `src/lib/auth.ts` — User type with institution_name, institution_type, asset_tier, state_code columns
- `src/lib/crawler-db/peers.ts` — Existing saved_peer_sets queries (savePeerSet, getSavedPeerSets, deletePeerSet)
- `src/app/pro/(hamilton)/layout.tsx` — Hamilton shell layout (Phase 40)
- `src/components/hamilton/layout/` — Shell components (Phase 40)
- `src/lib/hamilton/pro-tables.ts` — Hamilton Pro tables for snapshot queries (Phase 39)

### Prior Phase Context
- `.planning/phases/38-architecture-foundation/38-CONTEXT.md` — CSS isolation, branding decisions
- `.planning/phases/40-hamilton-shell/40-CONTEXT.md` — Route structure, auth gating

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `getCurrentUser()` from auth.ts — already returns all profile fields
- Peer set CRUD functions in `src/lib/crawler-db/peers.ts`
- Server action pattern from existing admin review actions
- `.hamilton-shell` CSS tokens (Phase 38)

### Established Patterns
- Server actions for form mutations (existing pattern across admin)
- `sql` template literal for DB queries (no ORM)
- Form validation with Zod schemas

### Integration Points
- Settings page at `src/app/pro/(hamilton)/settings/page.tsx` (new, inside Hamilton route group but not in HAMILTON_NAV)
- User avatar dropdown in HamiltonTopNav links to settings
- Profile updates flow back to HamiltonContextBar on next page load

</code_context>

<specifics>
## Specific Ideas

- Strategy Settings design matches premium editorial aesthetic
- Institution profile is the source of truth for HamiltonContextBar across all screens
- Intelligence Snapshot gives users a quick overview of their workspace activity

</specifics>

<deferred>
## Deferred Ideas

- A/B testing between Strategy Settings and System Settings variants — post-launch
- API usage/cost display for users — future feature
- Inline plan switching (upgrade/downgrade within settings) — future

</deferred>

---

*Phase: 41-settings*
*Context gathered: 2026-04-09*

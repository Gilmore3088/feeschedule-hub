# Phase 28: Audience Shell Separation - Context

**Gathered:** 2026-04-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Split the shared CustomerNav into distinct ConsumerNav and ProNav components with separate visual identities, centralize the pro auth guard in pro/layout.tsx, and create a personalization service that derives user context from account profile fields.

Requirements: SHELL-01, SHELL-02, SHELL-03

</domain>

<decisions>
## Implementation Decisions

### Nav Identity Split (SHELL-01)
- **D-01:** Consumer and pro navs are completely distinct components with different visual designs -- not the same layout with different links.
- **D-02:** ConsumerNav: editorial-style, lighter weight, spacious, warm palette (terracotta accents, Newsreader serif touches, `#FAF7F2` background). Matches the consumer-brand CSS class system in globals.css. Prominent "Get Pro Access" CTA.
- **D-03:** ProNav: workspace-style, denser, tool-like feel. Shows institution name and usage indicators. Cool professional palette (Geist Sans, gray tones). Should feel like a data platform, not a content site. Shows "Welcome, [Institution Name]" in user menu.
- **D-04:** Rename existing `CustomerNav` to `ConsumerNav` for `(public)` and `consumer` layouts. Create new `ProNav` for `pro` layout. No conditional branching -- each layout imports its own nav component directly.

### Auth Guard Strategy (SHELL-02)
- **D-05:** Auth guard centralized in `pro/layout.tsx`. Every `/pro/*` route automatically protected. Remove duplicated `getCurrentUser()` + `canAccessPremium()` + `redirect()` from individual pro pages.
- **D-06:** Invalid or expired sessions redirect to `/login?from={current_path}` with return URL so users land back where they were after login. Non-subscribers redirected to `/subscribe`.

### Personalization Scope (SHELL-03)
- **D-07:** Claude's discretion on balance between static profile mapping and lightweight DB queries. Minimum: institution_name, asset_tier, state_code, fed_district (derived via STATE_TO_DISTRICT), district_label, peer_group_label. Optional: live peer median if performance allows.
- **D-08:** `derivePersonalizationContext(user)` lives in `src/lib/personalization.ts`. Core function is pure (no DB call) using existing user profile fields. District derived from state_code via `getDistrictForState()` in fed-districts.ts.
- **D-09:** `peerGroupLabel` computed from `institution_type` + `asset_tier` (e.g., "Community Banks (<$1B)").

### Pro Nav Items
- **D-10:** Simplified hybrid navigation -- trim from current 8 items to 5-6 focused entries. Consolidate related items (e.g., Categories and Districts fold into broader data sections). Exact items are Claude's discretion but should align with the four-door launchpad model (Hamilton, Peer Builder, Reports, Federal Data) while remaining navigable.

### Architecture
- **D-11:** Server components for layouts. ConsumerNav and ProNav are client components (need `usePathname()` for active state). Matches existing AdminNav pattern.
- **D-12:** No changes to admin layout -- it already has its own shell.
- **D-13:** CustomerFooter stays shared across consumer and pro.
- **D-14:** MobileNav updated to match the new split (consumer and pro variants).

### Claude's Discretion
- Personalization service: whether to include live DB data or keep it pure profile-field mapping
- Exact pro nav item labels and grouping (5-6 items consolidating from current 8)
- MobileNav component update approach
- Whether ConsumerNav uses any auth state (for "Sign In" / avatar display)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Navigation Components
- `src/components/customer-nav.tsx` -- Current shared nav with isPro branching (to be split)
- `src/components/mobile-nav.tsx` -- Mobile nav with hardcoded PUBLIC_NAV and PRO_NAV arrays

### Auth & Access
- `src/lib/auth.ts` -- User type definition (lines 44-58), getCurrentUser(), session management
- `src/lib/access.ts` -- canAccessPremium(), feature gating functions, query limits

### Layouts
- `src/app/pro/layout.tsx` -- Pro layout (will get auth guard)
- `src/app/consumer/layout.tsx` -- Consumer layout
- `src/app/(public)/layout.tsx` -- Public route group layout
- `src/app/admin/layout.tsx` -- Admin layout pattern to follow (has auth guard)
- `src/app/admin/admin-nav.tsx` -- Client nav component pattern to follow

### Personalization Foundations
- `src/app/pro/dashboard.tsx` -- Existing partial personalization (state comparison, district derivation)
- `src/lib/fed-districts.ts` -- District lookup from state code (STATE_TO_DISTRICT, getDistrictForState)

### Design System
- `src/app/globals.css` -- Consumer-brand CSS overrides (lines 427-582), shadow system
- `src/components/customer-footer.tsx` -- Shared footer (keep as-is)

### Research
- `.planning/research/ARCHITECTURE.md` -- Route structure analysis, nav split recommendations
- `.planning/research/PITFALLS.md` -- Component duplication warnings, dark mode scope

</canonical_refs>

<code_context>
## Existing Code Insights

### Key Insight
User model already has everything needed for personalization: `institution_name`, `institution_type`, `asset_tier`, `state_code`, `subscription_status`. No schema changes needed.

### Reusable Assets
- `AdminNav` pattern -- client component with `usePathname()` for active state
- `getCurrentUser()` -- async session check, returns User | null
- `getDistrictForState()` in `fed-districts.ts` -- state code to district mapping
- `CustomerFooter` -- keep shared across consumer and pro
- `MobileNav` -- already has separate PUBLIC_NAV and PRO_NAV arrays conceptually

### Established Patterns
- Server Components for layouts (no "use client" in layout files)
- `getCurrentUser()` returns User | null with try-catch for unauthenticated state
- `canAccessPremium(user)` checks admin/analyst roles OR active subscription
- Consumer pages use `.consumer-brand` wrapper class for warm palette

### Integration Points
- `pro/layout.tsx` -- swap CustomerNav for ProNav, add auth guard
- `consumer/layout.tsx` and `(public)/layout.tsx` -- swap CustomerNav for ConsumerNav
- All `/pro/*` pages -- remove individual auth checks (layout handles it)
- `SearchModal` -- standardize inclusion across layouts

</code_context>

<specifics>
## Specific Ideas

- Pro nav should feel like a "workspace" -- institution name visible, suggesting this is their personalized environment
- Consumer nav should feel like an "editorial resource" -- clean, welcoming, educational
- The nav split is the visual signal that these are two different products sharing a data engine
- The separation is the foundation for Phases 29-32 -- each audience gets its own experience

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

*Phase: 28-audience-shell-separation*
*Context gathered: 2026-04-07*

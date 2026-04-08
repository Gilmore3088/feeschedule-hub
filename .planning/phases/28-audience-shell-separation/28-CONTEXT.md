# Phase 28: Audience Shell Separation - Context

**Gathered:** 2026-04-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Split consumer and pro into independent layout shells with distinct nav components, centralized auth guard in pro layout, and a personalization service that derives context from the user profile.

Requirements: SHELL-01, SHELL-02, SHELL-03

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion (all areas)

### Nav Differentiation (SHELL-01)
- **D-01:** `ConsumerNav` -- clean, public-facing nav. Logo, fee search, research links, "Sign In" / "Get Started" CTAs. No user menu. Matches the public marketing experience.
- **D-02:** `ProNav` -- subscriber nav. Logo, dashboard, peer benchmarking, research, reports links. User menu with account/logout. Shows institution name from personalization context. Distinct from consumer via subtle premium branding (e.g., "Pro" badge or different accent).
- **D-03:** Rename existing `CustomerNav` to `ConsumerNav` for `(public)` layout. Create new `ProNav` for `pro` layout. No conditional branching -- each layout imports its own nav component directly.

### Auth & Access (SHELL-02)
- **D-04:** Auth guard lives ONLY in `pro/layout.tsx`. Calls `getCurrentUser()`, checks `subscription_status === 'active'`. If no session or not active, redirect to login with return URL. Individual pro pages never check auth -- the layout handles it.
- **D-05:** Non-subscribers who hit `/pro/*` get redirected to `/login?returnTo=/pro/...`. After login, if they have an active subscription, they land on the intended page. If not, redirect to `/subscribe`.

### Personalization Service (SHELL-03)
- **D-06:** `derivePersonalizationContext(user: User)` is a pure function (no DB call). Takes the User object from `getCurrentUser()` and returns `{ institutionName, fedDistrictLabel, assetTier, peerGroupLabel }` derived from existing user profile fields (`institution_name`, `state_code` -> district lookup, `asset_tier`, `institution_type`).
- **D-07:** Lives in `src/lib/personalization.ts`. Imported by `ProNav` and pro pages that need institution context.
- **D-08:** `fedDistrictLabel` derived from `state_code` using existing `getDistrictForState()` in `fed-districts.ts`. `peerGroupLabel` computed from `institution_type` + `asset_tier` (e.g., "Community Banks (<$1B)").

### Architecture
- **D-09:** Server components for layouts. `ConsumerNav` and `ProNav` are client components (need `usePathname()` for active state). Matches existing `AdminNav` pattern.
- **D-10:** No changes to admin layout -- it already has its own shell.

</decisions>

<canonical_refs>
## Canonical References

- `src/app/(public)/layout.tsx` -- Current public layout (uses CustomerNav)
- `src/app/pro/layout.tsx` -- Current pro layout (uses CustomerNav, no auth guard)
- `src/app/admin/layout.tsx` -- Admin layout pattern to follow (has auth guard)
- `src/app/admin/admin-nav.tsx` -- Client nav component pattern to follow
- `src/components/customer-nav.tsx` -- Current shared nav (rename to ConsumerNav)
- `src/components/customer-footer.tsx` -- Shared footer (keep as-is)
- `src/lib/auth.ts` -- `getCurrentUser()`, User type with institution_name, asset_tier, state_code, subscription_status
- `src/lib/fed-districts.ts` -- District lookup from state code
- `.planning/REQUIREMENTS.md` -- SHELL-01, SHELL-02, SHELL-03

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

### Integration Points
- `(public)/layout.tsx` -- swap CustomerNav for ConsumerNav
- `pro/layout.tsx` -- swap CustomerNav for ProNav, add auth guard
- All `/pro/*` pages lose their individual auth checks (if any)

</code_context>

<specifics>
## Specific Ideas

- ProNav shows "Welcome, [Institution Name]" or "Welcome, [Display Name]" in the user menu
- ConsumerNav has a prominent "Start Free Trial" or "Get Pro Access" CTA
- The separation is the foundation for Phases 29-32 -- each audience gets its own experience

</specifics>

<deferred>
## Deferred Ideas

None

</deferred>

---

*Phase: 28-audience-shell-separation*
*Context gathered: 2026-04-08*

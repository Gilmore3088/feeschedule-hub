---
phase: 28-audience-shell-separation
plan: 01
subsystem: audience-shell
tags:
  - consumer-nav
  - personalization-service
  - tdd
  - shell-separation
dependency_graph:
  requires:
    - auth
    - fed-districts
  provides:
    - ConsumerNav
    - derivePersonalizationContext
  affects:
    - "(public) layout"
    - Plan 02 (ProNav)
tech_stack:
  added:
    - Personalization context derivation service
  patterns:
    - Pure function for context derivation
    - Server component nav with mobile drawer
    - No conditional branching between consumer/pro
key_files:
  created:
    - src/lib/personalization.ts
    - src/lib/personalization.test.ts
    - src/components/consumer-nav.tsx
    - src/components/consumer-mobile-nav.tsx
  modified:
    - src/app/(public)/layout.tsx
decisions:
  - Personalization context is pure (no DB calls, synchronous)
  - ConsumerNav is a dedicated server component with no pro branching
  - Mobile nav is a client component with useState for drawer state
metrics:
  duration_minutes: 3
  tasks_completed: 2
  tasks_total: 2
  files_created: 4
  files_modified: 1
  test_coverage: 9 test cases (all passing)
---

# Phase 28 Plan 01: Consumer Navigation & Personalization Service

**One-liner:** Consumer-side shell with dedicated nav component and pure personalization context derivation for institution, district, tier, and peer group data.

## Objective

Create the ConsumerNav component and personalization service that form the foundation for audience-specific experiences. The personalization service derives context from User profile fields without DB calls, while ConsumerNav provides a clean public-facing navigation stripped of all pro/admin features.

## Completion Summary

All tasks completed successfully. Personalization service passes all 9 test cases covering full profiles, null fields, and edge cases. ConsumerNav is wired into (public) layout with dedicated mobile nav. No changes to existing customer-nav.tsx (reserved for pro layout Plan 02).

## Tasks Completed

### Task 1: Create personalization service with tests (TDD)

**Status:** COMPLETE

Created `src/lib/personalization.ts` with:
- `PersonalizationContext` interface: institutionName, fedDistrictLabel, assetTier, peerGroupLabel
- `derivePersonalizationContext(user: User)`: Pure function deriving all four fields from User profile
  - institutionName: Pass-through from user.institution_name
  - fedDistrictLabel: STATE_TO_DISTRICT lookup → DISTRICT_NAMES mapping
  - assetTier: FDIC_TIER_LABELS lookup
  - peerGroupLabel: Combines institution_type + asset_tier range (e.g., "Community Banks ($100M-$1B)")
  
**Tests (9 cases, all passing):**
- Full profile with all fields present
- Null state_code handling
- Null asset_tier handling
- Null institution_type handling
- Credit union type label ("Credit Unions" vs "Banks")
- Unknown state code handling
- Pure function determinism
- All FDIC tier labels
- All Fed district mappings

**Test file:** src/lib/personalization.test.ts (177 lines)
**Implementation:** src/lib/personalization.ts (68 lines)
**Commit:** `test(28-audience-shell-separation): add personalization service tests`

### Task 2: Create ConsumerNav and wire into public layout

**Status:** COMPLETE

Created three files:

1. **src/components/consumer-nav.tsx** (async server component)
   - Public-only navigation items: Find Your Institution, Fee Benchmarks, Research, Guides, Pricing (when not logged in)
   - Right side: SearchTrigger + Sign In link (logged out) or Account link with avatar (logged in)
   - "Get Pro Access" CTA button with brand red (#C44B2E) styling
   - No pro-related logic, no isPro branching
   - Uses getCurrentUser() for auth state
   - Mobile: renders ConsumerMobileNav

2. **src/components/consumer-mobile-nav.tsx** (client component with "use client")
   - Client-side drawer for mobile navigation
   - Uses useState for open/close, usePathname for active state
   - Same nav items and footer as desktop
   - Includes Sign In / Get Pro Access buttons in footer
   - No conditional pro/consumer branching

3. **src/app/(public)/layout.tsx** (modified)
   - Changed import from CustomerNav to ConsumerNav
   - Maintains CustomerFooter and SearchModal unchanged

**Acceptance Criteria Met:**
- ✓ ConsumerNav renders public nav items only (no pro links, no isPro branching)
- ✓ ConsumerMobileNav is dedicated client component with consumer-only links
- ✓ (public)/layout.tsx imports ConsumerNav (not CustomerNav)
- ✓ TypeScript compiles without errors
- ✓ customer-nav.tsx and mobile-nav.tsx still exist unchanged

**Commit:** `feat(28-audience-shell-separation): create ConsumerNav and wire into public layout`

## Verification

**All criteria met:**
- All 9 personalization tests pass
- TypeScript compilation: zero errors
- Build succeeded
- Consumer visitors on (public) routes see ConsumerNav with public links and Sign In / Get Pro Access CTAs
- No conditional branching between consumer and pro in nav components
- Existing customer-nav.tsx preserved for Plan 02 (ProNav)

## Deviations from Plan

None. Plan executed exactly as specified.

## Known Stubs

None. All values flow through to final output.

## Threat Flags

No new threat surface introduced:
- T-28-01: Information disclosure → accept (pure function on already-authenticated User data)
- T-28-02: Spoofing → accept (same auth pattern as existing CustomerNav)

## Next Phase

Plan 02: ProNav and auth guard for /pro layout. Consumes derivePersonalizationContext from this plan.

---

**Completed:** 2026-04-07 at 23:36 UTC
**Duration:** ~3 minutes
**Executor:** Claude Haiku 4.5

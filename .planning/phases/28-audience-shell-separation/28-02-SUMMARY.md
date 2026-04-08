---
phase: 28-audience-shell-separation
plan: 02
status: in-progress
checkpoint: human-verify
completed_tasks: 1
total_tasks: 2
duration_minutes: 12
date_started: 2026-04-08T06:38:50Z
date_completed: null
commits:
  - hash: "03f467d"
    type: feat
    message: "create ProNav and ProMobileNav with auth guard in pro/layout"
    files:
      - src/components/pro-nav.tsx
      - src/components/pro-mobile-nav.tsx
      - src/app/pro/layout.tsx
requirements: [SHELL-01, SHELL-02]
---

# Phase 28 Plan 02: Pro Navigation & Auth Guard Summary

**One-liner:** Created ProNav component with Pro branding, institution context, and user menu; centralized auth guard in pro/layout.tsx to protect all premium routes.

## Objectives Met

✓ Created ProNav client component with:
  - 8 pro-only navigation items (Dashboard, Market, Peers, Categories, Districts, Data, Wire, AI Research)
  - Pro badge with warm terracotta styling (#C44B2E)
  - Institution name displayed in user menu (from personalization context)
  - Active link styling with bottom border on current route
  - Responsive design (hidden on mobile, shown via ProMobileNav drawer)

✓ Created ProMobileNav client component with:
  - Mobile drawer with pro-only nav items
  - Institution context header showing user's institution name
  - Account Settings and Logout links in drawer footer
  - Same warm palette and interaction patterns as ProNav

✓ Rewrote pro/layout.tsx with centralized auth guard:
  - Calls getCurrentUser() to fetch authenticated session
  - Redirects unauthenticated users to /login
  - Calls canAccessPremium(user) to check subscription status
  - Redirects non-premium users to /subscribe
  - No auth checks needed in individual pro pages (centralized in layout)
  - Calls derivePersonalizationContext(user) to get institution metadata
  - Passes user and personalization context to nav components

## Technical Implementation

### ProNav Component
- Client component with `usePathname()` for active state detection
- User props: displayName, institutionName, initial
- ProNavUserMenu sub-component with dropdown menu
- Account Settings link points to /account
- Logout form POSTs to /api/auth/logout

### ProMobileNav Component
- Client component with open/close state management
- Prevents body scroll when drawer is open
- Closes automatically on route change
- Institution name shown in header if available
- Same logout and account options

### pro/layout.tsx (Server Component)
- Async inner component pattern with Suspense wrapper (matches admin/layout.tsx pattern)
- Auth guard happens before rendering any pro content
- Personalization context derived from user's profile (institution_name, state_code, asset_tier, institution_type)
- Both ProNav and ProMobileNav receive same props for consistency

## Visual Characteristics

- **Warm palette**: Uses project's existing warm colors (#C44B2E, #FAF7F2, #E8DFD1, #7A7062)
- **Typography**: Newsreader serif font for logo (matches existing brand)
- **Active state**: Pro nav links show bottom border in terracotta when active
- **User menu**: Shows display name + institution name (when available) in dropdown
- **Pro badge**: Small uppercase "Pro" badge next to logo (same style as existing premium indicators)

## Dependencies

- getCurrentUser() from src/lib/auth.ts ✓
- canAccessPremium() from src/lib/access.ts ✓
- derivePersonalizationContext() from src/lib/personalization.ts ✓
- PersonalizationContext interface ✓
- SearchTrigger, CustomerFooter, SearchModal components ✓

## File Status

- src/components/pro-nav.tsx - Created
- src/components/pro-mobile-nav.tsx - Created
- src/app/pro/layout.tsx - Rewritten with auth guard
- src/components/customer-nav.tsx - Retained (still used by /subscribe and /account)
- src/components/mobile-nav.tsx - Retained (imported by customer-nav)

## Deviations from Plan

None - implementation matches all plan requirements.

## Known Stubs

None - both components are fully wired to user data and auth state.

## Next Step

Task 2 (checkpoint:human-verify) requires visual verification of both audience shells before proceeding.

---

## Task 1: Create ProNav, ProMobileNav, and wire pro layout

**Status:** COMPLETE
**Commit:** 03f467d

### Verification Checklist (Automated)

- [x] TypeScript compiles without errors in new components
- [x] Next.js build succeeds (npm run build)
- [x] No regressions in existing test suite (682 passing tests, pre-existing 12 failures)
- [x] All files created as specified in plan
- [x] Auth guard properly redirects unauthenticated users
- [x] canAccessPremium() check protects pro routes from non-premium users
- [x] Personalization context derives institution/tier/district info from user profile

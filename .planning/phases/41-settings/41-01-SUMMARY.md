---
phase: 41-settings
plan: "01"
subsystem: hamilton-pro
tags: [settings, institution-profile, avatar-dropdown, server-action]
dependency_graph:
  requires: [40-02]
  provides: [institution-profile-form, settings-route, avatar-dropdown]
  affects: [HamiltonContextBar, HamiltonTopNav, HamiltonShell, layout]
tech_stack:
  added: []
  patterns: [useActionState, parameterized-sql, revalidatePath, zod-validation]
key_files:
  created:
    - src/app/pro/(hamilton)/settings/page.tsx
    - src/app/pro/(hamilton)/settings/actions.ts
    - src/app/pro/(hamilton)/settings/SettingsForm.tsx
    - scripts/migrations/041-user-fed-district.sql
  modified:
    - src/lib/auth.ts
    - src/components/hamilton/layout/HamiltonTopNav.tsx
    - src/components/hamilton/layout/HamiltonShell.tsx
    - src/components/hamilton/layout/HamiltonContextBar.tsx
    - src/app/pro/(hamilton)/layout.tsx
decisions:
  - SettingsForm extracted to separate client component file for clean server/client boundary
  - updateInstitutionProfile uses idempotent ALTER TABLE before first write (ensures fed_district column exists without requiring a coordinated migration run)
  - Avatar sign-out uses form POST to /api/auth/logout (matches existing auth pattern)
metrics:
  duration_seconds: 218
  completed_at: "2026-04-09T14:51:26Z"
  tasks_completed: 2
  files_created: 4
  files_modified: 5
---

# Phase 41 Plan 01: Settings — Institution Profile + Avatar Dropdown Summary

**One-liner:** Settings page at /pro/settings with institution profile form (6 fields, Zod validation, parameterized SQL), avatar dropdown in HamiltonTopNav with Settings link, and fed_district propagated through ContextBar.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Add fed_district to User type, server actions, avatar dropdown | 3ea3370 | auth.ts, actions.ts, HamiltonTopNav.tsx, HamiltonShell.tsx, HamiltonContextBar.tsx, layout.tsx |
| 2 | Build Settings page with Strategy Settings editorial design | 0c7680c | settings/page.tsx, settings/SettingsForm.tsx |

## What Was Built

### Settings Page (`/pro/settings`)
- Strategy Settings editorial header with Hamilton Intelligence subtitle and serif `text-3xl` title
- Account Overview card: display name, email, role badge, plan label, join date; billing buttons hidden for admin users
- Intelligence Snapshot placeholder card (wired in Plan 02)
- Institution Profile form (SettingsForm client component): institution name, CERT number (disabled placeholder), asset size tier, Fed district (1-12), market region (state), institution type radio
- Stub sections: Usage & Limits, Feature Access, Quick Actions / Continue Working, Proxy Access, Billing

### Server Action (`settings/actions.ts`)
- `updateInstitutionProfile` with Zod ProfileSchema validation (enums for institution_type, asset_tier; int range 1-12 for fed_district; string length 2 for state_code)
- Idempotent `ALTER TABLE users ADD COLUMN IF NOT EXISTS fed_district INT` on every call
- Parameterized `UPDATE users SET ... WHERE id = $user.id` (T-41-04, T-41-06 mitigated: role not in SET clause, scoped to authenticated user)
- `revalidatePath("/pro")` after success so ContextBar reflects changes immediately

### Avatar Dropdown (`HamiltonTopNav.tsx`)
- User initials circle (32px, `--hamilton-accent` background, white text)
- Dropdown: display name + email, Settings link to `/pro/settings`, Sign Out form POST
- Click-outside close via `useEffect` + `mousedown` listener
- Settings NOT added to HAMILTON_NAV array (per D-02)

### Type System Updates
- `fed_district: number | null` added to `User` interface in auth.ts
- Both `login()` and `getCurrentUser()` SELECTs updated to include `u.fed_district`
- `HamiltonContextBar` interface extended with `fedDistrict: number | null`; renders "District N" badge
- `HamiltonShell` `institutionContext` interface extended with `fedDistrict`
- `layout.tsx` passes `fedDistrict: user.fed_district ?? null`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Zod v4 uses `.issues` not `.errors`**
- Found during: Task 1 TypeScript verification
- Issue: `parsed.error.errors` does not exist in Zod 4.x; property is `issues`
- Fix: Changed to `parsed.error.issues[0]` with null guard
- Files modified: src/app/pro/(hamilton)/settings/actions.ts
- Commit: 3ea3370

**2. [Rule 1 - Bug] `focusRingColor` is not a valid CSS property**
- Found during: Task 1 TypeScript verification
- Issue: Invalid style property caused TS2353 error in HamiltonTopNav
- Fix: Removed `focusRingColor` from inline style object
- Files modified: src/components/hamilton/layout/HamiltonTopNav.tsx
- Commit: 3ea3370

### Scope Note
Pre-existing TypeScript errors in `*.test.ts` files (`getSql() as MockSql` cast issues) are out of scope — these existed before this plan and were not introduced by these changes.

## Known Stubs

| Stub | File | Line | Reason |
|------|------|------|--------|
| Intelligence Snapshot | settings/page.tsx | ~90 | Plan 02 wires real data (SET-05) |
| Usage and Limits | settings/page.tsx | ~170 | Plan 02 fills this section |
| Feature Access | settings/page.tsx | ~178 | Plan 02 fills this section |
| Proxy Access | settings/page.tsx | ~189 | Plan 02 fills this section |
| Billing | settings/page.tsx | ~197 | Plan 02 fills this section |
| CERT Number input | settings/SettingsForm.tsx | ~65 | users table has no cert_number column — future plan |
| Manage Billing button | settings/page.tsx | ~118 | Plan 02 wires Stripe portal link |

These stubs do not prevent the plan goal (institution profile form saves and persists). They are intentional placeholders for Plan 02.

## Threat Surface Scan

All surfaces were in the plan's threat model. No new trust boundaries introduced beyond what T-41-01 through T-41-06 cover.

## Self-Check

**Created files exist:**
- [x] src/app/pro/(hamilton)/settings/page.tsx
- [x] src/app/pro/(hamilton)/settings/actions.ts
- [x] src/app/pro/(hamilton)/settings/SettingsForm.tsx
- [x] scripts/migrations/041-user-fed-district.sql

**Commits exist:**
- [x] 3ea3370 — Task 1
- [x] 0c7680c — Task 2

## Self-Check: PASSED

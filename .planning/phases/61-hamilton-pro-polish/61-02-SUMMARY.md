---
phase: 61-hamilton-pro-polish
plan: "02"
subsystem: pro-billing
tags: [stripe, billing-portal, client-component, settings]
dependency_graph:
  requires: [stripe-actions.ts, auth.ts]
  provides: [ManageBillingButton, wired-billing-portal]
  affects: [pro/settings page]
tech_stack:
  added: []
  patterns: [useTransition-server-action, subscription-status-aware-ui]
key_files:
  created:
    - src/components/hamilton/settings/ManageBillingButton.tsx
  modified:
    - src/lib/stripe-actions.ts
    - src/app/pro/(hamilton)/settings/page.tsx
decisions:
  - "Subscribe-to-Pro link shown as <a href=/subscribe> styled as disabled button for users without Stripe account"
  - "ManageBillingButton wraps its error <p> in a div container so error message appears below button without disrupting layout"
  - "className prop passed through to button element; internal styles applied via style prop so callers can add layout classes"
metrics:
  duration: "8 minutes"
  completed: "2026-04-15"
  tasks_completed: 2
  tasks_total: 2
  files_created: 1
  files_modified: 2
---

# Phase 61 Plan 02: ManageBillingButton Wiring Summary

Wire the Stripe billing portal in Pro Settings via a subscription-status-aware ManageBillingButton client component, replacing both inert buttons and updating the portal return URL to /pro/settings.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create ManageBillingButton + update return URL | 90cade8 | ManageBillingButton.tsx, stripe-actions.ts |
| 2 | Replace inert buttons in settings/page.tsx | 8e0af06 | settings/page.tsx |

## What Was Built

**ManageBillingButton** (`src/components/hamilton/settings/ManageBillingButton.tsx`):
- `"use client"` component accepting `hasStripeAccount`, `subscriptionStatus`, `className`, `style` props
- 4 rendering states:
  - `active` — "Manage Billing" button, white/bordered, calls `createPortalSession()`
  - `past_due` — "Update Payment" with amber left-border accent (`var(--hamilton-warning, #f59e0b)`), amber background tint
  - `canceled` — "Reactivate" with hamilton primary gradient CTA styling
  - `none` / no Stripe account — `<a href="/subscribe">` styled as disabled, no server action invoked
- `useTransition` disables button during pending Stripe redirect (prevents duplicate calls — T-61-05 mitigation)
- Inline error `<p>` in `var(--hamilton-error, #ba1a1a)` color on failure; clears on next click attempt
- Loading label changes to "Opening..." during transition

**stripe-actions.ts** — `return_url` updated from `${origin}/account` to `${origin}/pro/settings`.

**settings/page.tsx** — Both inert `<button type="button">Manage Billing</button>` elements replaced with `<ManageBillingButton hasStripeAccount={!!user.stripe_customer_id} subscriptionStatus={user.subscription_status ?? "none"} />`. Props derived server-side; no `stripe_customer_id` string exposed to client (T-61-03 mitigation).

## Deviations from Plan

None — plan executed exactly as written.

## Security Notes

- T-61-03 (Spoofing): `createPortalSession()` calls `getCurrentUser()` server-side. Button only receives `hasStripeAccount: boolean` and `subscriptionStatus: string` — the actual Stripe customer ID never reaches the client.
- T-61-04 (EoP): Accepted — server action validates session internally.
- T-61-05 (DoS): `useTransition` disables button during pending state, preventing rapid-fire portal creation calls.

## Known Stubs

None — all button states are wired to real data from `user.stripe_customer_id` and `user.subscription_status`.

## Self-Check: PASSED

- `src/components/hamilton/settings/ManageBillingButton.tsx` — EXISTS
- `90cade8` — FOUND in git log
- `8e0af06` — FOUND in git log
- `grep -q "/pro/settings" src/lib/stripe-actions.ts` — PASSES
- `grep -c "ManageBillingButton" settings/page.tsx` returns 3 (import + 2 usages) — PASSES
- No remaining `<button type="button">Manage Billing</button>` in settings/page.tsx — CONFIRMED
- `npx vitest run` — 387 passed, 1 skipped, 0 failed

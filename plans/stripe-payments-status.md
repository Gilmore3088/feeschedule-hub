# Stripe Payments Implementation Status

**Date:** 2026-03-15
**Branch:** `feat/stripe-payments`
**Plan:** `plans/feat-stripe-payments-account-management.md`

---

## What's Done

### Prerequisite Fixes
- [x] Consolidated `getWriteDb()` -- removed duplicate from `auth.ts` and `fee-actions.ts`, both now import from `connection.ts`
- [x] `getCurrentUser()` now uses `getDb()` singleton instead of opening a new connection per call
- [x] Added `foreign_keys=ON` to read singleton in `connection.ts`
- [x] Removed `db.close()` on singleton in `searchInstitutions()` (`submit-fees/actions.ts`)
- [x] Session cookie `secure` flag now conditional: `process.env.NODE_ENV === "production"`

### Schema
- [x] Migration SQL: `src/lib/crawler-db/migrations/001-payments.sql`
- [x] Migration runner: `src/lib/crawler-db/migrate.ts`
- [x] Migration applied to local DB -- 3 new columns on `users` (email, stripe_customer_id, subscription_status)
- [x] `stripe_events` table created for webhook idempotency
- [x] `STUB_TABLES` in `connection.ts` updated for CI builds

### Auth Upgrades
- [x] `User` interface extended with `email`, `stripe_customer_id`, `subscription_status`
- [x] Login query updated to support email OR username login
- [x] `getCurrentUser()` returns new fields
- [x] `src/lib/passwords.ts` -- bcryptjs 10 rounds + timing-safe legacy SHA-256 migration
- [x] `src/lib/access.ts` -- `canAccessPremium()` boolean check

### Stripe Integration
- [x] `stripe` + `bcryptjs` npm packages installed
- [x] `src/lib/stripe.ts` -- lazy singleton with startup validation
- [x] `src/lib/stripe-actions.ts` -- `createCheckoutSession()`, `createPortalSession()` server actions
- [x] `src/app/api/webhooks/stripe/route.ts` -- atomic idempotent webhook handler (INSERT OR IGNORE + single transaction)
- [x] Handles: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
- [x] Guards against downgrading admin/analyst roles on subscription deletion
- [x] Maps Stripe statuses (trialing, unpaid, etc.) to domain statuses (active, past_due, canceled, none)

### Pages
- [x] `/register` -- registration form with email + password + name
- [x] `/subscribe` -- pricing page with checkout button (or "create account" CTA if not logged in)
- [x] `/account` -- account dashboard showing plan, email, billing management
- [x] Stripe Customer Portal integration via "Manage billing" button

### Infrastructure
- [x] CSP headers updated for `js.stripe.com`, `api.stripe.com`, `frame-src`
- [x] `.env.example` updated with 4 Stripe vars
- [x] Coming soon proxy updated to whitelist `/register`, `/subscribe`, `/account`

### Quality
- [x] TypeScript type check passes (0 errors)
- [x] Next.js build succeeds
- [x] All existing vitest tests pass (pre-existing failures only in `fees.test.ts`)
- [x] Migration runs idempotently

---

## What's Not Done

### Needs Your Action (Blocking)
- [ ] Add `STRIPE_WEBHOOK_SECRET` to `.env.local` (run `stripe listen --forward-to localhost:3000/api/webhooks/stripe`)
- [ ] Add `STRIPE_PRO_PRICE_ID` to `.env.local` (create product/price in Stripe Dashboard)
- [ ] Install Stripe CLI: `brew install stripe/stripe-cli/stripe` then `stripe login`
- [ ] End-to-end test: register -> subscribe -> checkout -> webhook -> account shows Pro

### Not Yet Implemented (Phase B / Deferred)
- [ ] Resend email integration (verification, password reset, notifications)
- [ ] Self-service password reset flow
- [ ] Email verification on registration
- [ ] Waitlist JSON -> SQLite migration + founding member coupon application
- [ ] Admin user management UI
- [ ] Profile editing (name, email change, password change)
- [ ] Rate limiting on login/registration endpoints
- [ ] SQLite-backed rate limiter (replace in-memory Map)
- [ ] `stripe_events` table cleanup job (purge >90 days)
- [ ] API key system for Pro programmatic access
- [ ] Content gating on specific pages (exports, reports, full dataset, peer filters)

### Content Gating (Decided but Not Wired)
Gating applies to: **API access (coming soon), reports, data exports, full dataset**. The `canAccessPremium()` function exists but hasn't been added to specific page/action guards yet. Pages to gate:
- [ ] CSV export actions
- [ ] Executive report generation
- [ ] Full 49-category access (vs 6 spotlight for free)
- [ ] Peer filter access
- [ ] Research agent access beyond free tier
- [ ] District data beyond 3 free districts

---

## Files Created (10)
```
src/lib/passwords.ts
src/lib/stripe.ts
src/lib/stripe-actions.ts
src/lib/access.ts
src/lib/crawler-db/migrations/001-payments.sql
src/lib/crawler-db/migrate.ts
src/app/api/webhooks/stripe/route.ts
src/app/(auth)/register/page.tsx
src/app/(auth)/register/register-form.tsx
src/app/(auth)/register/actions.ts
src/app/(public)/subscribe/page.tsx
src/app/(public)/subscribe/subscribe-button.tsx
src/app/account/page.tsx
src/app/account/manage-billing-button.tsx
```

## Files Modified (6)
```
src/lib/crawler-db/connection.ts    -- foreign_keys, STUB_TABLES
src/lib/auth.ts                     -- singleton reads, User interface, email login, secure cookie
src/lib/fee-actions.ts              -- import shared getWriteDb()
src/app/submit-fees/actions.ts      -- remove singleton close
src/proxy.ts                        -- whitelist new routes past coming soon gate
next.config.ts                      -- CSP headers for Stripe
.env.example                        -- Stripe env vars
```

## Packages Added
```
stripe
bcryptjs
@types/bcryptjs (dev)
```

---

## How to Resume

1. Switch to the branch: `git checkout feat/stripe-payments`
2. Set up Stripe CLI and get webhook secret
3. Create Stripe product/price, add `STRIPE_PRO_PRICE_ID` to `.env.local`
4. Test the full flow locally
5. Wire `canAccessPremium()` into the specific pages/actions listed above
6. Commit and deploy

---

## Key Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Auth approach | Extend existing custom auth | 200 lines, already works, avoid migration risk |
| Password hashing | bcryptjs 10 rounds | Pure JS (no Docker issues), ~80ms on shared-cpu |
| New tables | 0 new tables, 3 columns + stripe_events | Simplicity for <100 users |
| Webhook processing | Synchronous in single transaction | ~1ms SQLite writes, no need for async `after()` |
| Tier enforcement | Boolean `canAccessPremium()` | 2 tiers don't need a TierLimits system |
| Server actions placement | `src/lib/stripe-actions.ts` | Matches `fee-actions.ts` pattern |
| Email provider | Deferred (Stripe sends receipts) | No email infra needed for MVP |
| Rate limiting | Deferred | <100 users, not under attack |
| Middleware | Not added | Per-page `requireAuth()` already works |
| Sender email | james@bankfeeindex.com | All transactional emails from this address |

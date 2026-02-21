# feat: Enterprise SaaS Monetization

> **Goal:** 200 banks and credit unions paying $500/year = $100K ARR
> **Date:** 2026-02-21
> **Branch:** `feat/fi-fee-tracker`

---

## Overview

Bank Fee Index currently gives away all data for free across 15+ public routes and 1,987 indexed institution pages. There is no billing infrastructure, no subscriber authentication, and no content gating. The admin auth system (viewer/analyst/admin) serves internal editorial workflows only.

This plan introduces a freemium SaaS model that preserves SEO value on indexed pages while gating high-value features behind a $500/year subscription. The competitive landscape (S&P Global $5K-$50K, Curinos $10K-$100K, Moebs $3K-$15K) gives us a 6-30x price advantage — the strategy is volume at a radically low price point.

## Problem Statement

1. **No revenue infrastructure** — zero billing, subscriptions, or payment processing
2. **All data is free** — every fee, institution profile, benchmark, and report is publicly accessible
3. **No subscriber identity** — only admin users exist; no concept of a bank/CU "customer"
4. **Auth confusion** — admin roles (viewer/analyst/admin) serve editorial workflows, not customer access
5. **SEO risk** — gating 1,987 indexed pages would destroy organic traffic and domain authority
6. **Missing features** — historical trends, fee change alerts, and PDF exports don't exist yet but are the highest-value features for enterprise buyers

## Proposed Solution

### Pricing Model

| Tier | Price | Target |
|------|-------|--------|
| **Free** | $0 | Unlimited — SEO + lead gen |
| **Starter** | $500/year | 200 small banks/CUs |
| **Professional** | $1,500/year | 50 mid-size institutions (future) |
| **Enterprise** | Custom | 10 large banks (future) |

**MVP scope: Free + Starter only.** Professional and Enterprise tiers are future upsells once we validate demand at the $500 price point.

### Content Gating Strategy (Free vs Paid)

**Critical principle:** Never gate what Google has already indexed. Instead, gate *new* high-value features that don't exist yet.

| Feature | Free | Starter ($500/yr) |
|---------|------|--------------------|
| Institution profiles (1,987 pages) | Full access | Full access |
| National fee index (15 featured) | Full access | Full access |
| Fee category pages | Full access | Full access |
| State/district pages | Full access | Full access |
| Research articles | 3 free/month, then paywall | Unlimited |
| **Peer benchmarking** | Teaser (3 categories) | Full (all 49 categories) |
| **Head-to-head comparison** | 1 free compare/day | Unlimited |
| **CSV/PDF export** | Not available | Unlimited |
| **Fee change alerts** | Not available | Weekly email digest |
| **API access** | Not available | 1,000 requests/month |
| **Historical trends** | Not available | 12-month lookback |
| **Custom peer groups** | Not available | Up to 5 saved groups |

### Architecture

```
┌─────────────────────────────────────────────────┐
│                   Next.js App                    │
│                                                  │
│  middleware.ts (subscription gating via cookie)   │
│     ↓                                            │
│  ┌──────────────┐  ┌────────────────────────┐   │
│  │ Public Routes │  │ Gated Routes           │   │
│  │ /institutions │  │ /benchmarks/full       │   │
│  │ /fees         │  │ /export/*              │   │
│  │ /research (3) │  │ /api/v1/*             │   │
│  │ /districts    │  │ /alerts/*             │   │
│  └──────────────┘  │ /research (unlimited)  │   │
│                     └────────────────────────┘   │
│                          ↓                       │
│  ┌──────────────────────────────┐               │
│  │ Subscriber Auth (separate    │               │
│  │ from admin auth)             │               │
│  │ - Email/password signup      │               │
│  │ - Organization accounts      │               │
│  │ - Stripe Checkout            │               │
│  │ - Session cookie: bfi_sub    │               │
│  └──────────────────────────────┘               │
│                          ↓                       │
│  ┌──────────────────────────────┐               │
│  │ SQLite Tables                │               │
│  │ - organizations              │               │
│  │ - subscriptions              │               │
│  │ - org_members                │               │
│  │ - api_keys                   │               │
│  │ - stripe_events              │               │
│  │ - usage_events               │               │
│  └──────────────────────────────┘               │
└─────────────────────────────────────────────────┘
         ↕                    ↕
    Stripe API           Resend API
    (billing)            (alerts email)
```

---

## Technical Approach

### Phase 1: Subscriber Auth + Stripe Billing (Week 1-2)

Build the subscriber identity system completely separate from admin auth.

#### Database Schema

```sql
-- New tables in crawler.db

CREATE TABLE organizations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  charter_type TEXT,           -- 'bank' | 'credit_union' | 'other'
  asset_tier TEXT,
  cert_number TEXT,            -- FDIC/NCUA cert for verification
  stripe_customer_id TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  stripe_subscription_id TEXT UNIQUE NOT NULL,
  plan TEXT NOT NULL DEFAULT 'starter',  -- 'starter' | 'professional' | 'enterprise'
  status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'past_due' | 'canceled' | 'trialing'
  current_period_start TEXT NOT NULL,
  current_period_end TEXT NOT NULL,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE org_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'member', -- 'owner' | 'admin' | 'member'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(organization_id, email)
);

CREATE TABLE api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  key_hash TEXT NOT NULL UNIQUE,  -- SHA-256 of the key
  key_prefix TEXT NOT NULL,        -- First 8 chars for identification
  name TEXT NOT NULL DEFAULT 'Default',
  last_used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE stripe_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stripe_event_id TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  processed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE usage_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  event_type TEXT NOT NULL,  -- 'api_call' | 'export' | 'compare' | 'research_view'
  metadata TEXT,             -- JSON
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

#### Key Files to Create

- [x] `src/lib/subscriber-auth.ts` — signup, login, session management (cookie: `bfi_sub`)
- [x] `src/lib/subscriber-db/` — queries for organizations, subscriptions, members
- [x] `src/lib/stripe.ts` — Stripe client, checkout session creation, billing portal
- [x] `src/app/api/stripe/webhook/route.ts` — Stripe webhook handler
- [x] `src/app/(subscriber)/login/page.tsx` — subscriber login
- [x] `src/app/(subscriber)/signup/page.tsx` — subscriber signup + Stripe Checkout
- [x] `src/app/(subscriber)/account/page.tsx` — account management + billing portal
- [x] `src/middleware.ts` — subscription gating (check `bfi_sub` cookie)
- [x] `src/lib/subscription-gate.ts` — helper to check subscription status in server components

#### Middleware Gating Pattern

Edge Runtime cannot use `better-sqlite3`. The middleware reads subscription claims from a signed cookie set at login/webhook time.

```typescript
// src/middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySubscriptionCookie } from "@/lib/subscriber-auth";

const GATED_PATHS = [
  "/benchmarks/full",
  "/export",
  "/api/v1",
  "/alerts",
];

const METERED_PATHS = [
  "/compare",     // 1 free/day
  "/research",    // 3 free/month
];

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isGated = GATED_PATHS.some((p) => path.startsWith(p));
  const isMetered = METERED_PATHS.some((p) => path.startsWith(p));

  if (!isGated && !isMetered) return NextResponse.next();

  const sub = verifySubscriptionCookie(request);

  if (isGated && !sub?.active) {
    return NextResponse.redirect(new URL("/pricing", request.url));
  }

  // Metered paths handled in page components (need DB for counts)
  return NextResponse.next();
}
```

#### Stripe Integration

```typescript
// src/lib/stripe.ts
import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function createCheckoutSession(orgId: number, email: string) {
  return stripe.checkout.sessions.create({
    customer_email: email,
    mode: "subscription",
    line_items: [{ price: process.env.STRIPE_STARTER_PRICE_ID!, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_URL}/account?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.NEXT_PUBLIC_URL}/pricing`,
    metadata: { org_id: String(orgId) },
  });
}

export async function createBillingPortal(customerId: string) {
  return stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${process.env.NEXT_PUBLIC_URL}/account`,
  });
}
```

### Phase 2: Pricing Page + Signup Flow (Week 2-3)

- [x] `src/app/(public)/pricing/page.tsx` — pricing comparison table
- [x] Pricing page with Free vs Starter comparison
- [x] "Start Free Trial" CTA → signup → Stripe Checkout → account page
- [ ] 14-day free trial (no credit card required for trial? TBD)
- [x] Upgrade prompts on gated features ("Unlock full benchmarks — $500/year")
- [x] Soft paywall on research articles (show first 2 paragraphs, blur rest)

### Phase 3: High-Value Gated Features (Week 3-5)

These features don't exist yet — building them behind the paywall from day one.

#### 3a. Full Peer Benchmarking

- [x] `src/app/(subscriber)/benchmarks/page.tsx` — full 49-category peer benchmark
- [x] Extend existing `getPeerIndex()` to support subscriber peer group configs
- [x] Custom peer group builder (save up to 5 groups)
- [x] `src/lib/subscriber-db/peer-groups.ts` — CRUD for saved peer groups

#### 3b. CSV/PDF Export

- [x] `src/app/api/v1/export/csv/route.ts` — CSV export endpoint
- [x] `src/app/api/v1/export/pdf/route.ts` — PDF export via `pdfkit`
- [x] Export includes: institution profile, fee comparison, peer benchmarks
- [x] Usage tracking: log each export to `usage_events`

#### 3c. Fee Change Alerts (Email Digest)

- [x] `src/lib/alerts/` — alert generation logic
- [x] `src/lib/email.ts` — Resend integration for transactional email
- [x] `scripts/send-weekly-digest.ts` — CLI for weekly alert emails
- [x] Alert types: fee increases >10%, new institutions added, benchmark shifts
- [x] Subscriber preferences: which categories, which peer group

#### 3d. Historical Trends

- [x] `src/lib/crawler-db/historical.ts` — queries for fee history over time
- [x] `src/app/(subscriber)/trends/page.tsx` — trend charts (Recharts)
- [x] 12-month lookback on fee medians by category
- [x] Requires: `fee_snapshots` table or time-series from existing crawl data

#### 3e. API Access

- [x] `src/app/api/v1/` — RESTful API endpoints
- [x] `src/lib/api-auth.ts` — API key validation + rate limiting
- [x] Endpoints: `/api/v1/institutions`, `/api/v1/fees`, `/api/v1/benchmarks`
- [x] Rate limit: 1,000 requests/month per organization
- [x] API key management in subscriber account page

### Phase 4: Growth + Conversion Optimization (Week 5-6)

- [x] Free-to-paid conversion tracking (usage_events → funnel analysis)
- [x] Upgrade prompts at usage limits ("You've used 3/3 free research articles this month")
- [ ] Email drip campaign for free users (Resend)
- [ ] "Compare your fees" CTA on institution pages (drives signup)
- [ ] Testimonial/social proof section on pricing page
- [ ] Annual billing discount display ($500/yr vs implied monthly)

---

## Acceptance Criteria

### Phase 1: Auth + Billing
- [x] Subscriber signup with email/password creates organization + member
- [x] Stripe Checkout redirects and creates subscription on success
- [x] Webhook handler processes `checkout.session.completed`, `invoice.paid`, `customer.subscription.updated`, `customer.subscription.deleted`
- [x] Subscriber login sets `bfi_sub` cookie with signed claims
- [x] Middleware blocks gated routes for non-subscribers
- [x] Account page shows subscription status + billing portal link
- [x] Admin auth (`fsh_session`) and subscriber auth (`bfi_sub`) are fully independent

### Phase 2: Pricing + Signup
- [x] Pricing page renders with Free vs Starter comparison
- [x] "Get Started" CTA flows through signup → Stripe → account
- [x] Soft paywall on research articles (3 free/month, then blur)
- [x] Upgrade prompts appear on gated features

### Phase 3: Gated Features
- [x] Full peer benchmarking with all 49 categories for subscribers
- [x] CSV export downloads with proper formatting
- [x] PDF export generates branded report
- [x] Weekly fee change alert emails sent to subscribers
- [x] API endpoints return JSON with proper auth + rate limiting
- [x] Historical trend charts render 12-month data

### Phase 4: Growth
- [x] Usage tracking records all gated feature access
- [x] Upgrade prompts display at correct thresholds
- [ ] Free-to-paid funnel visible in admin dashboard

---

## Dependencies & Risks

### Dependencies
- **Stripe account** — need product + price IDs for Starter plan
- **Resend account** — for transactional email (alerts, welcome, receipts)
- **STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET** — env vars
- **RESEND_API_KEY** — env var
- **Historical data** — fee change alerts require crawl history (may need backfill)

### Risks
| Risk | Impact | Mitigation |
|------|--------|------------|
| SEO traffic loss from gating | High | Never gate indexed pages; only gate new features |
| Low conversion rate (<2%) | Medium | Generous free tier drives volume; $500 is impulse-buy for institutions |
| Stripe webhook failures | Medium | Idempotent handler + `stripe_events` dedup table |
| Password auth complexity | Low | Use `bcrypt` + secure session cookies; consider magic links later |
| SQLite concurrency under load | Low | WAL mode + write-per-action pattern already handles this |

### Open Questions
1. **Free trial duration** — 14 days? 30 days? No trial (just free tier)?
2. **Credit card for trial** — require upfront or not?
3. **Team seats** — how many members per organization at Starter tier?
4. **Institution verification** — require FDIC/NCUA cert number at signup?
5. **Existing waitlist** — migrate `waitlist.json` contacts into launch email?

---

## Success Metrics

| Metric | Target | Timeframe |
|--------|--------|-----------|
| Subscriber signups | 200 paid | 12 months |
| ARR | $100,000 | 12 months |
| Free-to-paid conversion | >3% | Ongoing |
| Monthly churn | <2% | Ongoing |
| Research article views (free) | 5,000/month | 6 months |
| API calls (paid) | 10,000/month | 6 months |

---

## References

### Internal
- `src/lib/auth.ts` — existing admin auth (do not modify)
- `src/lib/crawler-db/connection.ts` — singleton read + write-per-action pattern
- `src/lib/crawler-db/fees.ts` — existing fee queries to extend
- `src/app/(public)/research/` — research pages to add metering
- `src/app/admin/` — admin routes (separate from subscriber routes)

### External
- [Stripe Checkout Quickstart](https://stripe.com/docs/checkout/quickstart)
- [Stripe Billing Portal](https://stripe.com/docs/billing/subscriptions/customer-portal)
- [Stripe Webhooks](https://stripe.com/docs/webhooks)
- [Resend Next.js Integration](https://resend.com/docs/send-with-nextjs)
- [PDFKit Documentation](https://pdfkit.org/)
- [bcrypt.js](https://github.com/dcodeIO/bcrypt.js)

### Competitive Landscape
- S&P Global Market Intelligence: $5,000-$50,000/year
- Curinos (formerly Novantas): $10,000-$100,000/year
- Moebs $ervices: $3,000-$15,000/year
- Bankrate (free, ad-supported, consumer-facing)
- **Our position:** $500/year — 6-30x cheaper, self-serve, data-rich

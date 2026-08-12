# B2B Paid Data Access Pipeline

## Overview

Sell access to the Bank Fee Index database -- query, research, and aggregation -- to banks, credit unions, consultants, fintechs, and compliance teams. Self-serve signup with Stripe, API key auth, usage metering.

## What Exists Already

| Component | Status | File |
|-----------|--------|------|
| REST API (fees, index, institutions) | Working, no auth | `src/app/api/v1/` |
| AI research agents (4 agents) | Working, session auth | `src/app/api/research/` |
| Auth system (roles, sessions, cookies) | Working | `src/lib/auth.ts` |
| Rate limiting (in-memory) | Working for research only | `src/lib/research/rate-limit.ts` |
| Waitlist page | Basic, writes to JSON file | `src/app/waitlist/` |
| Pro page layout | Scaffolded, no checkout | `src/app/pro/` |
| User model with `subscription_status` | In schema | `connection.ts` stub tables |
| Stripe CSP headers | Already added | `next.config.ts` |
| CSV export | Working on fees + index endpoints | `src/app/api/v1/` |

## B2B Pricing Tiers

| Product | Price | Includes |
|---------|-------|----------|
| **Seat License** | $499.99/mo per seat | Full platform access -- query, research, aggregation, AI agents, CSV export |
| **Custom Report** | $250 per report | On-demand peer analysis, competitive intelligence, district deep-dive |
| **Annual License** | $5,000/year per seat | Same as monthly, 17% savings |

No free tier. The public site shows summary data (national medians for 6 spotlight categories). Everything else requires a paid seat license.

## Lead-to-Sale Pipeline

```
Coming Soon Page (hello@bankfeeindex.com)
    ↓
"Get Early Access" → Email capture
    ↓
Manual outreach by James (founder sales)
    ↓
Demo (show admin dashboard, API, AI research)
    ↓
Stripe Checkout → API key issued
    ↓
Self-serve usage (API + AI research + exports)
    ↓
Usage grows → upsell to higher tier
```

### Phase 1: Lead Capture (this week)

Replace `mailto:` links with an actual form that captures:
- Company name
- Contact name
- Email
- Role (consultant / fintech / bank/CU / compliance / other)
- Use case (1-2 sentences)

Store in DB (new `leads` table), send notification email to James.

**Files to create/modify:**
- `fee_crawler/db.py` -- add `leads` table
- `src/app/api/leads/route.ts` -- POST endpoint for lead capture
- `src/proxy.ts` -- replace mailto with inline form
- `src/app/admin/leads/page.tsx` -- admin view of leads (optional, can query DB directly)

### Phase 2: Stripe + API Keys (next 2 weeks)

#### 2.1 Stripe Setup

- Create 2 Products in Stripe Dashboard (Starter, Professional)
- Attach monthly + annual prices to each
- Create a Meter for `api_request` events
- Enable Customer Portal

**Environment variables:**
```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
```

#### 2.2 API Key System

**New table:**
```sql
CREATE TABLE api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    key_hash TEXT NOT NULL UNIQUE,
    key_prefix TEXT NOT NULL,
    tier TEXT NOT NULL DEFAULT 'starter',
    rate_limit_per_minute INTEGER NOT NULL DEFAULT 30,
    monthly_limit INTEGER NOT NULL DEFAULT 5000,
    is_active INTEGER NOT NULL DEFAULT 1,
    last_used_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**New table:**
```sql
CREATE TABLE api_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    api_key_id INTEGER NOT NULL REFERENCES api_keys(id),
    endpoint TEXT NOT NULL,
    response_status INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Files to create:**
- `src/lib/api-keys.ts` -- generate, hash, verify, check limits
- `src/lib/api-middleware.ts` -- shared auth middleware for `/api/v1/*` routes

**Key format:** `bfi_live_` + 32 random hex chars (e.g., `bfi_live_a1b2c3d4...`)

#### 2.3 Auth Middleware for API Routes

Every `/api/v1/*` request:
1. Extract `Authorization: Bearer bfi_live_xxx` header
2. Hash the key, look up in `api_keys` table
3. Check `is_active`, check monthly usage against `monthly_limit`
4. Check per-minute rate limit
5. Log to `api_usage` table
6. Serve data or return 401/429

#### 2.4 Checkout Flow

**Files to create:**
- `src/app/api/checkout/route.ts` -- creates Stripe Checkout session
- `src/app/api/webhooks/stripe/route.ts` -- handles subscription events
- `src/app/pricing/page.tsx` -- pricing page with checkout buttons
- `src/app/account/page.tsx` -- usage dashboard + API key management + Stripe portal link

**Webhook events to handle:**
- `checkout.session.completed` -- create user + API key + set tier
- `customer.subscription.updated` -- update tier/limits
- `customer.subscription.deleted` -- deactivate API key
- `invoice.payment_failed` -- flag account

### Phase 3: Self-Serve Onboarding (week 3-4)

#### 3.1 Post-Checkout Flow

After Stripe payment:
1. Create user account (email from Stripe)
2. Generate API key
3. Redirect to `/account` showing:
   - API key (show once, copy button)
   - Quickstart code snippets (curl, Python, JS)
   - Usage meter (calls made / calls included)
   - Plan details + upgrade button
   - Stripe Customer Portal link (manage billing)

#### 3.2 API Documentation

Update `/api-docs` page with:
- Auth instructions (Bearer token)
- Rate limits per tier
- All endpoints with examples
- Response schemas
- Error codes (401, 429, etc.)

#### 3.3 AI Research Access

Paying customers get access to the AI research agent:
- Starter: 10 queries/month
- Professional: 50 queries/month
- Enterprise: unlimited
- Track via `research_usage` table (already exists)

### Phase 4: Enterprise (when inbound arrives)

- Custom pricing via "Contact Sales" on pricing page
- Dedicated API key with custom limits
- Raw data export (full DB dump or filtered)
- SLA + priority support
- White-label reports

## What NOT to Build

- No free tier (B2B doesn't need it -- the public site is the preview)
- No email drip campaigns (founder sales at this stage)
- No Unkey/third-party key management (DIY is fine for <500 customers)
- No usage-based overage billing initially (hard cap, then upgrade prompt)
- No custom billing UI (Stripe Customer Portal handles it)

## Acceptance Criteria

- [ ] Lead capture form on coming soon page, stored in DB
- [ ] Stripe Products + Prices created (Starter $99, Professional $299)
- [ ] API key generation on checkout completion
- [ ] Bearer token auth on all `/api/v1/*` routes
- [ ] Rate limiting per API key tier
- [ ] Usage tracking in `api_usage` table
- [ ] `/account` page showing key, usage, plan
- [ ] `/pricing` page with Stripe Checkout buttons
- [ ] Webhook handler for subscription lifecycle
- [ ] AI research metered per tier

## Monthly Costs at Scale

| Customers | Revenue | Stripe Fees | Fly.io | AI (Claude) | Total Cost | Margin |
|-----------|---------|-------------|--------|-------------|------------|--------|
| 10 | $1,500/mo | $45 | $7 | $50 | $102 | 93% |
| 50 | $7,500/mo | $225 | $7 | $250 | $482 | 94% |
| 200 | $30,000/mo | $900 | $15 | $1,000 | $1,915 | 94% |

## References

- Auth system: `src/lib/auth.ts`
- API routes: `src/app/api/v1/`
- Rate limiting: `src/lib/research/rate-limit.ts`
- Waitlist: `src/app/waitlist/`
- Stripe docs: https://docs.stripe.com/billing/subscriptions/usage-based
- Stripe Checkout: https://docs.stripe.com/payments/checkout
- Stripe Customer Portal: https://docs.stripe.com/customer-management/portal-deep-links

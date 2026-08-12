# Professional Account Experience

## Overview

Enhance the `/account` page and post-signup flow for professional B2B users (bankers, consultants, fintechs, compliance teams). These users are paying $499.99/mo for data access -- the account experience needs to match that price point. Consumers are not the target; everything should be built for professionals who want data, reports, and Fed intelligence.

## Problem

The current `/account` page shows name, email, plan status, and a billing button. That's an afterthought, not a professional tool. A banker paying $6,000/year expects:

1. To see their institution's fee data immediately after subscribing
2. Quick access to the tools they're paying for (research agent, exports, peer benchmarks)
3. A sense that this is a professional platform built for them

## What Exists

| Component | Status |
|-----------|--------|
| Account page (name, email, plan) | Basic |
| Stripe subscription + billing portal | Working |
| Registration (name, email, password) | Working, no institution capture |
| AI research agents (4 agents) | Working, premium-gated |
| Fee API (fees, index, institutions) | Working, no auth |
| Fed data (Beige Book, indicators, speeches) | In DB, partially exposed |
| Financial data (Call Reports, CFPB) | In DB, partially exposed |
| Market concentration (SOD/HHI) | In DB, not exposed |
| Census demographics | In DB, not exposed |
| Leads table | Schema exists |

## Proposed Solution

Transform `/account` from a billing stub into a professional command center with three sections: Profile, Data Access, and Quick Actions.

### Phase 1: Professional Onboarding (capture who they are)

**Extend registration to capture professional context:**

Add to the registration form (or as a post-signup onboarding step):
- Institution name
- Charter type (Bank / Credit Union / Fintech / Consulting / Regulatory / Other)
- Asset size tier (for banks/CUs: <$300M / $300M-$1B / $1B-$10B / $10B-$50B / $50B+)
- State
- Role (Executive / Treasury / Compliance / Marketing / Analyst / Developer / Other)
- Primary interest (checkboxes): Fee Benchmarking, Peer Analysis, Competitive Intelligence, Regulatory Context, Market Research, API Integration

**New columns on `users` table:**
```sql
ALTER TABLE users ADD COLUMN institution_name TEXT;
ALTER TABLE users ADD COLUMN institution_type TEXT;
ALTER TABLE users ADD COLUMN asset_tier TEXT;
ALTER TABLE users ADD COLUMN state_code TEXT;
ALTER TABLE users ADD COLUMN job_role TEXT;
ALTER TABLE users ADD COLUMN interests TEXT;  -- JSON array
```

**Files to modify:**
- `src/app/(auth)/register/register-form.tsx` -- add fields (collapsible "Tell us about yourself" section)
- `src/app/(auth)/register/actions.ts` -- save new fields
- `src/lib/auth.ts` -- extend User interface
- `fee_crawler/db.py` -- migration for new columns
- `src/lib/crawler-db/connection.ts` -- update stub tables

### Phase 2: Professional Account Dashboard

Replace the basic account page with a command center:

```
/account
├── Profile card (institution, role, interests -- editable)
├── Quick Actions grid
│   ├── "Research Agent" → /pro/research or embedded chat
│   ├── "Fee Benchmarks" → /fees with their state pre-filtered
│   ├── "Peer Analysis" → /research/national-fee-index with their tier/charter pre-filtered
│   ├── "District Report" → /research/district/[their district]
│   ├── "Export Data" → CSV download for their peer group
│   └── "Fed Intelligence" → Beige Book + indicators for their district
├── Recent Activity (last 5 research queries, exports)
├── Subscription & Billing
└── API Key (generate/view/revoke)
```

**Personalization logic:**
- If user has `state_code` → pre-filter state pages
- If user has `asset_tier` + `institution_type` → pre-filter peer benchmarks
- If user has `state_code` → map to Fed district for district report link
- Show their institution's fees if we have data for it (match by name)

**Files to create:**
- `src/app/account/page.tsx` -- rewrite with dashboard layout
- `src/app/account/profile-form.tsx` -- editable profile (client component)
- `src/app/account/actions.ts` -- update profile server action
- `src/app/account/quick-actions.tsx` -- personalized action grid

### Phase 3: API Key Management

Professional users need programmatic access:

**On the account page, add "API Access" section:**
- "Generate API Key" button → creates key, shows it once
- Display key prefix (`bfi_live_a1b2...`) with copy button
- Revoke button
- Usage count (calls this month / limit)

**New table:**
```sql
CREATE TABLE api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    key_hash TEXT NOT NULL UNIQUE,
    key_prefix TEXT NOT NULL,
    tier TEXT NOT NULL DEFAULT 'pro',
    monthly_limit INTEGER NOT NULL DEFAULT 5000,
    call_count INTEGER NOT NULL DEFAULT 0,
    last_used_at TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Files to create:**
- `src/lib/api-keys.ts` -- generate, hash, verify, check limits
- `src/app/account/api-key-section.tsx` -- UI for key management
- `src/app/api/keys/route.ts` -- POST (create), DELETE (revoke)

### Phase 4: Data Access Quick Links (Personalized)

Surface the data professionals actually want, personalized to their profile:

**Fee Intelligence Card:**
- "Your peer group: Community Banks ($300M-$1B) in Virginia"
- Top 6 spotlight fees with their peer medians
- "View full peer analysis" link

**District Intelligence Card:**
- Their Fed district name + latest Beige Book headline
- Key economic indicators (unemployment, CPI, SOFR)
- "View district report" link

**Compliance Card:**
- CFPB complaint trends for their institution type
- Top complaint categories
- "View compliance data" link

**Files to create:**
- `src/app/account/fee-snapshot.tsx` -- peer fee summary (server component)
- `src/app/account/district-snapshot.tsx` -- district data summary
- `src/app/account/compliance-snapshot.tsx` -- complaint data summary
- `src/lib/crawler-db/account.ts` -- queries for personalized data

## What NOT to Build

- Team/multi-seat management (wait for demand)
- SSO/OAuth (username+password is fine for <100 users)
- Custom dashboards (the quick actions cover this)
- Webhook subscriptions (premature)
- Report scheduler (manual reports via research agent is enough)
- Saved searches/alerts (future feature)

## Acceptance Criteria

### Phase 1
- [ ] Registration captures institution name, type, asset tier, state, role, interests
- [ ] New columns added to users table with migration
- [ ] Existing users can edit profile from account page
- [ ] User interface extended with new fields

### Phase 2
- [ ] Account page shows profile card with edit capability
- [ ] Quick Actions grid with 6 personalized links
- [ ] Links pre-filter to user's state/charter/tier when applicable
- [ ] Subscription section with Stripe billing portal

### Phase 3
- [ ] API key generation from account page
- [ ] Key shown once with copy button
- [ ] Key prefix visible after creation
- [ ] Revoke button
- [ ] Usage counter displayed

### Phase 4
- [ ] Fee snapshot card showing peer group medians
- [ ] District intelligence card with Beige Book headline
- [ ] Compliance card with complaint trends
- [ ] All cards personalized to user's institution profile

## Execution Order

1. **Phase 1** first -- know who the user is before personalizing
2. **Phase 2** next -- the dashboard layout
3. **Phase 3** can be done in parallel with Phase 2
4. **Phase 4** last -- requires Phase 1 data to personalize

## References

- Account page: `src/app/account/page.tsx`
- Auth system: `src/lib/auth.ts`
- Registration: `src/app/(auth)/register/`
- Access control: `src/lib/access.ts`
- Fed data queries: `src/lib/crawler-db/fed.ts`
- Financial queries: `src/lib/crawler-db/financial.ts`
- Fee index queries: `src/lib/crawler-db/fee-index.ts`
- State mapping: `src/lib/fed-districts.ts` (STATE_TO_DISTRICT)
- Stripe actions: `src/lib/stripe-actions.ts`
- Research agents: `src/lib/research/agents.ts`

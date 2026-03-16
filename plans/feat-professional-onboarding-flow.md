# Professional Customer Onboarding Flow

## Overview

After a professional user pays ($499.99/mo or $5,000/yr), walk them through the platform with a guided onboarding that introduces features and captures their institution profile. Non-paying users must not access any paid features.

## Current State

- Registration captures: name, email, password, institution details
- After checkout → redirect to `/account?success=true` with a banner
- No guided tour, no feature introduction, no onboarding checklist
- Non-customers can see some paid pages (gating incomplete)

## Access Control Gaps to Fix

Before building onboarding, lock down all paid features:

### Routes that need gating

| Route | Current | Should Be |
|-------|---------|-----------|
| `/fees` | Shows 6 spotlight (free), 43 gated | Correct |
| `/fees/[category]` | Fully open | Gate peer filters + percentile breakdown for free users |
| `/research/state/[code]` | Extended categories gated | Correct |
| `/research/district/[id]` | Fully open | Gate Beige Book, indicators, speeches for free users |
| `/research/national-fee-index` | Fully open | Gate peer filters for free users |
| `/research/fee-revenue-analysis` | Fully open | Gate entirely for free users |
| `/pro/research` | Requires premium role | Correct |
| `/api/v1/fees?format=csv` | Gated | Correct |
| `/api/v1/index` | Fully open | Keep open (summary data is public) |
| `/api/v1/institutions` | Fully open | Keep open (directory is public) |

### Files to modify for gating

- `src/app/(public)/fees/[category]/page.tsx` -- gate percentile table and peer filters
- `src/app/(public)/research/district/[id]/page.tsx` -- gate full Beige Book + indicators
- `src/app/(public)/research/national-fee-index/page.tsx` -- gate peer filter controls
- `src/app/(public)/research/fee-revenue-analysis/page.tsx` -- gate entire page

**Pattern:** Import `getCurrentUser` + `canAccessPremium`, show `<UpgradeGate />` in place of gated sections.

## Onboarding Flow

### Post-Checkout Redirect

After Stripe checkout completes → redirect to `/account/welcome` instead of `/account?success=true`.

### Welcome Page (`/account/welcome`)

A single-page guided introduction:

```
/account/welcome
├── Step 1: Welcome + confirm profile
│   "Welcome to Bank Fee Index, [name]!"
│   Show/edit: institution, type, tier, state, role
│   [Continue →]
│
├── Step 2: Your fee intelligence
│   "Here's what we know about [institution type] in [state]"
│   Show 3-4 spotlight fees for their peer group
│   [Explore Fee Benchmarks →] or [Continue →]
│
├── Step 3: Your tools
│   Grid of 4 capabilities with descriptions:
│   - AI Research Agent: "Ask any question about bank fees"
│   - Peer Analysis: "Compare against your charter/tier/district"
│   - Data Exports: "Download CSV reports for board presentations"
│   - API Access: "Integrate fee data into your systems"
│   [Generate your API key →] or [Skip for now]
│
└── Step 4: You're all set
    "Your account is ready. Start exploring."
    [Go to Dashboard →] (links to /account)
```

### Implementation

**Files to create:**
- `src/app/account/welcome/page.tsx` -- multi-step welcome page (server component)
- `src/app/account/welcome/welcome-steps.tsx` -- client component with step state

**Modify:**
- `src/lib/stripe-actions.ts` -- change success_url to `/account/welcome?success=true`
- `src/app/api/webhooks/stripe/route.ts` -- no changes needed (activation stays the same)
- `src/proxy.ts` -- add `/account/welcome` to bypass list (already covered by `/account`)

### Onboarding Checklist (on account page)

After the welcome flow, show a persistent checklist on `/account`:

```
Getting Started (2 of 4 complete)
✅ Created account
✅ Subscribed to Seat License
☐ Complete your organization profile
☐ Run your first AI research query
```

Track completion with a JSON field on the user: `onboarding_progress TEXT` (JSON object).

**Files to modify:**
- `src/app/account/page.tsx` -- add checklist component above quick actions
- `src/app/account/onboarding-checklist.tsx` -- client component

## Acceptance Criteria

### Access Control
- [ ] `/fees/[category]` gates percentiles + peer filters for free users
- [ ] `/research/district/[id]` gates Beige Book + indicators for free users
- [ ] `/research/national-fee-index` gates peer filters for free users
- [ ] `/research/fee-revenue-analysis` gates entire page for free users
- [ ] Non-customers cannot access any premium data views

### Onboarding
- [ ] Post-checkout redirects to `/account/welcome`
- [ ] Welcome page has 4 steps with profile confirmation
- [ ] Step 2 shows personalized fee data for their peer group
- [ ] Step 3 introduces tools with option to generate API key
- [ ] Account page shows onboarding checklist until complete

## What NOT to Build

- Email drip campaign (manual follow-up for now)
- Video tutorials (overkill for <100 users)
- Interactive product tour overlay (too complex)
- Separate onboarding for different user types (one flow fits all)

## References

- Account page: `src/app/account/page.tsx`
- Upgrade gate: `src/components/upgrade-gate.tsx`
- Access control: `src/lib/access.ts`
- Stripe actions: `src/lib/stripe-actions.ts`
- Fee taxonomy (spotlight): `src/lib/fee-taxonomy.ts`
- State mapping: `src/lib/fed-districts.ts`

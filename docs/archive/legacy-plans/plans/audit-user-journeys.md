# User Journey Audit & Fixes

## Current User Journeys

### Consumer Journey
```
Gateway (/) → "Explore Fees" → /consumer
    ├── "Find Your Bank" → /institutions → search → /institution/[id]
    ├── Spotlight fee cards → /fees/[category]
    ├── "Read Guides" → /guides → /guides/[slug]
    ├── State reports → /research/state/[code]
    └── "Go Deeper" → /research, /research/national-fee-index
```
**Status: Working.** All links verified, all destinations exist.

### Professional Journey
```
Gateway (/) → "Get Early Access" → /subscribe
    ├── "Create account" → /register → /login → /account
    ├── Monthly/Annual → Stripe Checkout → /account/welcome
    └── Report → mailto:hello@bankfeeindex.com

/pro (landing page) → [NO LINK TO /subscribe] ← BUG
    ├── "View National Index" → /research/national-fee-index
    ├── Capability cards → /fees, /research, /api-docs
    └── "Request Access" → mailto
```
**Status: Mostly working.** One dead end: `/pro` has no link to `/subscribe`.

### Paid Professional Journey
```
/account (dashboard)
    ├── Quick Actions:
    │   ├── Research Agent → /pro/research (premium only)
    │   ├── Fee Benchmarks → /research/state/[their state]
    │   ├── Peer Analysis → /research/national-fee-index (premium) or /subscribe
    │   ├── District Report → /research/district/[id] (premium) or /subscribe
    │   ├── Export Data → /api/v1/fees?format=csv (premium) or /subscribe
    │   └── API Docs → /api-docs
    ├── Profile editing
    └── Manage Billing → Stripe Portal
```
**Status: Working.** All paths verified.

## Issues Found

### Must Fix

| # | Issue | Impact | Fix |
|---|-------|--------|-----|
| 1 | `/pro` page has no link to `/subscribe` | Professional users can't upgrade from pro landing | Add CTA to access tiers section |
| 2 | `/waitlist` page is orphaned | No pages link to it | Remove or redirect to `/subscribe` |
| 3 | `/pro/research` vs `/research` naming | Confusing -- one is AI agent, other is static pages | Acceptable for now, rename later |

### Already Fixed This Session

| # | Issue | Fix |
|---|-------|-----|
| 1 | Institution search didn't exist | Built `/institutions` page |
| 2 | Institution detail 404'd with 0 fees | Removed fee_count check |
| 3 | Consumer CTA was "Compare Fees" → /fees | Changed to "Find Your Bank" → /institutions |
| 4 | Gateway pro CTA linked to /pro | Changed to /subscribe |
| 5 | Filter selects had onChange in server component | Replaced with submit button |

## Acceptance Criteria

- [ ] `/pro` page has "View Plans" or "Subscribe" link to `/subscribe`
- [ ] `/waitlist` removed or redirects to `/subscribe`
- [ ] All 22 page destinations verified working (done above)
- [ ] Consumer can reach institution search within 1 click from gateway
- [ ] Professional can reach pricing within 1 click from gateway

## References

- All 22 verified page paths listed in audit above
- Navigation: `src/components/customer-nav.tsx`
- Gateway: `src/app/gateway-client.tsx`

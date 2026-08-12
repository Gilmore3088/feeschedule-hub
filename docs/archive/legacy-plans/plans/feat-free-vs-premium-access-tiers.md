# Free vs Premium Access Tiers

## Overview

Define what free (registered) users get vs what paid subscribers get. Anyone can create an account. Free users get surface-level research, guides, and public data. Paid users get full data access, exports, AI research, peer analysis, and API keys.

## The Two Tiers

| Feature | Free (registered) | Premium ($499.99/mo or $5,000/yr) |
|---------|-------------------|-----------------------------------|
| **Account** | Profile, login, preferences | Everything free + billing management |
| **Fee Data** | 6 spotlight categories, national medians only | All 49 categories, full percentiles, peer filters |
| **Institutions** | View list, basic search | Full detail, fee schedules, financial data |
| **Guides** | All consumer guides | All guides |
| **Research Articles** | All published articles | All articles |
| **State Pages** | Summary stats only (counts, top fees) | Full breakdown tables, all categories |
| **District Pages** | Beige Book headline only | Full Beige Book, indicators, speeches |
| **National Index** | Top 6 spotlight fees | Full 49 categories, peer filtering |
| **AI Research Agent** | 3 queries/day (ask agent only) | 50 queries/day (all 4 agents) |
| **CSV Export** | Not available | All exports |
| **API Access** | Not available | API key + 5,000 calls/mo |
| **Peer Analysis** | Not available | Charter/tier/district filtering |
| **Reports** | Not available | $250/report add-on |

## Implementation Approach

### Gate at the Component Level, Not the Route Level

Don't block free users from pages. Let them see the page structure with blurred/gated sections. This is a better conversion tool than a hard paywall.

**Pattern:** Show 3-6 rows of data, then a soft gate:
```
| Fee Category     | Median | P25   | P75   |
|------------------|--------|-------|-------|
| Monthly Maint.   | $12.00 | $8.00 | $15.00|
| Overdraft        | $30.00 | $25.00| $35.00|
| NSF              | $30.00 | $25.00| $34.00|
|-------------------------------------------|
| 🔒 43 more categories available with a   |
|    Seat License. View Plans →             |
|-------------------------------------------|
```

### Files to Modify

#### 1. Access Control Helper (`src/lib/access.ts`)

Currently just `canAccessPremium()`. Extend to be more granular:

```typescript
// What exists
export function canAccessPremium(user: User): boolean

// What to add
export function canExportCsv(user: User | null): boolean
export function canAccessAllCategories(user: User | null): boolean
export function canAccessPeerFilters(user: User | null): boolean
export function canAccessApiKey(user: User | null): boolean
export function canAccessFullDistrict(user: User | null): boolean
export function getResearchQueryLimit(user: User | null): number
export function getVisibleCategoryCount(user: User | null): number
```

**File:** `src/lib/access.ts`

#### 2. Upgrade Gate Component

Reusable component shown when a free user hits a premium feature:

```
src/components/upgrade-gate.tsx
```

Props: `message?: string`, `compact?: boolean`

Renders a card with "Unlock with a Seat License" + "View Plans" button. Compact version is inline (for table rows). Full version is a card.

#### 3. Fee Category Pages (`src/app/(public)/fees/page.tsx`, `src/app/(public)/fees/[category]/page.tsx`)

- Free: Show 6 spotlight categories on index, blur the rest
- Premium: Show all 49
- Free on detail page: Show national median only, no percentiles
- Premium: Full breakdown with charter/tier/district filters

#### 4. National Index (`src/app/(public)/research/national-fee-index/page.tsx`)

- Free: Top 6 spotlight fees, no peer filters
- Premium: All 49, peer filters enabled

#### 5. State Pages (`src/app/(public)/research/state/[code]/page.tsx`)

- Free: Summary cards (institution count, top 3 fees), one paragraph
- Premium: Full category breakdown table

#### 6. District Pages (`src/app/(public)/research/district/[id]/page.tsx`)

- Free: Beige Book headline + district name
- Premium: Full Beige Book, economic indicators, speeches, content feed

#### 7. Research Agent (`src/app/api/research/[agentId]/route.ts`)

- Free: 3 queries/day, `ask` agent only
- Premium: 50 queries/day, all 4 agents
- Already has rate limiting infrastructure in `src/lib/research/rate-limit.ts`

#### 8. CSV Export (`src/app/api/v1/fees/route.ts`, `src/app/api/v1/index/route.ts`)

- Free: JSON only, reject `?format=csv` with upgrade message
- Premium: CSV + JSON

#### 9. Account Page (`src/app/account/page.tsx`)

- Free: Show quick actions but some have lock icons + "Premium" badge
- Premium: All quick actions fully functional

#### 10. API Key Section (`src/app/account/api-key-section.tsx`)

- Free: "Generate API Key" disabled with "Available with Seat License" message
- Premium: Full key management

### Pages That Stay Fully Free

- `/` homepage (behind coming soon gate for now)
- `/guides` and `/guides/[slug]` -- all consumer guides
- `/research/articles` and `/research/articles/[slug]` -- published articles
- `/fees` index page (shows 6 spotlight categories)
- `/subscribe` pricing page
- `/register` and `/login`
- `/api-docs` (documentation is public, auth required to call)

## Acceptance Criteria

- [ ] `canAccessPremium()` and granular checks in `src/lib/access.ts`
- [ ] `<UpgradeGate />` component for inline and card variants
- [ ] Fee index shows 6 categories for free, 49 for premium
- [ ] Fee detail page gates percentiles and peer filters
- [ ] State page gates full breakdown table
- [ ] District page gates full Beige Book and indicators
- [ ] CSV export returns 403 with upgrade message for free users
- [ ] Research agent enforces 3/day limit for free, 50/day for premium
- [ ] Account page shows lock icons on premium-only quick actions for free users
- [ ] API key section disabled for free users

## What NOT to Build

- Don't gate the guides -- they're lead magnets
- Don't gate the articles -- they're SEO content
- Don't block free users from seeing page layouts -- blur/gate sections
- Don't add a "trial" tier -- just free and paid
- Don't overcomplicate with feature flags -- simple boolean checks

## References

- Access control: `src/lib/access.ts`
- Fee taxonomy (spotlight categories): `src/lib/fee-taxonomy.ts`
- Rate limiting: `src/lib/research/rate-limit.ts`
- Account page: `src/app/account/page.tsx`
- API routes: `src/app/api/v1/`
- Research agent: `src/app/api/research/[agentId]/route.ts`

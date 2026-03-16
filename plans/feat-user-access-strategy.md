# User Access Strategy & Institution Search

## The Four User Types

```
                    ┌─────────────────────┐
                    │   feeinsight.com     │
                    │   (gateway split)    │
                    └───────┬─────────────┘
                            │
               ┌────────────┴────────────┐
               │                         │
        ┌──────┴──────┐          ┌───────┴──────┐
        │  Consumer    │          │ Professional │
        │  (left)      │          │ (right)      │
        └──────┬──────┘          └───────┬──────┘
               │                         │
       ┌───────┴───────┐         ┌───────┴───────┐
       │               │         │               │
    Visitor        Free Login   Unpaid Login   Paid Login
    (no auth)      (registered) (registered)   ($500/mo)
```

## Access Matrix

| Page / Feature | Visitor | Consumer (free) | Pro (unpaid) | Pro (paid) |
|---|---|---|---|---|
| **Gateway split page** | Yes | Yes | Yes | Yes |
| **Consumer landing** (`/consumer`) | Yes | Yes | Yes | Yes |
| **Institution search** (`/institutions`) | Yes | Yes | Yes | Yes |
| **Institution detail** (`/institution/[id]`) | Basic | Full fees | Full fees | Full + financials |
| **Guides** (`/guides/*`) | Yes | Yes | Yes | Yes |
| **Fee catalog** (`/fees`) | 6 spotlight | 6 spotlight | 6 spotlight | All 49 |
| **Fee detail** (`/fees/[category]`) | Median only | Median only | Median + summary | Full breakdown |
| **Research articles** (`/research/articles/*`) | Yes | Yes | Yes | Yes |
| **State reports** (`/research/state/*`) | Summary | Summary | Summary | Full |
| **District reports** (`/research/district/*`) | Headline | Headline | Headline | Full + Beige Book |
| **National index** (`/research/national-fee-index`) | 6 featured | 6 featured | 6 featured | All 49 + filters |
| **Fee-revenue analysis** | No | No | No | Yes |
| **AI research agent** (`/pro/research`) | No | No | 3 queries/day | 50 queries/day |
| **CSV export** | No | No | No | Yes |
| **API access** | No | No | No | Coming soon |
| **Account dashboard** | No | Yes (basic) | Yes (basic) | Yes (full) |
| **Register / Login** | Yes | N/A | N/A | N/A |
| **Subscribe / Pricing** | Yes | Yes | Yes | N/A |

### Key Insight: Consumer vs Professional

**Consumers care about:**
- "What does MY bank charge for overdrafts?"
- Searching/browsing institutions by name
- Comparing their bank to peers
- Reading guides about how to avoid fees

**Professionals care about:**
- National/peer benchmarks across categories
- Charter type and asset tier segmentation
- District-level economic context
- Data exports and API access
- AI-powered research queries

## What's Missing: Institution Search Page

The institution detail page (`/institution/[id]`) exists and works great. But there's **no way to find it**. The API endpoint exists (`/api/v1/institutions`) but no UI.

### Build: `/institutions` search page

**Consumer-focused page with:**
- Large search bar at top: "Search your bank or credit union"
- Auto-complete as user types (debounced, hits API)
- Filter sidebar: State, Charter Type (Bank/Credit Union)
- Results list: institution name, city, state, charter type, asset size
- Click → goes to `/institution/[id]`
- No login required

**Files to create:**
- `src/app/(public)/institutions/page.tsx` -- server component with search UI
- `src/app/(public)/institutions/search-bar.tsx` -- client component with autocomplete
- `src/lib/crawler-db/search.ts` -- institution name search query (LIKE or FTS)

### Add to navigation

Update `src/components/customer-nav.tsx`:
```
Fee Benchmarks | Institutions | Research | Guides | Pricing
```

### Add to consumer landing page

The consumer landing page (`/consumer/page.tsx`) has "Compare Fees" as the primary CTA. Change or add:
- "Find Your Bank" → `/institutions`
- Search bar widget on the consumer landing page itself

## Implementation Plan

### Phase 1: Institution Search Page

1. Create `/institutions` page with search + state filter
2. Add institution name search query to `crawler-db/search.ts`
3. Add "Institutions" to `customer-nav.tsx`
4. Link from consumer landing page

### Phase 2: Refine Access Gating

Currently gating is applied inconsistently. Standardize:

| Gate Check | Where Applied | Current | Correct |
|---|---|---|---|
| `canAccessAllCategories` | `/fees`, `/research/national-fee-index` | Yes | Yes |
| `canAccessPremium` | `/fees/[category]` breakdowns | Yes | Yes |
| `canAccessFullDistrict` | `/research/district/[id]` | Yes | Yes |
| `canAccessPremium` | `/research/fee-revenue-analysis` | Yes | Yes |
| Institution financial data | `/institution/[id]` | No gate | Gate financials for premium |
| Institution basic fees | `/institution/[id]` | No gate | Keep free (consumer value) |

### Phase 3: Consumer Landing Page Polish

- Add "Find Your Bank" search bar to `/consumer`
- Make "Compare Fees" link to `/institutions` not `/fees`
- Ensure institution detail pages link back to `/institutions`

## Acceptance Criteria

- [ ] `/institutions` page exists with search bar and state filter
- [ ] Search returns results as user types (autocomplete)
- [ ] Results link to `/institution/[id]`
- [ ] "Institutions" appears in CustomerNav
- [ ] Consumer landing page has "Find Your Bank" CTA
- [ ] Institution detail page shows fees to all users (no gate on basic fees)
- [ ] Institution financial data (Call Reports) gated for premium only
- [ ] Access matrix above is enforced consistently

## What NOT to Build

- Full-text search engine (LIKE query is fine for 9k institutions)
- Institution comparison tool (future feature)
- Saved/favorited institutions (future feature)
- Institution alerts/monitoring (future feature)

## References

- Institution detail: `src/app/(public)/institution/[id]/page.tsx`
- Institutions API: `src/app/api/v1/institutions/route.ts`
- DB queries: `src/lib/crawler-db/geographic.ts` (getInstitutionsByFilter)
- Customer nav: `src/components/customer-nav.tsx`
- Consumer landing: `src/app/consumer/page.tsx`
- Gateway: `src/app/gateway-client.tsx`

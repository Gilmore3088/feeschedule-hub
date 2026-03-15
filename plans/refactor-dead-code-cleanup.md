# Refactor: Dead Code Cleanup

## Overview

The refactor-clean audit found 4 unused components, 1 unused type, and a stale completed plan. These are leftovers from the original "FeeSchedule Hub" waitlist-era landing page, which has since been replaced by a data-driven "Bank Fee Index" landing page with real index data.

## Findings

### Unused Components (4 files)

| Component | File | Origin | Verdict |
|-----------|------|--------|---------|
| `Hero` | `src/components/hero.tsx` | Old waitlist CTA | **DELETE** — superseded by inline hero in `page.tsx` with real data |
| `Pricing` | `src/components/pricing.tsx` | 3-tier SaaS pricing | **DELETE** — premature, uses old branding, landing page uses "Request Access" form instead |
| `FAQ` | `src/components/faq.tsx` | 6 data-cooperative questions | **DELETE** — valuable content but stale styling; extract content to landing page FAQ section |
| `HowItWorks` | `src/components/how-it-works.tsx` | 3-step process | **DELETE** — landing page Methodology section covers this ground |

### Stale Waitlist Components (still used but obsolete)

The `/waitlist` page uses two components with stale "FeeScheduleHub" branding:

| Component | File | Issue |
|-----------|------|-------|
| `Nav` | `src/components/nav.tsx` | References old "FeeScheduleHub" brand, links to nonexistent `#pricing`, `#faq` anchors |
| `Footer` | `src/components/footer.tsx` | Partially rebranded but inconsistent with current design system |

The `/waitlist` page itself is largely obsolete — the main landing page now has a "Request Access" form that serves the same purpose.

**Decision:** Migrate `/waitlist` to use `PublicNav` + `PublicFooter` (from the `(public)` route group), then delete `Nav` and `Footer`.

### Unused Type (1 export)

| Type | File | Verdict |
|------|------|---------|
| `AnalysisResult` | `src/lib/crawler-db/types.ts` | **DELETE** — no corresponding DB table exists |

### Stale Plan File (1 file)

| File | Status |
|------|--------|
| `plans/feat-fee-tier-system.md` | Already shipped — delete |

## Implementation

### Step 1: Delete 4 unused components
- [x] Delete `src/components/hero.tsx`
- [x] Delete `src/components/pricing.tsx`
- [x] Delete `src/components/faq.tsx`
- [x] Delete `src/components/how-it-works.tsx`

### Step 2: Migrate waitlist page
- [x] Update `/waitlist/page.tsx` to import `PublicNav` + `PublicFooter` instead of `Nav` + `Footer`
- [x] Delete `src/components/nav.tsx`
- [x] Delete `src/components/footer.tsx`

### Step 3: Remove unused type
- [x] Remove `AnalysisResult` interface from `src/lib/crawler-db/types.ts`

### Step 4: Clean stale files
- [x] Delete `plans/feat-fee-tier-system.md`

### Step 5: Verify
- [x] `npx next build` passes
- [x] N/A — no project-level vitest tests exist yet

## Files Deleted (7)
- `src/components/hero.tsx`
- `src/components/pricing.tsx`
- `src/components/faq.tsx`
- `src/components/how-it-works.tsx`
- `src/components/nav.tsx`
- `src/components/footer.tsx`
- `plans/feat-fee-tier-system.md`

## Files Modified (2)
- `src/app/waitlist/page.tsx` — swap Nav/Footer imports
- `src/lib/crawler-db/types.ts` — remove AnalysisResult

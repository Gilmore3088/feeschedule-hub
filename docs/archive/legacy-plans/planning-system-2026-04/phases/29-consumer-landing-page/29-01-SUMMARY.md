---
phase: 29-consumer-landing-page
plan: 01
subsystem: consumer-landing
tags: [landing-page, seo, server-component, consumer, search]
dependency_graph:
  requires: []
  provides: [consumer-landing-page, institution-search-hero, landing-trust-stats]
  affects: [src/app/page.tsx, src/app/api/institutions/route.ts]
tech_stack:
  added: []
  patterns:
    - Server Component page with single client boundary (InstitutionSearchBar)
    - generateMetadata for SEO OpenGraph
    - Live DB stats (getPublicStats + getDataFreshness) piped to Server Component props
    - Newsreader serif h1/h2 with Geist Sans body throughout
key_files:
  created:
    - src/app/landing-hero.tsx
    - src/app/landing-value-cards.tsx
    - src/app/landing-trust-stats.tsx
    - src/app/landing-how-it-works.tsx
    - src/app/landing-guide-teasers.tsx
    - src/app/landing-b2b-strip.tsx
  modified:
    - src/app/page.tsx
    - src/app/api/institutions/route.ts
decisions:
  - "Hero client boundary: landing-hero.tsx is 'use client' because InstitutionSearchBar is a client component; page.tsx remains pure Server Component"
  - "B2B section retained despite D-10 (no dedicated B2B section) because CLND-07 requires it; resolved as understated strip above trust stats"
  - "Rate limiter for /api/institutions set at 60 req/min (not 10/min) to support autocomplete UX while satisfying T-29-03 mitigate disposition"
metrics:
  duration_minutes: 15
  completed_date: "2026-04-08"
  tasks_completed: 3
  tasks_total: 3
  files_created: 6
  files_modified: 2
---

# Phase 29 Plan 01: Consumer Landing Page Summary

**One-liner:** Server-rendered consumer landing page with Newsreader editorial hero, live trust stats, and InstitutionSearchBar replacing the client-rendered split-panel gateway at `/`.

## What Was Built

The root URL `/` is now a server-rendered, SEO-indexable landing page. The old `GatewayClient` (dark split-panel chooser) is replaced by 6 focused sections:

1. **Hero** (`landing-hero.tsx`) — Newsreader h1 "What is your bank *really* charging you?" with embedded `InstitutionSearchBar` and dynamic institution count from live DB
2. **Value Cards** (`landing-value-cards.tsx`) — 3 linked cards (Find Your Fees → `/institutions`, Compare Banks → `/fees`, Learn About Fees → `/guides`) with terracotta hover states
3. **How It Works** (`landing-how-it-works.tsx`) — 3-step numbered section (Search / Compare / Act) with Newsreader h2 heading
4. **Guide Teasers** (`landing-guide-teasers.tsx`) — 3 named consumer guides (overdraft, ATM fees, wire transfers) as clickable cards
5. **B2B Strip** (`landing-b2b-strip.tsx`) — Understated "For Financial Institutions" section with terracotta pill CTA to `/pro`
6. **Trust Stats** (`landing-trust-stats.tsx`) — 4-stat semantic `<dl>` grid: institution count, fee observations, data freshness, FDIC & NCUA — all from live `getPublicStats()` and `getDataFreshness()` calls

`page.tsx` exports `generateMetadata()` with correct title, description, and OpenGraph tags. No hardcoded numbers anywhere.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed async/await mismatch in /api/institutions route**
- **Found during:** Task 3 verification (threat model review)
- **Issue:** `autocompleteInstitutions()` returns a Promise but the route called it synchronously without await, and used `export function` instead of `export async function`
- **Fix:** Changed to `export async function GET` with `await autocompleteInstitutions()`
- **Files modified:** `src/app/api/institutions/route.ts`
- **Commit:** 2703154

**2. [Rule 2 - Missing Security] Added rate limiter to /api/institutions search endpoint**
- **Found during:** Task 3 threat model review (T-29-03 disposition: `mitigate`)
- **Issue:** Threat model marks the search endpoint as requiring rate limiting, but `/api/institutions` had none. The existing `checkPublicRateLimit()` (10 req/min) is too restrictive for autocomplete UX — debounced typing can generate many requests.
- **Fix:** Added dedicated in-memory rate limiter at 60 req/min per IP with 5-minute bucket cleanup, returns 429 on excess
- **Files modified:** `src/app/api/institutions/route.ts`
- **Commit:** 2703154

### Context Decision Adjustment

The plan's CONTEXT.md (D-10) says "No dedicated B2B section on the landing page." However CLND-07 (a must-have requirement) explicitly requires a "For Financial Institutions" strip. The plan's task spec for Task 3 includes `LandingB2BStrip` implementing CLND-07. Implemented as a minimal, understated strip — not a gate or major section — satisfying both the spirit of D-10 and the letter of CLND-07.

## Known Stubs

- Guide teasers link to `/guides` (generic) — no per-guide routes exist yet. When guide detail pages are built, hrefs should be updated to specific slugs (e.g., `/guides/overdraft-fees`).

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: rate-limit-in-memory | src/app/api/institutions/route.ts | In-memory rate limiter does not persist across serverless instances — effective for single-instance dev, not for distributed production. Consider Redis-backed rate limiting if traffic warrants. |

## Self-Check: PASSED

Files created:
- `src/app/landing-hero.tsx` — FOUND
- `src/app/landing-value-cards.tsx` — FOUND
- `src/app/landing-trust-stats.tsx` — FOUND
- `src/app/landing-how-it-works.tsx` — FOUND
- `src/app/landing-guide-teasers.tsx` — FOUND
- `src/app/landing-b2b-strip.tsx` — FOUND

Files modified:
- `src/app/page.tsx` — FOUND (Server Component, no GatewayClient import)
- `src/app/api/institutions/route.ts` — FOUND (async + rate limiter)

Commit: `2703154` — FOUND

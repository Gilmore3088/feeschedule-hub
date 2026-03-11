# Launch Readiness: Bank Fee Index (bankfeeindex.com)

## Overview

Bank Fee Index has 11 public pages, an admin dashboard, a Python crawler pipeline producing 63K+ fees, and a comprehensive data taxonomy. The site is feature-rich but has critical gaps in deployment infrastructure, security hardening, error handling, and legal compliance that must be closed before going live.

This plan is ordered by priority: blockers first, then launch-day essentials, then post-launch improvements.

---

## Phase 0: Pre-Launch Blockers

These must be done before the site goes live. Without them, the site will crash, get spammed, or create legal exposure.

### 0.1 Deployment Infrastructure

**Problem:** No Dockerfile, no fly.toml, no deployment config. SQLite + better-sqlite3 requires a persistent filesystem -- Vercel serverless will not work.

**Solution:** Deploy to Fly.io with a persistent volume.

- [x] Add `output: "standalone"` to `next.config.ts`
- [x] Create `Dockerfile` (multi-stage: deps -> builder -> runner, node:20-slim)
- [x] Create `fly.toml` (single region `iad`, persistent volume at `/data`, `min_machines_running = 1`)
- [x] Create `.dockerignore` (exclude `node_modules`, `.next`, `data/`, `.git`)
- [x] Add `DB_PATH` env var support to `src/lib/crawler-db/connection.ts` (fallback to `data/crawler.db`)
- [x] Add `DB_PATH` env var support to `src/lib/auth.ts` and `src/lib/fee-actions.ts`
- [x] Create `.env.example` documenting `DB_PATH`, `NODE_ENV`
- [ ] Set up Litestream for continuous SQLite backup to S3/R2

**Files:**
- `next.config.ts` (add `output: "standalone"`)
- `Dockerfile` (new)
- `fly.toml` (new)
- `.dockerignore` (new)
- `.env.example` (new)
- `src/lib/crawler-db/connection.ts`
- `src/lib/auth.ts`
- `src/lib/fee-actions.ts`

### 0.2 Fix DB Connection Singleton

**Problem:** `getDb()` opens a new connection on every call and every caller closes it in `finally`. MEMORY.md says "singleton, never close" but the code does the opposite. Under load this causes connection churn and potential `SQLITE_BUSY` errors.

**Solution:** Make `getDb()` a true singleton. Remove all `db.close()` calls on read connections.

- [x] Rewrite `getDb()` in `src/lib/crawler-db/connection.ts` as a module-level singleton
- [x] Add `busy_timeout = 5000` pragma to read connections
- [x] Remove `finally { db.close() }` from all read-only query files (10 files, ~57 occurrences)
- [x] Keep `getWriteDb()` as open-per-action with close

**Files:**
- `src/lib/crawler-db/connection.ts`
- `src/lib/crawler-db/fees.ts`
- `src/lib/crawler-db/dashboard.ts`
- `src/lib/crawler-db/fee-index.ts`
- `src/lib/crawler-db/institutions.ts`
- `src/lib/crawler-db/market.ts`
- `src/lib/crawler-db/search.ts`
- `src/lib/crawler-db/review.ts`
- `src/lib/crawler-db/districts.ts`
- `src/lib/crawler-db/articles.ts`

### 0.3 Public Error Boundaries

**Problem:** No `error.tsx` for public routes. If the DB is unavailable or any query throws, users see the default Next.js error page with no branding or navigation.

- [x] Create `src/app/error.tsx` (root error boundary)
- [x] Create `src/app/(public)/error.tsx` (public error boundary with PublicNav/PublicFooter)
- [x] Both should show a branded "Something went wrong" page with links to homepage

### 0.4 Route Parameter Validation

**Problem:** Invalid category slugs return HTTP 200 with "no data" content. Invalid state codes do the same. Search engines will index thousands of junk URLs.

- [x] In `/fees/[category]/page.tsx`: validate category against taxonomy, call `notFound()` if invalid
- [x] In `/fees/[category]/by-state/[state]/page.tsx`: validate state code against `STATE_NAMES`, call `notFound()` if invalid
- [x] In `/fees/[category]/by-state/page.tsx`: validate category against taxonomy

### 0.5 Rate Limiting on API Endpoint

**Problem:** `/api/request-access` has no rate limiting, no CAPTCHA, no honeypot. Spam bots will find it within days.

- [x] Add IP-based in-memory rate limiter (5 requests/IP/hour) to the route handler
- [x] Add a honeypot hidden field to `RequestAccessForm` and reject submissions where it's filled
- [x] Remove `CREATE TABLE IF NOT EXISTS` from the request handler (move to a startup/migration script)
- [x] Add request body size validation (max 5KB)

**Files:**
- `src/app/api/request-access/route.ts`
- `src/components/request-access-form.tsx`

### 0.6 Legal Pages

**Problem:** The site collects PII (name, email, institution, title) and publishes financial data with no privacy policy, terms of service, or data disclaimer.

- [x] Create `/privacy` page (what PII is collected, how stored, retention period, deletion requests)
- [x] Create `/terms` page (limitation of liability, data accuracy disclaimer, acceptable use)
- [x] Add footer links to both pages in `PublicFooter`
- [x] Add data disclaimer to public footer: "Data sourced from publicly available fee schedules. Provided for informational purposes only. Verify fees directly with your institution."
- [x] Add AI disclosure to research article footer: "This analysis was generated with AI assistance and reviewed by the Bank Fee Index team."

**Files:**
- `src/app/(public)/privacy/page.tsx` (new)
- `src/app/(public)/terms/page.tsx` (new)
- `src/components/public-footer.tsx`
- `src/app/(public)/research/[slug]/page.tsx`

### 0.7 Fix Broken CTA

**Problem:** The "Request Access" button in the Fee Checker links to `/about` (methodology page) instead of the request form at `/#request-access`.

- [x] Fix link in `src/components/fee-checker.tsx` line ~214: change `/about` to `/#request-access`

---

## Phase 1: Launch-Day Essentials

These should be done before or on launch day. The site will function without them, but quality and credibility will suffer.

### 1.1 Security Headers

- [x] Add `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` to `next.config.ts`
- [x] Add `Content-Security-Policy` (self + unsafe-inline for Tailwind/JSON-LD) to `next.config.ts`
- [x] Add `poweredByHeader: false` to `next.config.ts`

### 1.2 Admin Middleware

- [x] Create `src/middleware.ts` matching `/admin/:path*` (except `/admin/login`)
- [x] Check for `fsh_session` cookie presence; redirect to login if absent
- [x] This is defense-in-depth -- per-page `requireAuth()` stays as primary check

### 1.3 Password Hashing Upgrade

- [x] Replace SHA-256 hashing in `src/lib/auth.ts` with Node.js built-in `scrypt`
- [x] Migrate existing password hashes (small user count, can reset passwords)

### 1.4 SEO Foundations

- [x] Add `metadataBase: new URL("https://bankfeeindex.com")` to root layout metadata
- [x] Add `title.template: "%s | Bank Fee Index"` to root layout
- [x] Update root layout description from institutional pitch to consumer-facing copy
- [x] Add `export const revalidate = 3600` to homepage (`src/app/page.tsx`)
- [x] Add `alternates.canonical` to all dynamic page `generateMetadata` exports
- [x] Add `/about` and `/check` to `sitemap.ts` static pages
- [x] Add `lastModified` fields to sitemap entries
- [x] Fix BreadcrumbJsonLd URL casing on by-state pages (lowercase state codes)

### 1.5 Open Graph & Social

- [x] Create `src/app/opengraph-image.tsx` (root-level default OG image, 1200x630)
- [x] Add `openGraph` and `twitter` card metadata to root layout
- [x] Add `viewport` export with `themeColor` to root layout

### 1.6 Cleanup

- [x] Delete unused boilerplate from `public/`: `vercel.svg`, `next.svg`, `file.svg`, `globe.svg`, `window.svg`
- [x] Add `apple-icon.tsx` (180x180) and `icon.tsx` (32x32 favicon) via ImageResponse
- [x] Create `src/app/manifest.ts` (basic PWA manifest)

### 1.7 Health Check Endpoint

- [x] Create `src/app/api/health/route.ts` (GET, checks DB connectivity, returns fee count)
- [ ] Wire up to UptimeRobot or BetterStack for uptime monitoring

### 1.8 Missing vitest Dev Dependencies

- [x] Add `vitest` and `vite-tsconfig-paths` to `package.json` devDependencies (currently installed but not listed -- fresh `npm install` will skip them)

---

## Phase 2: First Week Post-Launch

### 2.1 Monitoring & Analytics

- [ ] Set up Sentry error tracking (free tier, 5K errors/month)
- [ ] Set up Plausible analytics ($9/month, no cookies, no consent banner needed)
- [ ] Set up Google Search Console (verify domain, submit sitemap)
- [ ] Add custom events: fee category views, request access submissions, fee checker usage

### 2.2 Cache Invalidation

- [x] Create `src/app/api/revalidate/route.ts` (POST, bearer token auth, calls `revalidatePath()`)
- [x] Add post-crawl hook in Python crawler to call the revalidation endpoint
- [x] Consider adding an admin "Refresh Cache" button on the dashboard

### 2.3 Sitemap Quality

- [x] Filter sitemap to only include state-category combinations that have data (avoid thin content penalties)
- [x] Add `changeFrequency` and `priority` values to sitemap entries

### 2.4 Session Cleanup

- [x] Add a cron job or startup hook to delete expired sessions from the `sessions` table
- [x] Add login rate limiting (5 attempts/IP/15 minutes) to `src/app/admin/login/actions.ts`

### 2.5 Accessibility Basics

- [x] Add skip-to-content link to `PublicNav`
- [x] Add `<caption>` to data tables on fee pages
- [x] Ensure delta pills (emerald/red) have text labels, not just color
- [x] Add ARIA labels to interactive elements (mobile menu, fee checker dropdowns)

---

## Phase 3: First Month

### 3.1 Research Article Improvements

- [x] Add link support to the custom markdown renderer (`[text](url)`)
- [x] Add table and blockquote support
- [x] Add loading skeletons for `/research` and `/research/[slug]`

### 3.2 Data Dispute Mechanism

- [x] Add contact email or form for institutions to dispute fee data
- [x] Add "Report an error" link to fee detail pages
- [x] Document the dispute process on the About page

### 3.3 Performance Optimization

- [x] Refactor `/fees/[category]` to use a targeted DB query instead of fetching the entire national index
- [x] Add `'use cache'` directive with `cacheLife("hours")` to homepage
- [x] Add `stale-while-revalidate` cache headers for self-hosted deployment

### 3.4 Advanced Security

- [ ] Move CSP to nonce-based (eliminate `unsafe-inline` for scripts)
- [ ] Add backup verification (automated restore test)
- [ ] Set up staging environment on Fly.io

---

## Files Modified Summary

| Phase | File | Change |
|-------|------|--------|
| 0.1 | `next.config.ts` | Add `output: "standalone"` |
| 0.1 | `Dockerfile` | New |
| 0.1 | `fly.toml` | New |
| 0.1 | `.dockerignore` | New |
| 0.1 | `.env.example` | New |
| 0.1 | `src/lib/crawler-db/connection.ts` | DB_PATH env var |
| 0.1 | `src/lib/auth.ts` | DB_PATH env var |
| 0.1 | `src/lib/fee-actions.ts` | DB_PATH env var |
| 0.2 | `src/lib/crawler-db/connection.ts` | True singleton |
| 0.2 | 10 query files | Remove db.close() |
| 0.3 | `src/app/error.tsx` | New |
| 0.3 | `src/app/(public)/error.tsx` | New |
| 0.4 | `src/app/(public)/fees/[category]/page.tsx` | Validate category |
| 0.4 | `src/app/(public)/fees/[category]/by-state/[state]/page.tsx` | Validate state |
| 0.5 | `src/app/api/request-access/route.ts` | Rate limiting, honeypot |
| 0.5 | `src/components/request-access-form.tsx` | Honeypot field |
| 0.6 | `src/app/(public)/privacy/page.tsx` | New |
| 0.6 | `src/app/(public)/terms/page.tsx` | New |
| 0.6 | `src/components/public-footer.tsx` | Disclaimer + legal links |
| 0.6 | `src/app/(public)/research/[slug]/page.tsx` | AI disclosure |
| 0.7 | `src/components/fee-checker.tsx` | Fix CTA link |
| 1.1 | `next.config.ts` | HSTS, CSP, poweredByHeader |
| 1.2 | `src/middleware.ts` | New |
| 1.3 | `src/lib/auth.ts` | scrypt hashing |
| 1.4 | `src/app/layout.tsx` | metadataBase, title.template |
| 1.4 | `src/app/page.tsx` | Add revalidate |
| 1.4 | `src/app/sitemap.ts` | Add /about, /check, lastModified |
| 1.4 | Multiple pages | Add canonical URLs |
| 1.5 | `src/app/opengraph-image.tsx` | New |
| 1.6 | `public/` | Delete boilerplate SVGs |
| 1.6 | `src/app/manifest.ts` | New |
| 1.7 | `src/app/api/health/route.ts` | New |
| 1.8 | `package.json` | Add vitest to devDeps |
| 2.2 | `src/app/api/revalidate/route.ts` | New |

---

## Open Questions

1. **Domain:** Is `bankfeeindex.com` registered and DNS configured? Need to point to Fly.io.
2. **SSL:** Fly.io provides free SSL via Let's Encrypt. Custom domain needs CNAME/A record.
3. **Backup storage:** Where should Litestream back up to? (Cloudflare R2 is cheapest, ~$0.015/GB/month)
4. **Admin users:** Do existing SHA-256 password hashes need migration, or can we just reset the 2 seed users?
5. **Crawler schedule:** Will the Python crawler run on the same Fly.io instance, or on a separate machine?

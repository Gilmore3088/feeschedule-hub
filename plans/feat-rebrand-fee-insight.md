# Rebrand: Bank Fee Index → Fee Insight

**Type**: Enhancement (full rebrand)
**Priority**: High
**Date**: 2026-03-15

---

## Overview

Rebrand the platform from "Bank Fee Index" to "Fee Insight" across all touchpoints — code, domains, SEO, infrastructure, and documentation. The platform serves two audiences (consumers and banking professionals) from a shared database of 49 fee types across thousands of U.S. institutions.

## Brand Architecture

### Naming Convention

| Context | Format | Example |
|---------|--------|---------|
| Display text (headers, footers, copy) | Two words | Fee Insight |
| Domain / social handles / trademark | Compound | feeinsight.com / @feeinsight |
| Short name (icons, manifest, internal) | Two letters | FI |
| Legal entity | Compound | FeeInsight, Inc. |
| Index product references | Drop "Bank" | "National Fee Index" (not "National Fee Insight Index") |
| Professional portal label | Suffix | Fee Insight Pro |
| Peer/segment references | Keep descriptive | "Peer Fee Index" (not "Peer Fee Insight") |

### Domain Portfolio

| Domain | Role | Implementation |
|--------|------|----------------|
| **feeinsight.com** | Primary — serves all content | App deployed here |
| **bankfeeindex.com** | SEO bridge — permanent 301s | 1-to-1 path-preserving redirects to feeinsight.com |
| **thebankfeeindex.com** | Brand protection | 301 redirect to feeinsight.com homepage |

### Audience Segmentation (unchanged)

- **Consumer** (`/consumer`, public pages): Warm cream/terracotta branding, Newsreader serif, editorial tone
- **Professional** (`/pro`, admin): Dark/blue branding, JetBrains Mono, data-dense

---

## Decisions Required Before Implementation

### Critical (blocks work)

- [ ] **D1: Redirect infrastructure** — Serve both old + new domains from the same Fly.io app (middleware Host-header check) vs. separate redirect service vs. Cloudflare rules?
  - **Recommended**: Add `feeinsight.com` as custom domain on existing Fly.io app. Handle old-domain redirects in Next.js proxy/middleware via `Host` header check. Avoids volume migration entirely.

- [ ] **D2: Environment variable prefix** — Rename `BFI_*` → `FI_*`, or keep `BFI_*` internally?
  - **Recommended**: Keep `BFI_*` prefix in env vars. It is internal infrastructure — renaming adds deployment risk and zero user value. Document the mismatch in `.env.example`.

- [ ] **D3: Session cookie name** — Rename `fsh_session` → `fi_session`, or keep as-is?
  - **Recommended**: Keep `fsh_session`. Domain change already forces re-login. Cookie name is invisible to users. This survived the previous rebrand for the same reason.

- [ ] **D4: Fly.io app/volume naming** — Create new app `fee-insight` with volume migration, or keep `bank-fee-index` app name internally?
  - **Recommended**: Keep existing Fly.io app name. Add `feeinsight.com` as custom domain. Zero downtime, zero data risk.

### Important

- [ ] **D5: Plausible analytics continuity** — New site or domain alias?
  - **Recommended**: Use Plausible domain aliasing to track both domains under `feeinsight.com`.

- [ ] **D6: localStorage key** — Rename `bfi-theme` → `fi-theme`?
  - **Recommended**: Rename. The DarkModeToggle falls back to system preference, so no user impact. Clean up technical debt.

---

## Implementation Plan

### Phase 1: Foundation (Pre-cutover, no user-visible changes)

**Goal**: Centralize domain references, fix security concern, prepare infrastructure.

#### 1.1 Extract SITE_URL constant

Create a single source of truth for the domain:

```typescript
// src/lib/constants.ts
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://feeinsight.com";
export const BRAND_NAME = "Fee Insight";
export const BRAND_SHORT = "FI";
```

**Files to update** (replace hardcoded `"https://bankfeeindex.com"` with `SITE_URL`):

- [x] `src/app/layout.tsx:26` — metadataBase
- [x] `src/app/sitemap.ts:7` — BASE_URL
- [x] `src/app/robots.ts:12` — sitemap URL
- [x] `src/components/breadcrumb-jsonld.tsx:1` — SITE_URL constant
- [x] `src/app/(public)/fees/page.tsx:458` — JSON-LD URL
- [x] `src/app/(public)/fees/[category]/page.tsx:426,431` — JSON-LD URLs
- [x] `src/app/(public)/guides/page.tsx:217` — JSON-LD URL
- [x] `src/app/(public)/guides/[slug]/page.tsx:475` — JSON-LD URL
- [x] `src/app/(public)/institution/[id]/page.tsx:367` — JSON-LD URL
- [x] `src/app/(public)/research/page.tsx:660` — JSON-LD URL
- [x] `src/app/(public)/research/national-fee-index/page.tsx:242` — JSON-LD URL
- [x] `src/app/(public)/research/district/[id]/page.tsx:351` — JSON-LD URL
- [x] `src/app/(public)/research/state/[code]/page.tsx:340` — JSON-LD URL
- [x] `src/app/(public)/research/fee-revenue-analysis/page.tsx:318` — JSON-LD URL
- [x] `src/app/(public)/research/articles/[slug]/page.tsx:171,173` — JSON-LD author/publisher
- [x] `src/app/(public)/api-docs/page.tsx:88,101,111,127,130,133,148,158` — 8 curl example URLs
- [x] `src/app/admin/research/[agentId]/export-utils.ts:142` — HTML report footer

#### 1.2 Fix cookie secret security concern

In `src/lib/auth.ts:10`, the fallback `"dev-secret-change-in-production"` is dangerous during env var transitions:

```typescript
// Before
const secret = process.env.BFI_COOKIE_SECRET || "dev-secret-change-in-production";

// After
const secret = process.env.BFI_COOKIE_SECRET;
if (!secret && process.env.NODE_ENV === "production") {
  throw new Error("BFI_COOKIE_SECRET must be set in production");
}
const COOKIE_SECRET = secret || "dev-secret-change-in-production";
```

#### 1.3 Add canonical URLs to all pages

Currently no pages set `alternates.canonical`. Add to root layout:

```typescript
// src/app/layout.tsx
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  alternates: { canonical: "./" },
  // ...
};
```

#### 1.4 Migrate middleware.ts → proxy.ts

Next.js 16 deprecated `middleware.ts`. Run:

```bash
npx @next/codemod@canary middleware-to-proxy .
```

#### 1.5 Set up domain redirect logic

Add Host-header check to proxy for old domains:

```typescript
// src/proxy.ts (after migration)
export function proxy(request: NextRequest) {
  const host = request.headers.get("host") || "";

  if (host.includes("bankfeeindex.com") || host.includes("thebankfeeindex.com")) {
    const url = new URL(request.url);
    url.host = "feeinsight.com";
    url.protocol = "https:";
    // Use 308 for non-GET to preserve HTTP method (protects API POST endpoints)
    const status = request.method === "GET" || request.method === "HEAD" ? 301 : 308;
    return NextResponse.redirect(url, status);
  }

  // ...existing admin auth logic
}
```

#### 1.6 Add Fly.io custom domain

```bash
fly certs add feeinsight.com
fly certs add www.feeinsight.com
```

Update DNS for `feeinsight.com` to point to Fly.io app.

---

### Phase 2: Brand String Replacement (the big find-and-replace)

**Goal**: Update every user-visible brand string from "Bank Fee Index" to "Fee Insight".

#### 2.1 Metadata & SEO (22 files)

| File | Change |
|------|--------|
| `src/app/layout.tsx` | title default/template, description, openGraph siteName |
| `src/app/page.tsx` | metadata title, description |
| `src/app/consumer/layout.tsx` | metadata title default/template |
| `src/app/pro/layout.tsx` | metadata title default/template |
| `src/app/(public)/api-docs/page.tsx` | metadata title |
| `src/app/(public)/fees/[category]/page.tsx` | metadata title |
| `src/app/(public)/research/articles/[slug]/page.tsx` | metadata title |
| `src/app/(public)/research/national-fee-index/page.tsx` | metadata keyword |
| `src/app/submit-fees/page.tsx` | metadata title, description |
| `src/app/waitlist/page.tsx` | metadata title |

**Pattern**: "Bank Fee Index" → "Fee Insight" in all titles, descriptions. Template: `"%s | Fee Insight"`.

#### 2.2 Navigation & Layout brand text (7 files)

- [x] `src/app/gateway-client.tsx:56` — "Bank Fee Index" → "Fee Insight"
- [x] `src/app/(public)/layout.tsx:41,91` — header + footer brand
- [x] `src/app/consumer/layout.tsx:47,84` — header + footer brand
- [x] `src/app/pro/layout.tsx:48,96` — "BFI" → "FI" (nav logo), footer brand
- [x] `src/app/admin/layout.tsx:69` — "BFI" → "FI" (admin nav logo)
- [x] `src/app/admin/login/page.tsx:26` — login heading
- [x] `src/app/admin/page.tsx:132` — "National Bank Fee Index" → "National Fee Index"

#### 2.3 AI & Research system prompts (2 files)

- [x] `src/lib/research/agents.ts:26,43,59,71,79` — 5 system prompt occurrences
- [x] `src/lib/research/history.ts:71` — Default author column
- [x] `src/lib/crawler-db/articles.ts:95` — Default author fallback
- [x] `src/components/public/ask-widget.tsx:93` — "Powered by Bank Fee Index" → "Powered by Fee Insight"

#### 2.4 Icons & Manifest (3 files)

- [x] `src/app/manifest.ts` — `name: "Fee Insight"`, `short_name: "FI"`
- [x] `src/app/icon.tsx:28` — Change "B" letter to "FI" mark
- [x] `src/app/apple-icon.tsx:37` — Change "BFI" text to "FI"

#### 2.5 Package & Infra identifiers (3 files)

- [x] `package.json:2` — `"name": "fee-insight"`
- [x] `src/app/api/v1/fees/route.ts:64` — CSV filename: `"fee-insight.csv"`
- [x] `fee_crawler/pipeline/playwright_fetcher.py:118` — User-Agent: `"FeeInsight/1.0 (fee-benchmarking)"`

#### 2.6 localStorage key (1 file)

- [x] `src/components/dark-mode-toggle.tsx:9,20` — `"bfi-theme"` → `"fi-theme"`

#### 2.7 .env.example update (1 file)

Update comments and example values:

```env
# Fee Insight Configuration
BFI_ADMIN_PASSWORD=changeme           # (keeping BFI_ prefix for deployment stability)
BFI_ANALYST_PASSWORD=changeme
BFI_COOKIE_SECRET=replace-with-random-string
NEXT_PUBLIC_SITE_URL=https://feeinsight.com
NEXT_PUBLIC_PLAUSIBLE_DOMAIN=feeinsight.com
```

---

### Phase 3: SEO Migration (cutover day)

**Goal**: Flip the domain switch with minimal ranking disruption.

#### 3.1 Pre-cutover checklist

- [ ] Verify `feeinsight.com` in Google Search Console (same account as `bankfeeindex.com`)
- [ ] Deploy updated code to Fly.io (Phase 1 + 2 changes)
- [ ] Confirm `feeinsight.com` serves content correctly
- [ ] Confirm `bankfeeindex.com` 301-redirects to `feeinsight.com` (test with `curl -I`)
- [ ] Confirm query params and paths are preserved in redirects
- [ ] Confirm POST to `/api/revalidate` on old domain returns 308 (not 301)
- [ ] Update Python crawler's `BFI_APP_URL` env var to `https://feeinsight.com`

#### 3.2 Cutover steps (in order)

1. Deploy code with all brand updates to Fly.io
2. Verify `feeinsight.com` loads correctly
3. Verify 301 redirects from `bankfeeindex.com` work (all paths)
4. Submit new sitemap at `feeinsight.com/sitemap.xml` to GSC
5. Use Google Search Console **Change of Address** tool (bankfeeindex.com → feeinsight.com)
6. Update Plausible: add `feeinsight.com` domain alias (or rename site)
7. Update social profiles (Twitter, LinkedIn, GitHub) to reference feeinsight.com

#### 3.3 Post-cutover monitoring

- [ ] Monitor GSC daily for 30 days — check Index Coverage, crawl errors, search performance
- [ ] Verify no redirect loops (test with `curl -L -v`)
- [ ] Monitor Plausible for traffic continuity
- [ ] Check structured data validation in Google Rich Results Test
- [ ] Expect 2-4 week ranking dip, recovery within 60-90 days
- [ ] Keep 301 redirects active for minimum 1 year

---

### Phase 4: Polish & Enhancement (post-cutover)

#### 4.1 Add missing PWA icon sizes

Currently only 32x32 and 180x180. Add:

- [ ] `src/app/icon-192.tsx` — 192x192 PNG (Android PWA requirement)
- [ ] `src/app/icon-512.tsx` — 512x512 PNG (PWA splash screen)
- [ ] Consider SVG favicon (`src/app/icon.svg`) for modern browsers

Update `manifest.ts` to reference all sizes including `purpose: "maskable"` for Android.

#### 4.2 Update documentation

- [ ] `MEMORY.md` — Update brand references
- [ ] `PRD.md` — Update title and description
- [ ] `.claude/agents/data-enrichment.md` — Update "FeeSchedule Hub" reference
- [ ] `.claude/skills/audit-data/SKILL.md` — Update brand reference

#### 4.3 Add `host` to robots.ts

```typescript
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin/", "/api/"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
```

#### 4.4 UI Enhancement Opportunities

With the rebrand as a forcing function, consider these UX improvements:

- [ ] **Unified search**: The AI search bar in the public layout could be promoted more prominently with "Ask Fee Insight" branding
- [ ] **Gateway page refinement**: Update the split-screen gateway with the new brand identity — possibly a new logo mark rather than the chart-line SVG
- [ ] **Professional portal depth**: The `/pro` page could link directly to specific research reports and district analyses rather than generic capability cards
- [ ] **Consumer fee comparison**: Add an interactive "Compare Your Bank" tool on `/consumer` that lets users search by institution name
- [ ] **Mobile navigation**: Current mobile nav is hidden behind breakpoints — consider a hamburger menu with audience-aware links

---

## Risk Analysis

| Risk | Severity | Mitigation |
|------|----------|------------|
| Missed "Bank Fee Index" string in source | Medium | Run `grep -rn "Bank Fee Index\|bankfeeindex\|BFI" src/` post-deployment |
| Cookie secret falls back to dev default | **Critical** | Add production guard (Phase 1.2) before any env var changes |
| Google ranking drop > 4 weeks | Medium | Ensure 1-to-1 redirects, submit Change of Address tool, monitor GSC daily |
| Fly.io volume data loss during migration | High | Avoid by using custom domains on existing app (D4 recommendation) |
| API consumers break on redirect | Medium | Use 308 for non-GET requests; update crawler URL pre-cutover |
| Redirect loop between domains | High | Test redirect chain thoroughly before DNS cutover |
| Plausible analytics gap | Low | Set up domain alias before cutover |

## Rollback Plan

If issues arise post-cutover:
1. Revert code to use `bankfeeindex.com` as `SITE_URL`
2. Remove Host-header redirect from proxy
3. Keep `feeinsight.com` DNS active but serving the reverted brand
4. Do NOT reverse 301 redirects if Google has already crawled them (creates a loop)

---

## File Inventory (complete list of changes)

### Source code changes (~40 files)

**New files (2)**:
- `src/lib/constants.ts` — SITE_URL, BRAND_NAME, BRAND_SHORT
- `src/proxy.ts` — Migrated from middleware.ts with domain redirect logic

**Modified files (38)**:
- `src/app/layout.tsx` — metadataBase, title, description, openGraph, font body class
- `src/app/page.tsx` — metadata
- `src/app/gateway-client.tsx` — brand text
- `src/app/manifest.ts` — name, short_name
- `src/app/icon.tsx` — letter mark
- `src/app/apple-icon.tsx` — letter mark
- `src/app/robots.ts` — sitemap URL, add host
- `src/app/sitemap.ts` — BASE_URL
- `src/app/(public)/layout.tsx` — header + footer brand
- `src/app/(public)/api-docs/page.tsx` — metadata + 8 curl URLs
- `src/app/(public)/fees/page.tsx` — JSON-LD
- `src/app/(public)/fees/[category]/page.tsx` — metadata + JSON-LD
- `src/app/(public)/guides/page.tsx` — JSON-LD
- `src/app/(public)/guides/[slug]/page.tsx` — JSON-LD
- `src/app/(public)/institution/[id]/page.tsx` — JSON-LD
- `src/app/(public)/research/page.tsx` — JSON-LD
- `src/app/(public)/research/national-fee-index/page.tsx` — metadata + JSON-LD
- `src/app/(public)/research/fee-revenue-analysis/page.tsx` — JSON-LD
- `src/app/(public)/research/state/[code]/page.tsx` — JSON-LD
- `src/app/(public)/research/district/[id]/page.tsx` — JSON-LD
- `src/app/(public)/research/articles/[slug]/page.tsx` — metadata + JSON-LD
- `src/app/consumer/layout.tsx` — metadata + header + footer brand
- `src/app/pro/layout.tsx` — metadata + nav logo + footer brand
- `src/app/admin/layout.tsx` — nav logo
- `src/app/admin/login/page.tsx` — heading
- `src/app/admin/page.tsx` — dashboard heading
- `src/app/admin/research/page.tsx` — description
- `src/app/admin/research/[agentId]/export-utils.ts` — HTML report
- `src/app/submit-fees/page.tsx` — metadata
- `src/app/waitlist/page.tsx` — metadata
- `src/app/api/v1/fees/route.ts` — CSV filename
- `src/lib/auth.ts` — security guard
- `src/lib/research/agents.ts` — 5 system prompts
- `src/lib/research/history.ts` — default author
- `src/lib/crawler-db/articles.ts` — default author
- `src/components/breadcrumb-jsonld.tsx` — SITE_URL
- `src/components/public/ask-widget.tsx` — "Powered by" text
- `src/components/dark-mode-toggle.tsx` — localStorage key

**Config files (3)**:
- `package.json` — name
- `.env.example` — comments and PLAUSIBLE_DOMAIN
- `fly.toml` — add custom domain commands (app name stays)

**Python files (2)**:
- `fee_crawler/pipeline/playwright_fetcher.py` — User-Agent
- `fee_crawler/commands/seed_users.py` — brand reference in message

**Documentation (4+)**:
- `MEMORY.md`, `PRD.md`, `.claude/agents/data-enrichment.md`, `.claude/skills/audit-data/SKILL.md`

**Deleted files (1)**:
- `src/middleware.ts` — replaced by `src/proxy.ts`

---

## Success Metrics

- [ ] Zero occurrences of "Bank Fee Index" or "bankfeeindex.com" in shipped source code
- [ ] All `bankfeeindex.com/*` URLs return 301/308 to `feeinsight.com/*`
- [ ] Google Search Console shows successful Change of Address
- [ ] Organic search traffic recovers to pre-migration levels within 90 days
- [ ] All JSON-LD structured data validates with `feeinsight.com` URLs
- [ ] Build passes with no TypeScript errors
- [ ] All 120 tests pass (60 vitest + 60 pytest)

---

## References

- [Google: Site Moves with URL Changes](https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes)
- [Google: Change of Address Tool](https://support.google.com/webmasters/answer/9370220)
- [Next.js Metadata API](https://nextjs.org/docs/app/api-reference/functions/generate-metadata)
- [Next.js Redirects](https://nextjs.org/docs/app/api-reference/config/next-config-js/redirects)
- [Evil Martians: How to Favicon in 2026](https://evilmartians.com/chronicles/how-to-favicon-in-2021-six-files-that-fit-most-needs)
- [docs/solutions/architecture/dual-audience-portal-with-css-brand-propagation.md](../docs/solutions/architecture/dual-audience-portal-with-css-brand-propagation.md)

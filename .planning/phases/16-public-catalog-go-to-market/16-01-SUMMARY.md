---
phase: 16-public-catalog-go-to-market
plan: "01"
subsystem: public-seo
tags: [seo, metadata, json-ld, sitemap, methodology]
dependency_graph:
  requires: []
  provides: [methodology-seo]
  affects: [sitemap.xml, methodology-page]
tech_stack:
  added: []
  patterns: [Next.js metadata API, JSON-LD structured data, schema.org Article]
key_files:
  created: []
  modified:
    - src/app/(public)/methodology/page.tsx
    - src/app/sitemap.ts
decisions:
  - "JSON-LD object defined as module-level const rather than inline JSX for readability"
  - "SITE_URL constant used for all URL fields per threat model T-16-02 mitigation"
  - "sitemap entry placed after /check to preserve logical grouping of content pages"
metrics:
  duration: "5 minutes"
  completed: "2026-04-06"
  tasks_completed: 2
  files_modified: 2
---

# Phase 16 Plan 01: Methodology SEO Optimization Summary

OG article metadata, JSON-LD Article schema, canonical link, and sitemap entry added to the methodology page using SITE_URL constant throughout.

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Add OG metadata + JSON-LD Article schema to methodology page | 761ab0e |
| 2 | Add /methodology to sitemap with priority 0.8 | 761ab0e |

## What Was Built

**Task 1 — Methodology page SEO metadata (`src/app/(public)/methodology/page.tsx`):**
- Extended metadata export with `openGraph` block: `type: "article"`, `publishedTime: "2026-04-06T00:00:00Z"`, `authors: ["Bank Fee Index"]`, canonical `alternates.canonical` pointing to `${SITE_URL}/methodology`
- Added `twitter` card metadata with `summary_large_image`
- Added JSON-LD `<script type="application/ld+json">` as first child of `<main>` with `@type: "Article"`, author/publisher as Organization nodes, all URLs derived from `SITE_URL` constant
- All existing JSX content and styles unchanged

**Task 2 — Sitemap entry (`src/app/sitemap.ts`):**
- Added `{ url: \`${BASE_URL}/methodology\`, lastModified: now, changeFrequency: "monthly", priority: 0.8 }` to `staticPages` array, alongside `/check`

## Verification

- TypeScript: no new errors in either modified file (pre-existing merge conflict errors in unrelated `reports/generate/route.ts` are out of scope)
- Sitemap entry confirmed: `grep "methodology" src/app/sitemap.ts` returns line 18
- Metadata export includes `openGraph.type: "article"`, `openGraph.publishedTime`, canonical `alternates`
- JSON-LD script tag present with `@type: "Article"` and `SITE_URL`-derived url fields

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None. T-16-02 mitigated: all `og:url` and JSON-LD url fields derived from `SITE_URL` env var, not hardcoded strings.

## Self-Check: PASSED

- `src/app/(public)/methodology/page.tsx` — modified with OG metadata and JSON-LD script
- `src/app/sitemap.ts` — modified with /methodology entry
- Commit `761ab0e` exists in git log

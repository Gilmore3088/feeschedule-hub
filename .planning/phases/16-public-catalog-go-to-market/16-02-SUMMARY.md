---
phase: 16-public-catalog-go-to-market
plan: "02"
subsystem: public-catalog
tags: [public, catalog, reports, og-metadata, email-gate, isr, lead-capture]

dependency_graph:
  requires:
    - "Phase 13 published_reports table + report_jobs schema"
    - "Phase 13 generatePresignedUrl (src/lib/report-engine/presign.ts)"
    - "src/lib/crawler-db/connection.ts getSql()"
    - "src/lib/constants.ts SITE_URL"
    - "src/lib/format.ts timeAgo()"
  provides:
    - "GET /api/reports/catalog — public catalog with type/date filtering"
    - "POST /api/reports/email-gate — lead capture + presigned PDF download"
    - "/reports ISR-cached catalog page (revalidate=3600)"
    - "/reports/[slug] ISR-cached landing page with OG metadata"
    - "EmailGate client component for email-gated PDF download"
    - "sitemap.xml includes /reports and per-slug /reports/{slug} entries"
  affects:
    - "src/app/sitemap.ts — merged report catalog + landing page entries"

tech_stack:
  added: []
  patterns:
    - "ISR with revalidate=3600 + generateStaticParams returning [] for on-demand caching"
    - "Server-rendered form (method=GET) for catalog filter — no client JS required"
    - "artifact_key security pattern: boolean artifactExists passed to client, URL generated server-side"
    - "Lead capture INSERT ON CONFLICT DO NOTHING with non-blocking failure for missing table"

key_files:
  created:
    - src/app/(public)/reports/page.tsx
    - src/app/(public)/reports/[slug]/page.tsx
    - src/app/(public)/reports/[slug]/email-gate.tsx
    - src/app/api/reports/catalog/route.ts
    - src/app/api/reports/email-gate/route.ts
  modified:
    - src/app/sitemap.ts

decisions:
  - "Server-rendered filter form (method=GET) keeps catalog fully SSR with no client JS — pure anchor tag + form submit"
  - "generateStaticParams returns [] so slug pages are generated on first visit (ISR on-demand), not at build time"
  - "artifact_key boolean guard: EmailGate receives only artifactExists:boolean, never the key itself"
  - "Lead capture failure is non-blocking: report_leads INSERT wrapped in try/catch with warn log (table may not exist until Phase 17)"

metrics:
  duration: "~25 minutes"
  completed: "2026-04-06"
  tasks_completed: 2
  tasks_total: 2
  files_created: 5
  files_modified: 1
---

# Phase 16 Plan 02: Public Report Catalog + Landing Pages + Email Gate Summary

ISR-cached public report catalog at /reports, per-report landing pages at /reports/[slug] with LinkedIn-ready OG metadata (og:type=article), and email-gated PDF download with server-side presigned URL generation.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Public report catalog page + catalog API route | `15745ec` | reports/page.tsx, api/reports/catalog/route.ts, sitemap.ts |
| 2 | Report landing pages with OG metadata + email gate | `0d92db9` | reports/[slug]/page.tsx, email-gate.tsx, api/reports/email-gate/route.ts |

## What Was Built

### /reports Catalog Page (`src/app/(public)/reports/page.tsx`)
ISR-cached server component (revalidate=3600). Fetches directly from `published_reports` via `getSql()` — no API round-trip. Filter bar is a `<form method="GET">` with type and date-range selects — fully server-rendered, no JavaScript required for filtering. Empty state renders "No reports published yet. Check back soon." Consumer brand palette throughout (#FAF7F2 bg, #C44B2E accent, Newsreader serif headings).

### GET /api/reports/catalog (`src/app/api/reports/catalog/route.ts`)
Public endpoint returning `{ reports: [] }` for empty table. Type filter validated against `VALID_REPORT_TYPES` Set before use in sql template (T-16-03). Date filter parsed via `new Date()` with `isNaN` guard before use. Returns up to 100 records ordered by `published_at DESC`.

### /reports/[slug] Landing Page (`src/app/(public)/reports/[slug]/page.tsx`)
ISR-cached (revalidate=3600). `generateStaticParams` returns `[]` — pages built on first visit. `generateMetadata` exports full OG metadata including `og:type: "article"`, `publishedTime`, `authors: ["Bank Fee Index"]`, and canonical URL. Publicly visible sections: breadcrumb, type eyebrow, h1 title, byline, executive summary placeholder (italic), and 2 chart placeholder boxes (bg-[#F5F0E8], 192px height, 2-column grid on wide screens). Bottom section mounts `<EmailGate>` client component.

### EmailGate Client Component (`src/app/(public)/reports/[slug]/email-gate.tsx`)
"use client". Props: `{ slug: string; artifactExists: boolean }`. Four states: idle/submitting/success/error. Client-side email regex validation before network call. POSTs to `/api/reports/email-gate`. Success state shows download link with 1-hour expiry note. When `artifactExists=false`, shows pending message instead of form.

### POST /api/reports/email-gate (`src/app/api/reports/email-gate/route.ts`)
Server-side validation: email regex (T-16-04), slug lookup against `published_reports WHERE is_public=true` (T-16-05). Returns 400 for invalid email, 404 for unknown/private slug, 202 if `artifact_key` is null. Lead capture via `INSERT INTO report_leads ON CONFLICT (email, slug) DO NOTHING` wrapped in try/catch — non-blocking if table missing (Phase 17 TODO). Presigned URL generated via `generatePresignedUrl(artifact_key, 3600)` — artifact_key never returned to client (T-16-06). Rate limit headers added but not enforced (T-16-07 accept disposition).

### Sitemap Updates (`src/app/sitemap.ts`)
Added static `/reports` entry (priority 0.9, daily). Added dynamic per-slug entries from `published_reports WHERE is_public=true` (priority 0.8, monthly) wrapped in try/catch for graceful degradation when table is empty.

## Deviations from Plan

None — plan executed exactly as written. All threat mitigations from the STRIDE register applied as specified (T-16-03 through T-16-07).

## Known Stubs

| Stub | File | Reason |
|------|------|--------|
| Executive summary placeholder text | `src/app/(public)/reports/[slug]/page.tsx` | `data_manifest.queries` doesn't contain a summary field per the DataManifest type; plan explicitly accepts this as placeholder for v2.0 |
| `report_leads` INSERT | `src/app/api/reports/email-gate/route.ts` | Migration not in Phase 16 scope; wrapped in try/catch per plan spec |

## Threat Surface Scan

All surfaces in the plan's threat model. No new surfaces introduced beyond what was planned.

## Self-Check: PASSED

Files confirmed present:
- FOUND: src/app/(public)/reports/page.tsx
- FOUND: src/app/(public)/reports/[slug]/page.tsx
- FOUND: src/app/(public)/reports/[slug]/email-gate.tsx
- FOUND: src/app/api/reports/catalog/route.ts
- FOUND: src/app/api/reports/email-gate/route.ts
- FOUND: src/app/sitemap.ts (modified)

Commits confirmed:
- FOUND: 15745ec (feat(16-02): public report catalog page + catalog API route)
- FOUND: 0d92db9 (feat(16-02): report landing pages with OG metadata + email gate)

TypeScript: `npx tsc --noEmit` passes with no new errors (pre-existing merge conflict in api/reports/generate/route.ts is out of scope).

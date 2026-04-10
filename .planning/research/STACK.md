# Stack Research

**Domain:** Two-sided B2B + Consumer experience — Bank Fee Index v6.0
**Researched:** 2026-04-07
**Confidence:** HIGH — existing stack verified from package.json; new additions verified via official docs and multi-source cross-check

---

## What This Stack Covers

This document covers **only the additions** needed for the v6.0 Two-Sided Experience milestone.
The existing stack is already production-validated and is NOT reconsidered here.

The additions span four areas:

1. **PDF report generation** — pro user downloads (peer briefs, annual summaries, competitive snapshots)
2. **SEO for consumer pages** — dynamic metadata, OG images, structured data for institution pages
3. **Per-audience analytics** — tracking consumer vs B2B funnels in Plausible
4. **No new routing infrastructure** — App Router route groups are already in place

---

## Existing Stack — Already Installed (Reference Only)

| Package | Installed Version | Role |
|---------|------------------|------|
| next | 16.1.6 | Framework |
| react / react-dom | 19.2.3 | UI |
| tailwindcss | ^4 | CSS |
| shadcn / radix-ui | ^3.8.4 / ^1.4.3 | Component primitives |
| recharts | ^3.7.0 | Charts |
| geist | ^1.7.0 | Font |
| stripe | ^20.4.1 | Payments |
| postgres | ^3.4.8 | DB client |
| ai + @ai-sdk/anthropic | ^6.0.116 / ^3.0.58 | AI streaming |
| @anthropic-ai/sdk | ^0.80.0 | Direct Anthropic client |
| zod | ^4.3.6 | Validation |
| lucide-react | ^0.564.0 | Icons |
| class-variance-authority | ^0.7.1 | Component variants |

---

## Routing Architecture — Zero New Dependencies

### Route Groups Already Exist

Inspection of `src/app/` confirms the two-sided architecture is already structurally present:

```
src/app/
  (auth)/          — login, register
  (landing)/       — marketing / consumer entry; has its own layout.tsx
  (public)/        — consumer-facing pages: institutions, fees, guides, districts
  admin/           — internal ops (untouched by this milestone)
  pro/             — B2B subscriber dashboard (launchpad, Hamilton, peers, reports)
  consumer/        — consumer-specific flows
```

**Implication:** The milestone work is populating these route groups with purpose-built layouts, navigation, and page content — not restructuring. Route group boundaries are already drawn.

### Audience Separation Pattern

Each audience gets an independent layout with no shared nav component:

- `(public)/layout.tsx` — consumer nav (wordmark, Fee Scout search, free account CTA)
- `pro/layout.tsx` — B2B nav (Hamilton, Peer Builder, Reports, Federal Data, account)

Middleware reads the session role to decide which layout receives the user. No extra
middleware package needed — Next.js built-in `middleware.ts` (already in use for auth)
handles role checks and redirects.

---

## New Dependencies Required

### 1. PDF Report Generation — `@react-pdf/renderer`

**Why needed:** Pro users need downloadable peer briefs, annual summaries, and competitive
snapshots. These must render as professional consulting deliverables — not browser print
stylesheets.

**Why `@react-pdf/renderer` over Puppeteer:**

Puppeteer on Vercel requires `@sparticuz/chromium` (50MB+ binary), risks hitting Vercel's
250MB function bundle limit, runs 4-8x slower in serverless environments, and requires a
Vercel Pro plan to raise the timeout above 10 seconds (PDF generation typically needs 30-60s
on serverless Chromium). Community reports confirm this is a painful deployment path.

`@react-pdf/renderer` generates PDFs natively in Node.js using React component syntax. No
headless browser, no binary, no serverless size constraint. Server-side rendering via
`renderToBuffer()` in an API route is fast (under 5 seconds for a multi-page report).

Supports: custom fonts, tables, SVG, multi-column layout, page breaks, headers/footers.

**React 19 support:** confirmed since v4.1.0. Current stable version: 4.3.3 (actively
maintained, 860K+ weekly downloads as of April 2026, 15,900+ GitHub stars).

**Integration note:** PDF components use their own primitive system (`Document`, `Page`,
`View`, `Text`, `Image`) — NOT Tailwind utilities. Build report layouts as standalone React
components in `src/lib/reports/`. These components consume the same data functions used by
the web UI but are styled independently. Recharts SVG charts cannot render inside
`@react-pdf/renderer` directly — render charts to PNG server-side first, then embed as
`<Image>` (see Pitfalls file).

**Required config addition:**

```typescript
// next.config.ts — add to experimental block
experimental: {
  serverComponentsExternalPackages: ['@react-pdf/renderer'],
}
```

**API route pattern:**

```typescript
// src/app/api/reports/generate/route.ts
import { renderToBuffer } from '@react-pdf/renderer'
import { PeerBriefDocument } from '@/lib/reports/peer-brief'

export async function POST(req: Request) {
  const data = await fetchReportData(req)
  const buffer = await renderToBuffer(<PeerBriefDocument data={data} />)
  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="peer-brief.pdf"',
    },
  })
}
```

| Package | Version | Purpose |
|---------|---------|---------|
| @react-pdf/renderer | ^4.3.3 | Server-side PDF generation for pro report downloads |

```bash
npm install @react-pdf/renderer
```

---

### 2. SEO for Consumer Pages — Built-in Next.js APIs (Zero New Packages)

**Why no package needed:** Next.js 16 App Router ships first-class SEO APIs that replace
libraries like `next-seo` and `react-helmet`. Adding either creates conflicts and technical
debt.

**`generateMetadata()` — per-page dynamic metadata:**

Every consumer page (`/institution/[slug]`, `/fees/[category]`, `/guides/[slug]`) uses
`generateMetadata({ params })` to produce title, description, and canonical URL from database
data. This runs server-side at request time for dynamic routes.

```typescript
// src/app/(public)/institution/[slug]/page.tsx
export async function generateMetadata({ params }: { params: { slug: string } }) {
  const institution = await getInstitution(params.slug)
  return {
    title: `${institution.name} Fee Schedule — Bank Fee Index`,
    description: `${institution.name} charges for checking, savings, overdraft, and wire transfers. Compare to ${institution.charter === 'bank' ? 'bank' : 'credit union'} peers.`,
    openGraph: {
      title: institution.name,
      description: `Fee data for ${institution.name}`,
      url: `https://bankfeeindex.com/institution/${params.slug}`,
    },
  }
}
```

**`ImageResponse` from `next/og` — dynamic OG images:**

Built into Next.js. Zero install. Generates institution-specific share preview images at
the edge via JSX. Cached on CDN after first generation.

```typescript
// src/app/(public)/institution/[slug]/opengraph-image.tsx
import { ImageResponse } from 'next/og'
export default function OgImage({ params }) {
  return new ImageResponse(
    <div style={{ ... }}>{institution.name} — Fee Intelligence</div>,
    { width: 1200, height: 630 }
  )
}
```

**JSON-LD structured data — inline `<script>` in Server Components:**

No library needed. Add `FinancialService` schema to institution pages as an inline
`application/ld+json` script rendered server-side. Create a typed helper:

```typescript
// src/lib/seo.ts
export function buildInstitutionSchema(institution: Institution) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FinancialService',
    name: institution.name,
    url: institution.website_url,
    address: { '@type': 'PostalAddress', addressRegion: institution.state },
    description: `Fee data and peer benchmarks for ${institution.name}`,
  }
}
```

**`schema-dts` (optional dev dependency):** Provides TypeScript types for Schema.org
vocabulary. Zero runtime impact (types only). Recommended if structured data is applied
to more than 3-4 schema types.

```bash
npm install -D schema-dts
```

| Package | Install | Purpose | When to Use |
|---------|---------|---------|-------------|
| schema-dts | dev only | TypeScript types for JSON-LD Schema.org | Add if structured data grows beyond institution + article + breadcrumb schemas |

---

### 3. Per-Audience Analytics — `next-plausible`

**What exists:** `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` env var is configured and `next.config.ts`
already permits Plausible's CSP domains. Plausible is already the chosen analytics platform.

**What's missing:** The `next-plausible` npm package. The current integration likely relies on
a raw `<script>` tag. The package provides a `PlausibleProvider` component and a
`usePlausible()` hook that enables custom property tracking — the mechanism for segmenting
consumer vs B2B traffic in the Plausible dashboard.

**Custom property pattern for audience segmentation:**

Plausible supports up to 30 custom properties per event. Attach `audience` and `plan` to
every pageview to enable dashboard filtering by segment.

```typescript
// src/app/(public)/layout.tsx — consumer layout
import PlausibleProvider from 'next-plausible'
export default function ConsumerLayout({ children }) {
  return (
    <PlausibleProvider domain="bankfeeindex.com" taggedEvents>
      {children}
    </PlausibleProvider>
  )
}

// src/app/(public)/institution/[slug]/page.tsx — fire audience prop
'use client'
import { usePlausible } from 'next-plausible'
const plausible = usePlausible()
plausible('pageview', { props: { audience: 'consumer', page_type: 'institution' } })
```

For the B2B pro layout, fire `audience: 'b2b'` and `plan: user.role`. This allows the
Plausible dashboard to be filtered to show funnel behavior per audience without any backend
tracking infrastructure.

| Package | Version | Purpose |
|---------|---------|---------|
| next-plausible | ^3.12.0 | Plausible integration with custom property support for audience segmentation |

```bash
npm install next-plausible
```

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `puppeteer` / `puppeteer-core` + `@sparticuz/chromium` | 250MB Vercel bundle risk, 4-8x slower in serverless, requires Pro plan for 60s timeout, complex deployment | `@react-pdf/renderer` server-side |
| `jspdf` / `html2canvas` | Client-side PDF via canvas screenshots — poor quality, leaks sensitive fee data to browser memory, cannot be stored or emailed server-side | `@react-pdf/renderer` server-side API route |
| `next-seo` | Deprecated pattern for App Router. Conflicts with built-in `generateMetadata()` API introduced in Next.js 13. | `generateMetadata()` built-in |
| `react-helmet` | Client-side head management — incompatible with React 19 Server Components, App Router handles head server-side | `generateMetadata()` built-in |
| `posthog-js` | Adds client bundle weight, session recording, and pricing overhead for a problem that Plausible + custom properties already solves | `next-plausible` with custom properties |
| LaunchDarkly / Split.io | Enterprise feature-flag services starting at $500+/mo. Two fixed audience tiers controlled by session role don't need a flag service. | Middleware role check + session cookie |
| `styled-components` / Emotion | CSS-in-JS runtime conflicts with Tailwind v4's PostCSS pipeline. Any new component styling uses Tailwind + CVA (already installed). | Tailwind v4 + CVA (already installed) |
| Any headless CMS | Institution educational content is generated from pipeline-verified data (Call Reports, fee index, FDIC/NCUA). CMS adds editorial overhead with no data accuracy benefit. | Server components fetching from PostgreSQL |
| `i18next` / `react-intl` | No internationalization requirement. Currency formatting uses existing `formatAmount()` in `src/lib/format.ts`. | Existing format utilities |

---

## Patterns by Feature Area

### Consumer Landing Page Redesign

No new packages.

- `(landing)/layout.tsx` — consumer nav, no admin chrome
- `generateMetadata()` on the landing page for Twitter/OG
- `ImageResponse` from `next/og` for social share image at `(landing)/opengraph-image.tsx`
- Recharts (existing) for any fee snapshot visualizations
- A/B testing (see below): middleware cookie + two static page variants

### Institution Educational Pages

No new packages.

- `(public)/institution/[slug]/page.tsx` — already exists as a route
- `generateMetadata({ params })` — fetch institution name and charter for title/description
- JSON-LD `FinancialService` schema in inline `<script>` within the server component
- Existing `getNationalIndex()` + peer filter queries for fee context panels
- Consumer guide cross-links via `src/lib/fee-taxonomy.ts` (category → guide mapping)

### B2B Personalized Launchpad

No new packages.

- `pro/layout.tsx` — B2B nav with four doors: Hamilton, Peer Builder, Reports, Federal Data
- `getCurrentUser()` (existing) in layout for session check and redirect
- User's primary institution stored as `primary_institution_id` on `users` table — extend schema
- Personalization data (Call Reports scoped to user's institution, district Beige Book) fetched
  via existing DB query functions at server component render time

### Scoped Report Generation (Pro)

Requires `@react-pdf/renderer` only.

- `POST /api/reports/generate` — API route, server-side, returns PDF buffer
- Report component tree lives in `src/lib/reports/` — pure `@react-pdf/renderer` components
- Data injected from existing `getNationalIndex()`, `getPeerIndex()`, Call Report queries
- Client triggers via `<a href="/api/reports/generate?type=peer-brief&id=..." download>`
- Three initial report types: peer-brief, annual-summary, competitive-snapshot

### Distinct Navigation Per Audience

No new packages.

- Two independent layout files: `(public)/layout.tsx` (consumer) and `pro/layout.tsx` (B2B)
- Replicate existing `AdminNav` pattern — `ConsumerNav` and `ProNav` as client components
- Active state via `usePathname()` (already used in `AdminNav`)
- Existing `DarkModeToggle` component included in both layouts

### A/B Testing (Consumer Landing Page)

No external A/B service. Middleware-native approach.

The project already has `middleware.ts` for auth. Extend it:

```typescript
// Cookie-based variant assignment — flicker-free, edge-rendered
const variant = request.cookies.get('landing_ab')?.value
  ?? (Math.random() < 0.5 ? 'a' : 'b')

response.cookies.set('landing_ab', variant, { maxAge: 60 * 60 * 24 * 30, path: '/' })
// next.rewrite() to variant-specific page
```

Conversion tracking via Plausible custom event:
```typescript
plausible('landing_cta', { props: { variant: cookieValue, cta: 'free-trial' } })
```

This is sufficient for a two-variant test at current scale. Add an external service (PostHog,
Statsig) only if the team needs multi-variate tests, statistical significance dashboards, or
persistent cohort tracking.

---

## Version Compatibility

| Package | Version | Compatible With | Notes |
|---------|---------|-----------------|-------|
| @react-pdf/renderer | ^4.3.3 | React 19 (since v4.1.0), Next.js 14.1.1+ | Requires `serverComponentsExternalPackages` in next.config.ts |
| next-plausible | ^3.12.0 | Next.js 13+ App Router | `PlausibleProvider` goes in audience-specific layout.tsx |
| schema-dts | ^1.1.2 | TypeScript 5, dev-only | Zero runtime impact; provides `FinancialService`, `Article`, `BreadcrumbList` types |

---

## Installation Summary

```bash
# Production additions
npm install @react-pdf/renderer next-plausible

# Dev additions (optional — for type-safe JSON-LD)
npm install -D schema-dts
```

**next.config.ts addition:**

```typescript
experimental: {
  serverComponentsExternalPackages: ['@react-pdf/renderer'],
},
```

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| PDF generation | @react-pdf/renderer | Puppeteer + @sparticuz/chromium | Bundle size risk (250MB limit), 4-8x slower serverless, requires Vercel Pro for timeout; confirmed by multiple deployment reports |
| PDF generation | @react-pdf/renderer | jsPDF + html2canvas | Client-side only, canvas screenshot quality is poor, exposes data to browser |
| SEO metadata | generateMetadata() built-in | next-seo | Deprecated for App Router; conflicts with built-in API |
| SEO metadata | generateMetadata() built-in | react-helmet | Incompatible with Server Components in React 19 |
| Analytics segmentation | next-plausible + custom props | PostHog | Overkill for two audience segments; PostHog adds session recording bundle weight and pricing |
| A/B testing | Middleware cookie + Plausible | Statsig / LaunchDarkly | Enterprise pricing, external dependency for a simple two-variant test |
| Structured data types | schema-dts (dev dep, optional) | Inline typed helpers | schema-dts is cleaner if > 3 schema types; inline helpers fine for < 3 |

---

## Sources

- npmjs.com/@react-pdf/renderer — v4.3.3 confirmed current, React 19 support confirmed since v4.1.0 (HIGH confidence)
- github.com/diegomura/react-pdf/issues/2460 — `serverComponentsExternalPackages` requirement for Next.js App Router confirmed (HIGH confidence)
- vercel.com/kb/guide/deploying-puppeteer-with-nextjs-on-vercel — 250MB bundle limit, 10s hobby timeout, 4-8x slowdown confirmed (HIGH confidence — official Vercel KB)
- nextjs.org/docs/app/getting-started/metadata-and-og-images — `generateMetadata()` and `ImageResponse` confirmed built-in to Next.js App Router (HIGH confidence)
- nextjs.org/docs/app/api-reference/file-conventions/route-groups — route groups confirmed as zero-dependency App Router feature (HIGH confidence)
- plausible.io/docs/custom-props/for-pageviews — custom property segmentation confirmed, up to 30 properties per event (HIGH confidence)
- github.com/4lejandrito/next-plausible — next-plausible library, App Router compatible (MEDIUM confidence — community library, well-maintained)
- dev.to/bean_bean/nextjs-middleware-in-2026 — edge middleware variant assignment pattern (MEDIUM confidence — community source, consistent with official Vercel A/B template)
- vercel.com/templates/next.js/ab-testing-simple — Vercel's official A/B testing template using middleware cookies (HIGH confidence)
- react-pdf.org/compatibility — Node.js and React compatibility matrix confirmed (HIGH confidence)

---

*Stack research for: Bank Fee Index v6.0 Two-Sided Experience*
*Researched: 2026-04-07*

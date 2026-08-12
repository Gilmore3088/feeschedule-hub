---
title: "Dual-Audience Portal with CSS Brand Propagation"
slug: dual-audience-portal-css-brand-propagation
category: architecture
severity: n/a
component: public-site
tags: [next-js, routing, css-overrides, branding, multi-audience, tailwind]
date_solved: "2026-03-15"
symptoms:
  - Single landing page serving both consumers and professionals
  - No audience-specific navigation or branding
  - Public pages (/fees, /research) use cold slate palette inconsistent with consumer portal
root_cause: >
  The site had a single public-facing design serving two distinct audiences
  (consumers and banking professionals) with different needs, revenue models,
  and optimal UX. When audience-specific portals were created, the shared
  public pages under the (public) route group retained their original cold
  slate/blue styling, breaking visual continuity with the warm consumer brand.
resolution: css-override-scoping
related_files:
  - src/app/page.tsx
  - src/app/gateway-client.tsx
  - src/app/consumer/page.tsx
  - src/app/pro/page.tsx
  - src/app/(public)/layout.tsx
  - src/app/globals.css
  - src/app/layout.tsx
---

## Problem

The Bank Fee Index site needed to serve two distinct audiences:

1. **Consumers** -- care about competitive fee analysis, guides, and institution lookup. Revenue via reach/exposure.
2. **Professionals** -- care about indexing, peer benchmarks, research, and API access. Revenue via data subscriptions and consulting.

A single generic landing page couldn't effectively serve either audience. Additionally, once audience-specific portals were created, navigating from `/consumer` to shared pages like `/fees` or `/research` produced a jarring visual shift from warm branding back to cold slate.

## Solution

### 1. Gateway Split-Screen Landing Page

Replaced the single landing page (`src/app/page.tsx`) with a dark ambient split-screen that presents two portals:

- **Left panel**: warm cream (#FAF7F2), Newsreader serif font, terracotta accents (#C44B2E) -- links to `/consumer`
- **Right panel**: dark (#0C0F1A), JetBrains Mono, blue accents -- links to `/pro`

Hover expands the hovered panel (flex ratio 1.2/0.8) with smooth cubic-bezier transitions. Ambient radial glows respond to hover state.

**Key decision**: Made this a client component (`gateway-client.tsx`) for hover state, imported by a server component page wrapper for metadata.

### 2. Font Loading Strategy

Added `Newsreader` (editorial serif) and `JetBrains_Mono` (technical mono) via `next/font/google` in the root layout, exposed as CSS variables `--font-newsreader` and `--font-jetbrains`. This makes them available everywhere without per-layout imports.

### 3. Route Structure

**Failed approach**: Route groups `(consumer)` and `(pro)` -- caused Next.js error "You cannot have two parallel pages that resolve to the same path" since both had `page.tsx` files resolving to `/`.

**Working approach**: Regular route segments `src/app/consumer/` and `src/app/pro/` with their own layouts. These are audience-specific landing pages, not route groups wrapping shared content.

The shared content pages remain under `src/app/(public)/` with the existing route group.

### 4. CSS Brand Propagation (Key Technique)

Rather than editing every public page file to change slate/blue classes to warm equivalents, added a `.consumer-brand` CSS class to the `(public)` layout wrapper and wrote ~80 scoped CSS override rules in `globals.css`:

```css
/* Backgrounds */
.consumer-brand .bg-white { background-color: #FDFBF8; }
.consumer-brand .bg-slate-50 { background-color: #F5EFE6; }

/* Text hierarchy */
.consumer-brand .text-slate-900 { color: #1A1815; }
.consumer-brand .text-slate-500 { color: #7A7062; }

/* Accent swap: blue → terracotta */
.consumer-brand .text-blue-600 { color: #C44B2E; }
.consumer-brand .hover\:text-blue-600:hover { color: #A93D25; }

/* Group-hover (Tailwind v4 pattern) */
.consumer-brand .group:hover .group-hover\:text-blue-600 { color: #A93D25; }

/* Headings auto-serif */
.consumer-brand h1, .consumer-brand h2 {
  font-family: var(--font-newsreader), Georgia, serif;
}
```

**Why this works**: CSS specificity of `.consumer-brand .bg-white` naturally beats `.bg-white` alone. In Tailwind v4, utility classes aren't in a special low-specificity layer, so parent-scoped overrides win.

**Coverage required**: backgrounds (white, slate-50 through slate-200, fractional opacities), borders (slate-100 through slate-300), text (slate-300 through slate-900), accent colors (blue-50 through blue-900, amber variants), hover states (escaped Tailwind classes like `hover\:text-blue-600`), group-hover states, focus states, gradient stops, and special elements (table headers, skeletons, range bars).

### 5. Data Enrichment

Both portal pages pull real data via existing DB functions:

**Consumer** (`getPeerIndex()` for bank vs CU comparison, `getStatesWithFeeData()` for geographic coverage, derived insights like annual maintenance cost and combined overdraft+NSF cost).

**Professional** (`getPeerIndex()` for charter segmentation table, `getTierFeeRevenueSummary()` for fee-to-revenue correlation cards).

## Prevention

### When adding new Tailwind color classes to public pages

Any new slate/blue utility classes used in `(public)` pages need corresponding overrides in the `.consumer-brand` CSS block in `globals.css`. Check for:
- New background/text/border colors
- New hover/focus/group-hover states
- Fractional opacity variants (e.g., `bg-slate-50/70`)

### When creating multi-audience experiences in Next.js App Router

- Don't use route groups if both need `page.tsx` at the same path level
- Use regular route segments for audience portals, route groups for shared layout wrapping
- Prefer CSS scoping over per-file edits for palette changes across many pages

### Testing color propagation

Visually check at minimum: `/fees`, `/fees/[category]`, `/research`, `/guides/[slug]`, `/institution/[id]` -- these have the widest variety of Tailwind color classes.

## Color Reference

| Role | Cold (original) | Warm (consumer) |
|------|-----------------|-----------------|
| Page bg | white | #FDFBF8 |
| Section alt | slate-50 | #F5EFE6 |
| Border | slate-200 | #E8DFD1 |
| Primary text | slate-900 | #1A1815 |
| Secondary text | slate-500 | #7A7062 |
| Muted text | slate-400 | #A09788 |
| Link/accent | blue-600 | #C44B2E (terracotta) |
| Hover accent | blue-700 | #A93D25 |
| Card hover bg | blue-50/30 | #FDF0ED/30 |

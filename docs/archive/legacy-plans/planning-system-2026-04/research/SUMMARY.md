# Project Research Summary

**Project:** Bank Fee Index v6.0 — Two-Sided Experience
**Domain:** Consumer fintech education + B2B financial intelligence (dual-audience UX split on existing Next.js monolith)
**Researched:** 2026-04-07
**Confidence:** HIGH

## Executive Summary

Bank Fee Index v6.0 adds distinct consumer and B2B experiences to a production-grade Next.js 16 App Router monolith. The existing codebase is structurally further along than a greenfield project: route groups `(public)/` and `pro/` already exist, Hamilton agents are operational, all 49 fee categories are classified, peer index queries are built, Call Report data is in Postgres, and the Beige Book is ingested. The v6.0 milestone is primarily a UX and access-control project — the data layer is largely ready; the job is surfacing it correctly per audience and building the missing output layer (PDF reports).

The recommended approach is audience-shell architecture: each audience (consumer, B2B) gets its own `layout.tsx` that owns chrome (nav, footer, personalization), while all data components and DB query functions remain shared. The critical sequencing insight from architecture research is to build the two layout shells and nav components first, then populate them with pages — not the other way around. This avoids the main failure mode of this type of project, which is building audience-specific page content before the shared boundaries are settled, leading to component duplication that becomes structural technical debt.

The top risks are (1) SEO regression if existing consumer URL paths are moved instead of redesigned in-place — `/fees/`, `/institution/`, and `/guides/` paths are already indexed and must never acquire audience prefixes; (2) Hamilton agent security gaps if new pro-facing agents are added without explicit `requiredRole` enforcement at the API layer; and (3) uncontrolled AI report generation costs when pro users can trigger on-demand Claude runs without per-user daily limits. All three risks have concrete preventions and must be addressed before the phases that introduce them.

---

## Key Findings

### Recommended Stack

The existing stack requires only three additions for v6.0. The framework, DB client, AI SDK, Stripe, and all component libraries are already installed and production-validated. New dependencies are minimal by design: `@react-pdf/renderer` (v4.3.3) for server-side PDF generation, `next-plausible` (v3.12.0) for audience-segmented analytics, and optionally `schema-dts` as a dev dependency for typed JSON-LD structured data on institution pages.

Puppeteer was explicitly evaluated and rejected for PDF generation: it hits Vercel's 250MB bundle limit, requires a Vercel Pro plan for the 60-second timeout PDF generation needs, and runs 4-8x slower in serverless environments. `@react-pdf/renderer` generates PDFs natively in Node.js using React component syntax with no headless browser dependency. SEO metadata (dynamic titles, OG images, JSON-LD) uses Next.js 16 built-in APIs (`generateMetadata()`, `ImageResponse` from `next/og`) — no additional packages required.

**Core technologies (additions only):**
- `@react-pdf/renderer` ^4.3.3: server-side PDF generation for pro report downloads — only viable serverless PDF option for Vercel; requires `serverComponentsExternalPackages` in next.config.ts
- `next-plausible` ^3.12.0: Plausible integration with custom property support — enables consumer vs. B2B funnel tracking without PostHog overhead
- `schema-dts` ^1.1.2 (dev only): TypeScript types for JSON-LD Schema.org — zero runtime impact; add if structured data grows beyond 3 schema types
- `generateMetadata()` + `ImageResponse` (built-in Next.js): per-page SEO metadata and dynamic OG images — no external SEO library needed or acceptable

### Expected Features

**Must have — v6.0 launch (table stakes):**
- Consumer landing page with value-prop hero and embedded Fee Scout with no auth gate — current split-panel gateway is the #1 acquisition blocker
- Remove auth gate from anonymous consumer search — platforms that gate search see 40-60% higher bounce rates
- Institution educational pages with "why does this matter?" callouts per fee category — transforms raw data into consumer product
- Peer percentile indicator per fee on institution pages ("higher than 72% of similar banks")
- B2B launchpad with four-door layout: Hamilton, Peer Builder, Reports, Federal Data
- Subscriber profile with institution + district fields — prerequisite for all B2B personalization
- Report history table + list view — generated reports must be retrievable between sessions
- Distinct consumer nav and B2B nav as separate components — current `CustomerNav` conditional branching is not sustainable

**Should have — v6.1 (differentiators):**
- PDF export for Hamilton reports — first B2B subscriber will ask "how do I share this?"
- Personalized Beige Book digest on B2B launchpad by district
- Structured scope form for report generation (per report type) — prevents inconsistent free-form Hamilton output
- Fee distribution chart on institution pages (Recharts histogram, institution marker)
- B2B launchpad peer snapshot panel with live peer index teaser

**Defer — v7+ (not essential for launch):**
- CFPB complaint data on institution pages — requires new API integration, not core to fee data value prop
- Fee history timeline — needs `fee_change_events` data coverage to grow first
- "Banks near you charging less" consumer suggestion — affiliate/geo logic is a separate product layer
- Report versioning / re-run with fresh data — power feature for established subscriber base
- Hamilton annotation layer before export — validate PDF export proves popular first

### Architecture Approach

The codebase already has the right structural bones but has not completed the separation. `pro/layout.tsx` currently imports `CustomerNav` — the same nav as `(public)/layout.tsx`. The auth guard is duplicated in individual pro page components rather than centralized in the layout. The milestone work is completing the architectural intent already present in the route structure: give each audience an independent layout shell, centralize the auth guard in `pro/layout.tsx`, extract a `personalization.ts` service for deriving district/institution context from the User type, and build `ProNav` as a separate component from `ConsumerNav`.

**Major components:**
1. `pro/layout.tsx` — centralized auth guard (`canAccessPremium`) + ProNav + PersonalizationBanner; protects all `/pro/*` routes in one place; eliminates per-page auth guard duplication
2. `src/lib/personalization.ts` — pure function `derivePersonalizationContext(user)` mapping User fields to district/institution display context; no DB call; consumed by all pro dashboard components
3. `src/lib/access.ts` — extend with `canAccessReportType(user, reportType)` gating peer_brief/state_index/monthly_pulse for pro users vs. full set for admin
4. `src/lib/reports/` — `@react-pdf/renderer` component tree; report layouts consume existing DB query functions; render via `POST /api/reports/generate`
5. `src/components/consumer/nav.tsx` / `src/components/pro/nav.tsx` — two distinct nav components replacing the conditional-branch pattern in `CustomerNav`
6. `(public)/page.tsx` — consumer landing page as a Server Component (ISR, no "use client") replacing the client-rendered GatewayClient for organic traffic

**Build order (dependency-driven):**
`personalization.ts` → `access.ts` extension → `pro/layout.tsx` auth guard → `ProNav` → `ConsumerNav` rename → `PersonalizationBanner` → `ProDashboard` four-door refactor → consumer landing → report scoping → institution page educational layer

### Critical Pitfalls

1. **SEO regression from URL restructuring** — Never add `/consumer/` or `/pro/` prefixes to URLs already indexed at bare paths (`/fees/`, `/institution/`, `/guides/`). Redesign `(public)/` pages in-place. Enforce as a contract before Phase 1 begins. Verification: `sitemap.ts` output for existing URLs must be byte-identical before and after each phase.

2. **Split-panel gateway blocks organic traffic** — Root `/` is currently a "use client" component that renders no indexable content for search engines. Replace with a Server Component consumer landing page. This is the highest-leverage first move of the milestone and resolves the SSR gap in one commit.

3. **Hamilton agent security gap** — Any new pro-facing agent added to `agents.ts` without explicit `requiredRole: "premium"` can be called by unauthenticated users if they discover the `agentId`. Admin agents (`content-writer`, `custom-query`) must return 403 for `role: "premium"` sessions. Write one integration test per agent verifying access boundaries; run in CI.

4. **Report generation cost overrun without per-user limits** — The global $50/day circuit breaker does not prevent a single pro user from exhausting the daily Claude budget. At $5-10 per report, 10 users x 5 reports/day = $250-500. Add a `report_generation_events` table with a per-user daily count check before enqueueing. Cannot ship pro-user report generation without this.

5. **Personalization over-engineering blocks launchpad launch** — B2B personalization has a long dependency chain. The four-door launchpad delivers immediate value without personalization. Ship with national/non-personalized views first; add personalization as a separate phase. Do not add DB schema changes for user-institution linking in the same phase as B2B UI work.

6. **Component duplication between audience trees** — Enforce: if a component queries `crawler-db`, it lives in `src/components/` and is shared. Navigation components are legitimately distinct; fee display components are not. `ProFeeTable` and `PublicFeeTable` calling `getNationalIndex()` separately is a structural failure.

7. **Dark mode scope confusion** — Admin dark mode uses `.dark .admin-card` CSS overrides. Consumer pages use hardcoded hex values with no dark mode CSS. Decide at Phase 1 start: dark mode applies to admin only, or consumer too. If admin only, `DarkModeToggle` must not appear in `ConsumerNav`. Do not silently inherit the toggle on layouts that have no dark mode support.

---

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Foundation — Audience Shell Separation
**Rationale:** All subsequent phases depend on stable nav components and centralized auth. Building page content before the layout shells are settled causes rework. Involves no new features — only structural clarification of what already exists. Zero risk, maximum leverage.
**Delivers:** `pro/layout.tsx` with centralized auth guard; `src/components/pro/nav.tsx` (new); `src/components/consumer/nav.tsx` (renamed from `customer-nav.tsx`); `src/lib/personalization.ts`; `src/lib/access.ts` extended with `canAccessReportType()`; dark mode scope decision documented
**Addresses:** FEATURES — distinct nav per audience (P1); ARCHITECTURE anti-patterns 1 and 2 (conditional nav, per-page auth guards)
**Avoids:** Component duplication pitfall; admin bookmark breakage pitfall

### Phase 2: Consumer Front Door
**Rationale:** The split-panel gateway is the #1 acquisition blocker and an SEO gap. Converting root `/` to a Server Component consumer landing page with embedded Fee Scout is the single highest-leverage consumer move. Must happen before institution page work because the landing establishes the consumer design language.
**Delivers:** `(public)/page.tsx` as SEO-optimized Server Component; value-prop hero + embedded Fee Scout; auth gate removed from anonymous search; `generateMetadata()` + `ImageResponse` on consumer landing; SEO no-URL-changes contract enforced
**Uses:** `next-plausible` (audience: 'consumer' tracking); built-in `generateMetadata()` and `ImageResponse`; existing Fee Scout
**Avoids:** SEO regression pitfall (URL structure stays intact); GatewayClient SSR gap

### Phase 3: Institution Educational Pages
**Rationale:** Institution pages are the primary SEO content that converts consumer visitors. "Why does this matter?" callouts and peer percentile indicators transform existing raw fee data into an interpretive consumer product. Builds on Phase 2 consumer design language.
**Delivers:** "Why does this matter?" contextual callout per fee category; peer percentile indicator; fee distribution chart (Recharts histogram via existing `getFeesForCategory()`); JSON-LD `FinancialService` structured data; dynamic `generateMetadata()` per institution; consumer guide contextual links per fee row
**Implements:** FEATURES.md Area 2 — institution educational pages
**Avoids:** Showing only 15 featured categories (show all 49, ordered by prominence); ratings/grades anti-feature

### Phase 4: B2B Launchpad
**Rationale:** Pro subscribers have no coherent starting point. Personalization is explicitly deferred — the launchpad ships with non-personalized views. Auth guard from Phase 1 makes this safe to build without per-page auth duplication.
**Delivers:** `ProDashboard` refactored as four-door launchpad; `PersonalizationBanner` using `derivePersonalizationContext()`; peer snapshot panel; Hamilton quick-start card; recent reports list; subscriber profile with institution + district fields in DB
**Implements:** ARCHITECTURE Pattern 4 (four-door launchpad) + Pattern 2 (profile-driven personalization)
**Avoids:** Personalization over-engineering pitfall (defer user-institution linking); metrics-heavy dashboard anti-feature

### Phase 5: Scoped Report Generation + PDF Export
**Rationale:** PDF export is a critical gap — web-only output is insufficient for B2B deliverables. Per-user cost controls are a hard prerequisite for shipping. Gated on Phase 4 because the report center needs a home in the B2B launchpad.
**Delivers:** `@react-pdf/renderer` integration; `POST /api/reports/generate` returning PDF buffer; report component tree in `src/lib/reports/` (peer-brief, state-index, monthly-pulse); `report_generation_events` table with per-user daily limit (3-5/day pro, 20/day admin); report history list; structured scope form with peer group pre-fill
**Uses:** `@react-pdf/renderer` ^4.3.3; `canAccessReportType()` from Phase 1
**Avoids:** Report cost overrun pitfall (per-user limits required before shipping); report template machinery exposed to pro users (presigned R2 URL pattern, templates stay server-side)

### Phase 6: B2B Personalization
**Rationale:** Personalization is the highest-value B2B differentiator but has a dependency chain that would block Phase 4 if combined. By Phase 6, subscription data is flowing and the launchpad is validated. User-to-institution linking and district-defaulted views can now be layered in.
**Delivers:** Personalized Beige Book digest by user's district; competitive landscape snapshot using `fee_change_events`; peer group health summary from Call Report indicators; Hamilton morning briefing (weekly digest)
**Implements:** FEATURES.md Area 3 differentiators (Beige Book digest, competitive landscape, peer group health)
**Avoids:** Over-engineering warning — DB schema changes for personalization isolated to this phase only

### Phase Ordering Rationale

- Phases 1-2 establish structural integrity before any feature work. Stable nav shells and centralized auth must precede audience-specific content; otherwise every page built in the wrong structure requires rework.
- Phase 3 (institution pages) before Phase 4 (B2B launchpad): consumer SEO drives the discovery funnel that feeds B2B trial signups. Consumer organic traffic is the acquisition engine for B2B revenue.
- Phase 5 (PDF) after Phase 4 (launchpad): the report center needs a home; Phase 4 also validates that subscribers want reports before investing in PDF infrastructure.
- Phase 6 (personalization) last: requires real subscriber data to validate personalization hypotheses; launchpad is already valuable without it.
- The SEO no-URL-changes contract is a pre-Phase 1 prerequisite, not a Phase 1 deliverable — it must be established as a team norm before any file is moved.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 5 (PDF generation):** `@react-pdf/renderer` primitive system differs entirely from Tailwind. Recharts SVGs cannot render inside PDF components — need a server-side chart-to-PNG conversion strategy (node-canvas, sharp, or isolated Playwright screenshot) before implementation begins. Spike recommended.
- **Phase 6 (Personalization):** `fee_change_events` data coverage is uncertain — validate actual row counts before committing to the competitive landscape "who moved" feature. May need to defer that specific feature within Phase 6.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Shell separation):** Well-documented Next.js App Router layout patterns; codebase already has the structure; no new packages required.
- **Phase 2 (Consumer landing):** `generateMetadata()` and `ImageResponse` are official Next.js built-in APIs with extensive documentation.
- **Phase 3 (Institution pages):** Recharts histograms and `getFeesForCategory()` are already in use; work is display layer, not infrastructure.
- **Phase 4 (B2B launchpad):** Four-door layout is a standard card-navigation pattern; `personalization.ts` is a pure function with no external dependencies.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Existing stack verified from package.json; new additions verified via official docs; Puppeteer alternative explicitly evaluated against official Vercel KB |
| Features | MEDIUM | Core consumer fintech patterns verified against NerdWallet/AlphaSense; some conversion rate statistics from WebSearch summaries, not primary research |
| Architecture | HIGH | Based on direct codebase inspection of src/app/, src/lib/, src/components/; route group behavior per official Next.js docs |
| Pitfalls | HIGH | Based on direct codebase inspection of existing anti-patterns (CustomerNav conditionals, per-page auth guards, GatewayClient as "use client") |

**Overall confidence:** HIGH

### Gaps to Address

- **CFPB complaint data:** Expected on institution pages by consumer fintech standards but requires a new API integration. Deferred to v7+; confirm during Phase 3 planning whether it belongs in v6.1.
- **`fee_change_events` coverage:** The competitive landscape feature in Phase 6 depends on meaningful historical fee change data. Validate actual row counts before committing to this feature in Phase 6 planning.
- **Recharts-to-PNG for PDF:** The conversion mechanism for embedding Recharts charts in `@react-pdf/renderer` documents is not yet specified. Spike before Phase 5 implementation begins.
- **Anonymous search gate location:** Fee Scout auth gate removal is a P1 feature but the exact gating mechanism (middleware, page-level redirect, or component) was not inspected. Confirm before Phase 2 scoping.
- **Per-user report limit calibration:** The 3-5 reports/day suggestion is a recommendation. Validate the cost model (actual Claude API cost per report at production scale) before Phase 5 sets the limit in code.

---

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection: `src/app/`, `src/lib/`, `src/components/`, `src/lib/research/agents.ts`, `src/lib/access.ts`, `src/app/sitemap.ts`, `src/app/globals.css` (2026-04-07)
- npmjs.com/@react-pdf/renderer — v4.3.3 confirmed current, React 19 support since v4.1.0
- github.com/diegomura/react-pdf/issues/2460 — `serverComponentsExternalPackages` requirement confirmed
- vercel.com/kb/guide/deploying-puppeteer-with-nextjs-on-vercel — 250MB bundle limit, 10s hobby timeout, 4-8x slowdown confirmed
- nextjs.org/docs/app/getting-started/metadata-and-og-images — `generateMetadata()` and `ImageResponse` built-in
- nextjs.org/docs/app/api-reference/file-conventions/route-groups — route groups confirmed zero-dependency
- plausible.io/docs/custom-props/for-pageviews — custom property segmentation confirmed, up to 30 properties
- vercel.com/templates/next.js/ab-testing-simple — middleware cookie A/B pattern (official Vercel template)

### Secondary (MEDIUM confidence)
- intuitionlabs.ai/articles/alphasense-platform-review — AlphaSense platform feature review (full content reviewed)
- eleken.co/blog-posts/modern-fintech-design-guide — fintech design patterns (full content reviewed)
- wallstreetprep.com/knowledge/bloomberg-vs-capital-iq-vs-factset — B2B financial platform comparison
- github.com/4lejandrito/next-plausible — App Router compatibility confirmed, actively maintained
- alpha-sense.com/resources/product-articles/product-releases-2025/ — 2025 product release notes

### Tertiary (LOW confidence)
- NerdWallet banking reviews — structure inferred from search result descriptions (403 blocked on direct access)
- WSA fintech landing page guide — WebSearch summary only; direct access failed
- B2B SaaS dashboard design statistics (conversion rate claims) — WebSearch summaries; treat as directional, not definitive

---
*Research completed: 2026-04-07*
*Ready for roadmap: yes*

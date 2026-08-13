# Pitfalls Research

**Domain:** Audience-segmented UX split — adding distinct consumer and B2B experiences to an existing monolithic Next.js App Router app
**Researched:** 2026-04-07
**Confidence:** HIGH (based on direct codebase inspection + established Next.js App Router patterns)

---

## Critical Pitfalls

### Pitfall 1: SEO Regression From Route Restructuring

**What goes wrong:**
The existing public pages at `/(public)/fees/[category]`, `/(public)/institution/[id]`, `/(public)/research/state/[code]`, etc. are the SEO backbone — they already appear in `sitemap.ts` as `BASE_URL/fees/...`, `BASE_URL/institution/...`, etc. If these routes get moved, renamed, or wrapped inside audience-scoped prefixes (e.g., `/consumer/fees/...`) to serve a redesigned consumer experience, Google loses the existing index positions. The canonical URLs are public-facing, already structured without a `/consumer/` prefix, and any redirect chain introduces crawl lag.

**Why it happens:**
The impulse to "give consumers their own space" leads to creating `/consumer/fees/[category]` instead of redesigning `/(public)/fees/[category]` in place. The split-panel gateway at `/` and the existence of `/consumer/page.tsx` make it tempting to move all consumer content under `/consumer/*`.

**How to avoid:**
Never add an audience prefix to URLs that are already indexed. The consumer experience redesign must happen in-place: update `/(public)/fees/[category]/page.tsx` and `/(public)/institution/[id]/page.tsx` directly. The `/consumer/` route should redirect to `/` or serve only as the post-gateway landing — it should never become a parallel URL tree for existing content. The `/(public)` route group is a routing convenience (zero URL impact) that already isolates the consumer content correctly. Use it.

If a page genuinely needs a consumer-only URL (e.g., a guided comparison tool), create it as a new route, not a shadow of an existing one.

**Warning signs:**
- Any new `src/app/consumer/fees/` or `src/app/consumer/institution/` directories
- `sitemap.ts` growing new `consumer/` URL entries for content that already exists at bare paths
- A 301 redirect map longer than 5 entries

**Phase to address:**
First phase that touches any `/(public)` page layout or routing. Establish a "no URL changes" contract before any consumer redesign work begins.

---

### Pitfall 2: The Split-Panel Gateway Is a Dead End for SEO and First Impressions

**What goes wrong:**
The current `GatewayClient` at `/` is a client component ("use client") that shows a split-panel "choose your experience" interaction. Google does not reliably execute client-side rendering for initial indexing. The root URL — the highest-authority page — renders no indexable content for search engines. It is also poor UX: first-time visitors have to identify themselves before seeing any value.

**Why it happens:**
The split-panel feels like an elegant design solution that respects both audiences. It defers the audience-routing decision to the user. The problem is that search engines and users arriving from a direct link get nothing useful.

**How to avoid:**
Replace the gateway with a value-first consumer landing page rendered by a Server Component. The root `/` should be the consumer-facing front door by default — it is where organic traffic lands. Pro/B2B entry should be a prominent but secondary action (nav link, sticky CTA, or dedicated `/pro` path). This is confirmed by the PROJECT.md principle "B2B primary, consumer secondary" — but "primary" refers to revenue, not traffic origin. Consumer organic traffic is the discovery engine.

Critically: the `GatewayClient` is currently the root `page.tsx`. Replacing it with a Server Component resolves the SSR gap in one move.

**Warning signs:**
- Root `/` page still has `"use client"` at the top
- Google Search Console shows `/` with no impressions or "Crawled - not indexed" status
- `metadata` on root page is generic/incomplete

**Phase to address:**
Phase 1 of the milestone — consumer landing page redesign. This is the highest-leverage first move.

---

### Pitfall 3: Component Duplication Between Consumer and B2B Experiences

**What goes wrong:**
`/(public)/layout.tsx`, `/consumer/layout.tsx`, and `/pro/layout.tsx` all currently render `<CustomerNav />` and `<CustomerFooter />`. When the B2B experience gets distinct navigation (the milestone calls for "distinct navigation and layout"), the instinct is to create `ProNav` and `ProLayout` from scratch. Fee table components, index previews, and stat cards get duplicated with slight visual variations. After two or three phases, you have two separate component trees with the same business logic diverging.

**Why it happens:**
The consumer and B2B audiences have genuinely different needs, which makes diverging components feel justified in the moment. Each new page is built to look distinct, so the shared components get forked instead of parameterized.

**How to avoid:**
Identify the abstraction boundary before writing the first new component: data/logic is shared, presentation is audience-specific. Components like `FeeIndexTable`, `InstitutionCard`, `PeerFilterPanel` should remain in `src/components/` and accept an optional `variant` prop or be composed differently at the layout level. Navigation (`ProNav`, `CustomerNav`) is legitimately distinct and should be separate files — but fee display components should not be duplicated.

Enforce a rule: if a component queries `crawler-db`, it lives in `src/components/` and is shared. If it only renders markup with a specific visual treatment, a variant prop or composition is correct.

**Warning signs:**
- A `src/components/pro/` directory mirroring `src/components/public/` with near-identical components
- `ProFeeTable.tsx` and `PublicFeeTable.tsx` both calling `getNationalIndex()`
- More than two different implementations of the fee amount/percentile display pattern

**Phase to address:**
Before any new component is built for either audience. Establish the component boundary policy as a planning artifact.

---

### Pitfall 4: Hamilton Agent Prompt Injection via Pro-Tier Access

**What goes wrong:**
The `fee-analyst` agent is gated at `requiredRole: "premium"`. A premium subscriber ($2,500/mo) can call `/api/research/fee-analyst` and inject prompts designed to extract admin-tier context (operations status, pending review counts, job queue state), since `fee-analyst` uses `{ ...publicTools, ...internalTools }` — the same tool set as `custom-query` which requires `admin`. The `opsContext()` function that injects operational data is only called in the analyst and custom-query system prompts, so the tools are scoped correctly, but `internalTools` likely expose DB access beyond what a paying subscriber should have visibility into.

Additionally, the new "Expanded Hamilton for pro users" feature described in the milestone introduces a new surface: pro users generating peer briefs and competitive snapshots via the agent. If the new pro agent shares the same `agentId` namespace as admin agents, a pro user who discovers an admin `agentId` (e.g., `content-writer`) can call it directly against the API if only the UI is gated rather than the route.

**Why it happens:**
Auth is implemented correctly at the role level for existing agents. The gap is that new pro-facing agents may be added without explicitly setting `requiredRole: "admin"` on admin-only agents that remain accessible by `agentId` through the API. UI-only gating is invisible to API callers.

**How to avoid:**
The API route already enforces `requiredRole` — this is the correct pattern. The risk is in the new agents: any new `agentId` added for pro users must have `requiresAuth: true` and `requiredRole: "premium"`. Admin agents (`content-writer`, `custom-query`) must be explicitly verified to have `requiredRole: "admin"` and tested that a session with `role: "premium"` returns 403.

Write one integration test per agent that verifies a premium user cannot access admin-only agents by `agentId`. This test should live in `src/lib/research/agents.test.ts` and run in CI.

**Warning signs:**
- A new pro agent added to `agents.ts` without `requiredRole` set
- Pro dashboard UI that passes `agentId` from URL params without validation
- No test coverage on agent access control boundaries

**Phase to address:**
Any phase that adds or exposes new Hamilton agents to pro users.

---

### Pitfall 5: Report Generation Cost Controls Missing Per-User Budget

**What goes wrong:**
The current `/api/research/[agentId]/route.ts` has a $50/day global circuit breaker (`DAILY_COST_LIMIT_CENTS = 5000`). The `/api/reports/generate/route.ts` has a dual-auth path (session cookie or cron secret) but no visible per-user daily generation limit. When pro users can trigger report generation on demand (peer briefs, annual summaries, competitive snapshots), a single premium user can exhaust the daily budget before other users have a chance to run reports.

The per-user query limit in `getResearchQueryLimit()` (50/day for premium) applies to the streaming agent endpoint but there is no confirmation this applies to the report generation path, which uses a separate route.

**Why it happens:**
Report generation was originally admin-initiated (cron-triggered). Adding user-initiated report generation on the pro tier introduces a new cost surface that the existing admin-centric limits don't cover. The cost of a Claude-generated McKinsey-grade report is $5-10 per the PROJECT.md constraints — 10 premium users each triggering 5 reports in a day = $250-500 in API costs, well above the daily circuit breaker.

**How to avoid:**
Add per-user report generation limits tracked in the database. A `report_generation_events` table (user_id, generated_at, report_type, cost_cents) with a daily query against it at generation time. The limit should be separate from the streaming agent limit: suggest 3-5 reports/day per premium user, 20/day for admin/analyst.

Also: the freshness gate in `checkFreshness()` is the existing guard against redundant generation — verify it also blocks per-user rapid re-generation, not just global data-freshness checks.

**Warning signs:**
- `/api/reports/generate` route does not query a per-user daily count before enqueuing
- Premium users can call the generate endpoint in a loop without 429s
- No per-user report count visible in the admin ops dashboard

**Phase to address:**
Phase that implements pro-user report generation (expanded Hamilton). Cannot ship to pro users without this.

---

### Pitfall 6: Dark Mode Breaks on Consumer Pages That Skip Admin CSS Classes

**What goes wrong:**
The dark mode implementation uses a `.dark` class on the document root, with CSS overrides in `globals.css` targeting `.dark .admin-card`, `.dark .admin-table`, `.dark .admin-content .bg-white`, etc. The admin UI uses semantic CSS class names that are explicitly handled. Consumer pages use inline Tailwind with hardcoded color tokens (`bg-[#FAF7F2]`, `text-[#1A1815]`, `border-[#E8DFD1]`). These arbitrary values have no `.dark` override rules.

When the dark mode toggle (which reads from `localStorage: 'bfi-theme'`) is applied globally and a user navigates from admin to the consumer section, or when the new B2B launchpad dashboard uses the same dark mode toggle, consumer pages will not respond — they'll remain cream/warm-white (#FAF7F2) regardless of the toggle state.

**Why it happens:**
Dark mode was implemented exclusively for the admin interface. Consumer pages were designed as light-only. The milestone creates a B2B dashboard that may want dark mode (or at minimum must coexist with the toggle), and consumer pages may receive dark mode as a new feature.

**How to avoid:**
Make an explicit decision at the start of the milestone: does dark mode apply to consumer pages or only admin? If consumer pages are intentionally light-only, the `DarkModeToggle` component must not be rendered in `CustomerNav` or any consumer layout. If dark mode is desired for consumer pages, all hardcoded `#FAF7F2`/`#1A1815` color values must be converted to CSS custom properties or Tailwind's `dark:` variant equivalents.

Do not silently inherit the admin dark mode toggle on layouts that have no dark mode support. The result is a partially-inverted page that looks broken.

**Warning signs:**
- `DarkModeToggle` appearing in `CustomerNav` or `ProNav` before dark mode CSS is implemented for consumer pages
- Consumer pages showing white headers but cream-colored body sections after dark mode activation
- `localStorage` key `bfi-theme` being read in consumer layout components

**Phase to address:**
Any phase that modifies `CustomerNav` or creates the new B2B layout. Decide and document the dark mode scope boundary before building.

---

### Pitfall 7: "While We're At It" Scope Creep From Parallel Redesign Impulses

**What goes wrong:**
Adding audience segmentation requires touching nearly every shared component and layout. Each touch point creates an opportunity to "improve" the existing design while you're in there — upgrading the fee table, adding a chart, redesigning the institution card, cleaning up the nav. These improvements are each individually sensible but collectively blow the milestone scope. Three phases in, the consumer redesign is half-done, three unrelated components have been redesigned, and the B2B dashboard hasn't been started.

This project's history shows the pattern: v4.x "Report Design" grew to include v4.2 template deployment. Good impulses expand scope.

**Why it happens:**
The redesign creates justified context for improvement. When a developer is modifying `CustomerNav` for the B2B layout, it's natural to also fix the mobile breakpoint, add the dark mode toggle, update the icon library, and swap out the font weight. Each change takes minutes; together they take days and introduce regressions.

**How to avoid:**
Define each phase with a strict output contract: what files are allowed to change, what the deliverable looks like. A phase that changes `CustomerNav` for B2B routing should not also change the nav's visual design for consumer pages. Capture improvement ideas in a `BACKLOG.md` during execution to drain the "while we're at it" impulse without acting on it.

The test: if a change is not required for the phase's stated deliverable, it belongs in a future phase.

**Warning signs:**
- A PR modifying more than 5 files that were not named in the phase plan
- Component changes that affect the consumer experience during a "B2B dashboard" phase
- Admin pages being restyled during a consumer redesign phase

**Phase to address:**
Every phase. This is a process discipline, not a technical fix. The phase plan should name specific files that are in scope.

---

### Pitfall 8: Breaking Existing Admin Bookmarks and Deep Links

**What goes wrong:**
Admin users have bookmarked `/admin/hamilton/research/[agentId]`, `/admin/fees/catalog`, `/admin/market`, etc. The existing `/admin/*` structure is stable. If the B2B launchpad is implemented by moving or aliasing admin routes (e.g., pointing `/pro/research` at admin Hamilton, or redirecting `/pro/market` to `/admin/market`), the URL surfaces multiply and existing bookmarks risk breaking.

The `/admin/hamilton/` subtree is the production Hamilton interface. The `/pro/research/page.tsx` and `/admin/research/[agentId]` are different surfaces. If pro users are given access to expanded Hamilton, the instinct may be to reuse admin routes — which exposes admin-only features to pro users if the auth check is missed.

**Why it happens:**
Code reuse is correct; the risk is in how reuse is implemented. Sharing a route between admin and pro users by checking `user.role` in the page component is easy to get wrong. A missed conditional or a server-side rendering shortcut can expose admin data to pro users.

**How to avoid:**
Admin routes (`/admin/*`) must never be reachable by non-admin sessions. The `admin/layout.tsx` already enforces this with `getCurrentUser()` + role redirect. New pro-facing Hamilton pages must be implemented as new routes under `/pro/` that call the same underlying API endpoints with appropriate `agentId` values. The API layer (already correct) is the enforcement boundary — pages just need to not expose admin UI elements.

Never redirect pro users into `/admin/*`. Build distinct pro pages that call shared API endpoints.

**Warning signs:**
- `/pro/research/[agentId]` rendering admin UI elements (review queue, ops status, pipeline monitor)
- Any `redirect('/admin/...')` in pro page code
- A pro session that can navigate to `/admin/hamilton/` without being redirected

**Phase to address:**
Phase that builds the B2B launchpad and expanded Hamilton for pro users.

---

### Pitfall 9: Over-Engineering Personalization Before Data Exists

**What goes wrong:**
The milestone calls for "B2B personalization: institution-specific Call Reports, district Beige Book, competitive landscape on login." This is the most complex feature in the milestone and requires knowing the user's institution before showing personalized data. The current auth model (`getCurrentUser()`) returns role/subscription but no institution affiliation. Building the personalization infrastructure — user-to-institution linking, preference storage, personalized query paths — is a multi-phase effort that can consume the entire milestone if started too early.

**Why it happens:**
Personalization is the highest-value B2B feature and gets prioritized accordingly. The problem is it has a dependency chain: user must have an institution affiliation → institution must be in the DB → personalized queries must be written → UI must display them. Each step takes longer than estimated.

**How to avoid:**
Decouple personalization from the B2B dashboard launch. The B2B launchpad can launch with non-personalized views (national index, peer builder, Hamilton, reports) — these are immediately valuable without personalization. Personalization (institution-scoped dashboard, district defaulting) should be a separate phase or a phase-2 enhancement.

The minimum viable B2B dashboard does not require personalization. Ship the four doors (Hamilton, Peer Builder, Reports, Federal Data) without personalization first.

**Warning signs:**
- Database schema changes for user-institution linking in the same phase as B2B UI work
- More than 2 new DB columns added to the `users` table for personalization preferences
- A phase that cannot be considered "done" until personalization is working

**Phase to address:**
Address this as a planning constraint when defining the B2B dashboard phase. Personalization is a stretch goal, not a launch requirement.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hardcoded hex colors in consumer pages (`#FAF7F2`, `#1A1815`) instead of CSS variables | Fast to write, no abstraction needed | Impossible to theme or dark-mode without a full search-and-replace | Only acceptable if consumer is permanently light-only and both team members know it |
| Reusing `CustomerNav` for both consumer and B2B by adding conditionals | Avoids creating a second nav component | The nav grows conditionals for every audience difference; becomes unmaintainable after 3 additions | Never for more than 1-2 minor differences; create `ProNav` when B2B nav diverges meaningfully |
| Checking `user.role` inside page components for feature gating | Quick to implement | Business logic leaks into presentation layer; access rules scattered across components | Acceptable for one-off page-level redirects; not acceptable for recurring feature access checks (use `access.ts` helpers) |
| Sharing `/admin/hamilton/` URL with pro users via a shared layout | One implementation | Exposes admin UI to pro users; breaks the admin/pro separation contract | Never |
| Skipping per-user rate limits on report generation at launch | Faster to ship | A single aggressive user can exhaust daily Claude budget | Acceptable only with a manually-enforced user whitelist during beta; must be automated before open enrollment |
| Agent module caching (`_agents` singleton) persists across hot reloads | Faster agent resolution | Stale prompts survive dev server restarts; hard to debug prompt changes | Acceptable in production; must be cleared during development prompt iteration |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Stripe subscription + Hamilton access | Checking `subscription_status === 'active'` in page components directly instead of `canAccessPremium()` | Always use the `canAccessPremium(user)` helper from `src/lib/access.ts`; it handles `admin`/`analyst` roles correctly |
| Vercel AI SDK streaming in new pro pages | Creating a new streaming endpoint per pro page instead of reusing `/api/research/[agentId]` | The agent API is parameterized by `agentId`; add new agent configs to `agents.ts` and reuse the existing route |
| Next.js metadata in new audience layouts | Forgetting `template: "%s | Bank Fee Index"` in segment layout metadata | Copy the metadata export from `consumer/layout.tsx` as the template for all new audience layouts |
| `searchParams` in consumer pages | Treating `searchParams` as synchronous (it is a Promise in Next.js 16 App Router) | Always `await searchParams` — this is already correct in the codebase but easy to miss in new pages |
| Tailwind v4 in new components | Using Tailwind v3 `dark:` variant syntax that conflicts with the custom `@custom-variant dark` definition in `globals.css` | Use the `.dark` class override pattern in `globals.css` for admin pages; use `dark:` Tailwind variant only if explicitly supported in the consumer CSS setup |
| Report generation freshness gate | Treating `checkFreshness()` as a per-user limit when it is a global data-freshness check | Freshness gate prevents redundant generation when data hasn't changed; it does not prevent the same user from generating multiple reports; add explicit per-user limits separately |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| `getNationalIndexCached()` called in multiple Server Components on the same page load | Multiple DB round-trips for the same data; slow TTFB on consumer pages | Fetch once at the page (Server Component) level and pass as props to child components | Day 1 if consumer home and B2B home both call it independently in the same layout |
| `force-dynamic` on consumer pages that could be ISR | Every page request hits the DB; Vercel Edge gets no cache benefit | Remove `force-dynamic` from consumer pages and use `revalidate` with an appropriate interval; use `next/headers` only where needed | At scale; not visible in development |
| Agent module singleton `_agents` not reset on env var changes | New agent configs or model overrides don't take effect until server restart | Clear `_agents = null` in development; document that `BFI_MODEL_*` env var changes require a server restart in production | Every time a model is changed in production without a redeploy |
| Pro dashboard rendering all 49 fee categories server-side on every load | Slow initial page load for B2B users; large HTML payload | Fetch only featured (15) categories initially; use `?show=all` pattern already established elsewhere | If the pro dashboard shows more than 20 categories in the initial render |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Adding a new pro agent to `agents.ts` with `requiresAuth: false` by mistake | Any unauthenticated user can call the pro-tier agent with internal tools exposed | Every agent with `internalTools` in its tool set must have `requiresAuth: true`; add a startup assertion that validates this invariant |
| Pro page that reads `agentId` from URL query params without validating against the known agent list | User crafts URL to call `content-writer` or `custom-query` (admin-only agents) | Call `getAgent(agentId)` and check `agent.requiredRole` in the page component before rendering the chat UI; the API route already enforces this but the UI should not offer false hope |
| Report generation endpoint accepting `user_id` in the request body | Attacker generates reports attributed to another user's quota | `user_id` must come from `getCurrentUser()` server-side only; never from the request body |
| Cookie named `fsh_session` (legacy name) accepted alongside a new renamed cookie | Session fixation if both cookie names are valid simultaneously | Keep `fsh_session` as the sole cookie name per the MEMORY.md note; do not add a second auth cookie for the pro experience |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Split-panel gateway at `/` asks consumers to self-identify before seeing value | High bounce rate; users who arrived from search don't understand why they need to choose | Replace with a value-first consumer landing page; B2B entry is a secondary nav action |
| Pro dashboard shows "Subscribe" CTA to a user who is already subscribed | Undermines trust in the platform; makes the user feel unrecognized | Check `canAccessPremium(user)` server-side and show the actual dashboard, not the marketing page; `pro/page.tsx` already does this correctly but must be maintained through the redesign |
| Institution pages designed only for consumers show "premium" benchmarking features as blurred/locked | B2B users visiting institution pages from research workflows hit friction on features they've paid for | Access checks on institution pages must respect `canAccessPremium(user)`; blurring should only appear for truly unauthenticated visitors |
| Consumer "Find Your Bank" flow deposits users in `/institutions` (unbranded list) instead of a guided experience | Drop-off after the CTA click; page doesn't feel like a continuation of the consumer promise | Institution search should be the consumer experience front door, not a raw list; at minimum, preserve consumer nav context on this page |
| B2B launchpad "four doors" presented as equal options when Hamilton is the primary differentiator | Users don't know where to start; the most valuable feature is buried | Hamilton should be the hero action on the B2B dashboard, not one of four equal tiles |

---

## "Looks Done But Isn't" Checklist

- [ ] **Consumer landing page redesign:** Verify the root `/` renders as a Server Component (no `"use client"` at file top) and that `metadata.description` is consumer-specific and SEO-optimized.
- [ ] **B2B launchpad:** Verify a session with `role: "premium"` and `subscription_status: "active"` sees the dashboard, not the marketing page. Verify `role: "viewer"` sees a paywall, not a 500.
- [ ] **Hamilton pro access:** Verify that a premium user calling `/api/research/content-writer` gets a 403, not a 200. Verify that `fee-analyst` returns a 200 for premium users.
- [ ] **Report generation limits:** Verify a premium user who calls `/api/reports/generate` 10 times in a row gets rate-limited before the 6th call (or whatever the daily limit is set to).
- [ ] **Dark mode scope:** Verify that the `DarkModeToggle` is not present in `CustomerNav` or consumer layouts until dark mode CSS for those pages is implemented. Verify that toggling dark mode on an admin page and then navigating to a consumer page does not produce a broken visual state.
- [ ] **Sitemap integrity:** Verify `sitemap.ts` contains no `/consumer/` or `/pro/` prefix on URLs that previously existed without those prefixes.
- [ ] **No duplicate fee data routes:** Run `find src/app -name "page.tsx" | xargs grep -l "getNationalIndex\|getPeerIndex"` and verify consumer and B2B pages are not independently fetching the same data with no shared cache.
- [ ] **Pro nav does not expose admin routes:** Verify that the B2B navigation contains no links to `/admin/*` routes.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| SEO regression from URL restructuring | HIGH | Audit Google Search Console for 404s; set up 301 redirects from new URLs to canonical; resubmit sitemap; wait 4-8 weeks for reindex |
| Component duplication discovered mid-milestone | MEDIUM | Identify the canonical component; merge logic; use a prop or composition to handle variant differences; update all callsites in one PR |
| Hamilton agent security gap (wrong `requiredRole`) | MEDIUM | Hotfix: add `requiredRole: "admin"` to affected agents immediately; audit access logs for unauthorized calls; notify affected users if sensitive data was exposed |
| Report generation cost overrun | LOW-MEDIUM | Disable user-triggered report generation temporarily; add per-user daily limit; monitor `report_jobs` table for volume; re-enable with limits in place |
| Dark mode breaks consumer pages | LOW | Scope toggle to admin-only by removing `DarkModeToggle` from `CustomerNav`; restore consumer page visual integrity; dark mode for consumer is a future phase |
| Scope creep has consumed the milestone | HIGH | Cut scope to the minimum: consumer landing + B2B launchpad only; defer personalization, expanded Hamilton, and consumer guide integration to the next milestone |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| SEO regression from route restructuring | Phase 1 (consumer landing redesign) — establish no-URL-changes contract | `sitemap.ts` output before and after phase must be identical for existing URLs |
| Split-panel gateway | Phase 1 — replace with Server Component consumer landing | Root `/` responds to `curl` with indexable HTML content |
| Component duplication | Pre-phase planning — define component boundary policy | No new components in `src/components/pro/` that mirror `src/components/public/` |
| Hamilton pro agent security gap | Phase that adds pro Hamilton access | `npm test` includes agent access control tests covering premium vs admin boundaries |
| Report generation cost overrun | Phase that enables pro-user report generation | Load test: 10 concurrent premium users cannot exceed configured daily per-user limit |
| Dark mode scope confusion | Phase 1 or any phase touching `CustomerNav` | `DarkModeToggle` not present in consumer layout until dark mode CSS is implemented |
| Scope creep | Every phase — enforced at planning time | Phase plan names specific files in scope; PR review checks for out-of-scope changes |
| Admin bookmark breakage | B2B launchpad phase | Manual test: existing admin bookmarks (`/admin/hamilton/`, `/admin/market`, `/admin/fees/catalog`) resolve correctly after phase |
| Personalization over-engineering | B2B launchpad phase — explicitly defer | B2B dashboard ships with no user-institution linking in DB schema |

---

## Sources

- Direct inspection of `src/app/page.tsx`, `src/app/gateway-client.tsx`, `src/app/(public)/layout.tsx`, `src/app/consumer/layout.tsx`, `src/app/pro/layout.tsx`
- `src/lib/research/agents.ts` — agent config, role requirements, tool sets
- `src/app/api/research/[agentId]/route.ts` — auth enforcement, cost circuit breaker
- `src/app/api/reports/generate/route.ts` — report generation auth paths
- `src/lib/access.ts` — access control helpers
- `src/app/sitemap.ts` — URL structure and canonical paths
- `src/app/globals.css` — dark mode implementation scope
- `CLAUDE.md` project constraints (content quality, cost, no overlap)
- `.planning/PROJECT.md` — v6.0 milestone target features and constraints

---
*Pitfalls research for: audience-segmented UX split on existing Next.js App Router monolith*
*Researched: 2026-04-07*

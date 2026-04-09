# Phase 48: Pro Navigation + Full Canvas Width - Research

**Researched:** 2026-04-09
**Domain:** Next.js App Router route cleanup, redirect patterns, CSS layout (Tailwind full-width)
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Old Pro tabs (categories, peers, market, districts, data, news) are being ELIMINATED completely — these standalone pages are removed
- **D-02:** The Hamilton 5-screen system (Home, Analyze, Simulate, Reports, Monitor + Settings) IS the entire Pro experience
- **D-03:** Data browsing (fee categories, peer comparisons, district data, market data) becomes part of the Analyze screen — users query Hamilton or browse structured data in the same workspace
- **D-04:** Old Pro tab routes should redirect to `/pro/monitor` (or appropriate Hamilton screen) to avoid 404s for any bookmarked URLs
- **D-05:** Every Hamilton screen must use full browser canvas width — no `max-w-*` or `mx-auto` containers constraining content width
- **D-06:** Settings page `max-w-5xl mx-auto` must be removed — full width like all other screens
- **D-07:** Full canvas width must apply consistently without introducing horizontal scroll

### Claude's Discretion
- How to surface data browsing capability in the Analyze screen (tab, sidebar section, suggested prompts, or browse mode)
- Whether to delete old Pro tab files or just redirect routes
- Appropriate padding values for full-width layouts

### Deferred Ideas (OUT OF SCOPE)
- Detailed Analyze data browsing UI design — the exact UX for browsing structured data within Analyze will be refined in Phase 51 (Analyze Live Data)
- Search functionality across fee data — deferred to Analyze phase
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NAV-01 | Existing Pro nav tabs (Pricing, Peer, etc.) wired to real fee data | Old Pro route files contain working DB queries (getNationalIndex, getPeerIndex) — these pages are being eliminated but their data access patterns can inform Analyze; the nav itself is already the Hamilton top nav which references HAMILTON_NAV |
| NAV-02 | All Pro screens use full canvas width — no wasted margins | Four files contain constraining width values across Hamilton screens — settings page.tsx, monitor page.tsx, AnalyzeWorkspace.tsx, and HamiltonShell main tag |
| MON-04 | Monitor uses full canvas width (no wasted left/right margins) | monitor/page.tsx has inline `maxWidth: "72rem"` on both header and the content grid — these must be removed |
</phase_requirements>

---

## Summary

Phase 48 is a clean-up and layout constraint phase. There are no new features to build — the work is: (1) redirect or delete eight old Pro tab route directories, (2) remove the `max-w-*` / `maxWidth` CSS constraints from Hamilton screens, and (3) optionally surface a minimal data browsing entry point in the Analyze screen without redesigning it.

The codebase is already partially in the right state. The Hamilton route group (`src/app/pro/(hamilton)/`) is the live Pro experience. The old Pro tabs (`categories/`, `peers/`, `market/`, `districts/`, `data/`, `news/`, `research/`, `reports-legacy/`) exist as dead weight — premium users are redirected to `/pro/monitor` by `pro/page.tsx`, so these tab files are effectively unreachable for premium users, but they are not deleted and have no explicit redirects.

**Primary recommendation:** Delete the old Pro tab route directories (no content worth preserving that isn't already in Hamilton or its DB query layer), add Next.js permanent redirects in `next.config.ts` for SEO safety, and strip the four `maxWidth` / `max-w-*` constraints from Hamilton pages. This is a safe, low-risk phase with no new runtime dependencies.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js App Router | 16.1.6 (project) | Route cleanup + redirects | Already the framework; `async redirects()` in next.config.ts is the canonical pattern |
| Tailwind CSS | v4 (project) | Width utility removal | All Hamilton screens use Tailwind; class removal is the right approach |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| next.config.ts `redirects()` | Built-in | Permanent 308 redirects for old Pro routes | Keeps crawlers and bookmarks working without maintaining dead page files |

**Installation:** None required — no new packages for this phase.

---

## Architecture Patterns

### How Old Pro Routes Must Be Handled

There are two valid approaches. The research favors **delete + next.config.ts redirects**:

**Option A: Delete directories + redirects in next.config.ts (RECOMMENDED)**

Delete the 8 old route directories. Add permanent redirects in `next.config.ts`:

```typescript
// Source: Next.js App Router docs — next.config.ts async redirects()
async redirects() {
  return [
    { source: '/pro/categories', destination: '/pro/monitor', permanent: true },
    { source: '/pro/peers',      destination: '/pro/monitor', permanent: true },
    { source: '/pro/market',     destination: '/pro/analyze', permanent: true },
    { source: '/pro/districts',  destination: '/pro/analyze', permanent: true },
    { source: '/pro/data',       destination: '/pro/analyze', permanent: true },
    { source: '/pro/news',       destination: '/pro/monitor', permanent: true },
    { source: '/pro/research',   destination: '/pro/analyze', permanent: true },
    { source: '/pro/reports-legacy', destination: '/pro/reports', permanent: true },
  ];
},
```

This is cleaner than converting each page to a `redirect()` call because:
- Redirects fire before React renders, at the CDN/edge layer
- No dangling server components or DB queries executing before the redirect
- Permanent (308) signals search engines that the content moved

**Option B: Convert pages to redirect-only server components**

Replace each page.tsx with a minimal redirect. This keeps the directory but is more code to maintain. Not recommended since these routes have no content value going forward.

### Recommended Project Structure After This Phase

```
src/app/pro/
├── layout.tsx          -- Auth wrapper (unchanged)
├── page.tsx            -- Marketing page for non-premium (unchanged)
├── loading.tsx         -- Loading state (unchanged, may need max-w fix)
├── (hamilton)/         -- ALL premium routes live here
│   ├── layout.tsx      -- HamiltonShell (unchanged)
│   ├── hamilton/       -- Home screen
│   ├── analyze/        -- Analyze screen
│   ├── simulate/       -- Simulate screen
│   ├── reports/        -- Reports screen
│   ├── monitor/        -- Monitor screen (needs max-w fix)
│   └── settings/       -- Settings screen (needs max-w fix)
```

Directories to be removed:
- `src/app/pro/categories/`
- `src/app/pro/peers/` (but see Peers Actions caution below)
- `src/app/pro/market/`
- `src/app/pro/districts/`
- `src/app/pro/data/`
- `src/app/pro/news/`
- `src/app/pro/research/`
- `src/app/pro/reports-legacy/`
- `src/app/pro/brief/` (if confirmed unused)
- `src/app/pro/dashboard.tsx` (component, not a route — verify no imports)

### Full Canvas Width Pattern

The Hamilton shell already provides the correct outer structure. The issue is that individual page components add their own width constraints inside the `<main className="flex-1 min-w-0 p-6">` wrapper.

**Correct full-canvas pattern for Hamilton pages:**

```tsx
// Monitor page — correct full-canvas approach after this phase
export default async function MonitorPage() {
  return (
    <>
      <StatusStrip status={data.status} />
      <main style={{ padding: "3rem", backgroundColor: "var(--hamilton-surface)" }}>
        {/* NO maxWidth wrapper here — content fills the flex-1 main area */}
        <header style={{ marginBottom: "3rem" }}>   {/* maxWidth: "72rem" REMOVED */}
          ...
        </header>
        <div style={{ display: "grid", gridTemplateColumns: "7fr 5fr", gap: "3rem" }}>
          {/* NO maxWidth: "72rem" wrapper here */}
        </div>
      </main>
    </>
  );
}
```

**Settings page — correct full-canvas approach:**

```tsx
// BEFORE (line 63): <div className="max-w-5xl mx-auto pb-16">
// AFTER:            <div className="pb-16">
```

The `max-w-xl` on the subtitle paragraph (line 78) is acceptable — this constrains readable text width, not the page layout. The CONTEXT.md calls out only the outer `max-w-5xl mx-auto` wrapper.

**Inline maxWidth vs Tailwind classes:** Hamilton pages use both inline `style={{ maxWidth: "72rem" }}` and Tailwind `className="max-w-5xl"`. Both must be identified and removed from outer layout wrappers. Inner element constraints (text line length, form fields) are acceptable.

### Anti-Patterns to Avoid

- **Removing `max-w-xl` on text paragraphs:** This controls readable line length, not page width. Leave inner content constraints unless they are outermost wrappers.
- **Deleting `src/app/pro/peers/actions.ts` without verifying imports:** The Hamilton Settings page imports `getSavedPeerSets` from `@/lib/crawler-db/saved-peers` (not from `pro/peers/actions.ts`). However, confirm via grep that `pro/peers/actions.ts` has no external imports before deleting.
- **Removing padding from `HamiltonShell` main tag:** The `p-6` on `<main className="flex-1 min-w-0 p-6">` is correct — it provides breathing room. Do not remove it. Only remove inner `maxWidth` constraints from page components.
- **Deleting `pro-nav.tsx` component without checking all imports:** The component file `src/components/pro-nav.tsx` links to old Pro routes in its `PRO_NAV_ITEMS` array. This component is NOT used anywhere in the `src/app/pro/` directory (grep confirmed zero usages). It may be safe to delete or leave as dead code, but it is not a route — it's a React component.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| URL redirect for deleted routes | Custom middleware or page-level redirect components | `next.config.ts` async `redirects()` | Handled at CDN edge before React renders; fewer moving parts |
| Full-width enforcement mechanism | Custom CSS class or context provider | Remove `maxWidth` directly from each page | The shell already handles the layout; the constraint is in each page file |

---

## Runtime State Inventory

> Step 2.5: This is a route restructure / file cleanup phase.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — no DB tables reference old Pro route paths | None |
| Live service config | None — Vercel/Next.js routing is code-driven, not UI config | None |
| OS-registered state | None | None |
| Secrets/env vars | None — routes have no associated secrets | None |
| Build artifacts | `src/app/pro/peers/actions.ts` is a Server Action file; Next.js may have compiled it into the build | Verify no external imports, then delete with the directory |

**The one import dependency to check:** `src/app/pro/peers/actions.ts` exports `savePeerSet`/`deletePeerSet`/`getSavedGroups`. Running a grep before deletion is required (confirmed: only `saved-groups.tsx` inside the same `peers/` directory imports it — safe to delete along with the directory).

---

## Common Pitfalls

### Pitfall 1: Forgetting `brief/` and `dashboard.tsx`
**What goes wrong:** The CONTEXT.md lists 8 old route directories but the repo also has `src/app/pro/brief/` and `src/app/pro/dashboard.tsx`. Brief has a `route.ts` (API route) and a preview page.
**Why it happens:** They were not prominently called out in the CONTEXT.md.
**How to avoid:** Verify whether `brief/route.ts` is still used by any Hamilton screen before removing. If unused, include in removal. `dashboard.tsx` is a component (not a route page) — check for imports before deleting.

### Pitfall 2: `pro/loading.tsx` has a `max-w-7xl` width constraint
**What goes wrong:** The loading state file `src/app/pro/loading.tsx` uses `mx-auto max-w-7xl px-6 py-16` — this is the loading skeleton shown before auth completes. Since all premium users land on Hamilton screens now, this may need a full-width treatment too.
**Why it happens:** It was written for the old Pro tabs layout.
**How to avoid:** Confirm whether this loading file applies to Hamilton screens or only the marketing page. If it applies to Hamilton routes, update it.

### Pitfall 3: Horizontal scroll after removing maxWidth
**What goes wrong:** The Monitor page grid `gridTemplateColumns: "7fr 5fr"` fills 100% of the `flex-1 main`. The left rail is 288px. At narrow viewports (1024px–1280px) the content may overflow.
**Why it happens:** The 12-col grid was sized for `maxWidth: "72rem"`. Without a max-width, it can become very wide and the proportions may look stretched.
**How to avoid:** D-07 says full width without horizontal scroll. Keep inner section padding (`padding: "3rem"`) — it provides side breathing room. The grid columns are proportional (7fr/5fr), so they scale well. However, review at lg breakpoint before shipping.

### Pitfall 4: `pro-nav.tsx` still references old routes
**What goes wrong:** The `PRO_NAV_ITEMS` array in `src/components/pro-nav.tsx` links to `/pro/market`, `/pro/peers`, etc. If this component is ever reused or re-imported, it will link to redirected/deleted routes.
**Why it happens:** It was the old Pro navigation component, now superseded by HamiltonTopNav.
**How to avoid:** The component is not imported anywhere in the pro app routes. Either delete it or update its nav items to Hamilton routes. Deleting is cleaner.

### Pitfall 5: AnalyzeWorkspace `max-w-5xl` / `max-w-4xl` constraints
**What goes wrong:** `src/components/hamilton/analyze/AnalyzeWorkspace.tsx` has `max-w-5xl` and `max-w-4xl mx-auto` on inner content divs. These are inside the chat/analysis content area — they may be intentional for readability (like article max-width), not full-page layout constraints.
**Why it happens:** The CONTEXT.md says "no `max-w-*` constraining content width" but this applies to the outermost wrappers, not inline content elements.
**How to avoid:** Do not remove `max-w-` from internal conversation bubbles, form inputs, or article-style text. Only target the top-level page wrapper `div`. The AnalyzeWorkspace renders inside `HamiltonShell`'s `<main className="flex-1 min-w-0 p-6">` — if the component's outermost div has `max-w-*`, that should be removed. Check `AnalyzeWorkspace.tsx` line 238 (`space-y-6 max-w-5xl`) and line 289 (`max-w-4xl mx-auto`) — both look like they may be outermost layout wrappers inside the component.

---

## Code Examples

Verified patterns from official sources:

### Next.js Permanent Redirect (next.config.ts)
```typescript
// Source: [ASSUMED] — Next.js redirects API, stable since Next.js 12
// Pattern confirmed against project's existing next.config.ts structure
const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ['@react-pdf/renderer'],
  async redirects() {
    return [
      {
        source: '/pro/categories',
        destination: '/pro/monitor',
        permanent: true,
      },
      // ... additional redirects
    ];
  },
  async headers() { /* existing headers unchanged */ },
};
```

### Settings Page — Remove Outer Width Constraint
```tsx
// BEFORE (src/app/pro/(hamilton)/settings/page.tsx line 63):
<div className="max-w-5xl mx-auto pb-16">

// AFTER:
<div className="pb-16">

// Keep: line 78 max-w-xl on subtitle paragraph (text readability, not layout)
// Keep: inner card/form max-w constraints for usability
```

### Monitor Page — Remove Inline maxWidth Containers
```tsx
// BEFORE (monitor/page.tsx line 39):
<header style={{ marginBottom: "3rem", maxWidth: "72rem", margin: "0 auto 3rem" }}>

// AFTER:
<header style={{ marginBottom: "3rem" }}>

// BEFORE (monitor/page.tsx line 70-73):
<div style={{
  maxWidth: "72rem",
  margin: "0 auto",
  display: "grid",
  gridTemplateColumns: "7fr 5fr",
  gap: "3rem",
}}>

// AFTER:
<div style={{
  display: "grid",
  gridTemplateColumns: "7fr 5fr",
  gap: "3rem",
}}>
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Old Pro tabs with ProNav | HamiltonShell with HamiltonTopNav | Phase 38-40 | Hamilton IS the Pro experience |
| ProNav links to `/pro/market` etc. | HAMILTON_NAV references only `/pro/analyze`, `/pro/monitor` etc. | Phase 38-40 | Navigation already correct; old tabs just not deleted |

**Dead/orphaned code identified:**
- `src/components/pro-nav.tsx`: Has `PRO_NAV_ITEMS` linking to old routes. Not imported anywhere in active app routes (confirmed via grep — only appears in its own file). Candidate for deletion.
- `src/components/pro-mobile-nav.tsx`: Likely also links to old routes. Check before deleting.
- `src/components/customer-nav.tsx`: Found in the grep list — may link to `/pro/peers`. Verify scope; this might be on the consumer side.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `src/app/pro/peers/actions.ts` has no external imports beyond its own directory | Architecture Patterns, Runtime State Inventory | If Settings or another Hamilton file imports from `pro/peers/actions.ts`, deleting it breaks the build |
| A2 | `src/app/pro/brief/` is a legacy route with no active Hamilton consumers | Architecture Patterns | If Monitor or Home links to `/pro/brief/preview`, deletion breaks those links |
| A3 | Next.js permanent redirects use HTTP 308 (not 301) for POST-safe redirects | Standard Stack | Low risk — both work for browser navigation; 308 is Next.js default for `permanent: true` |

---

## Open Questions

1. **`src/app/pro/brief/route.ts` — is it still called?**
   - What we know: `brief/` has `preview/page.tsx` and `route.ts` (API route). It's listed as legacy in CONTEXT.md's Old Pro Routes section.
   - What's unclear: Whether any Hamilton screen (Home briefing?) calls the `route.ts` API endpoint.
   - Recommendation: Grep for `/api/brief` or `/pro/brief` in the Hamilton components before deleting.

2. **`src/components/pro-nav.tsx` and `pro-mobile-nav.tsx` — delete or update?**
   - What we know: `pro-nav.tsx` is not imported in any active Pro route. It still references old nav items.
   - What's unclear: Whether it's imported in any admin or public area (it appeared in grep results for the broader search but not for Hamilton screens).
   - Recommendation: Grep for `ProNav` import across all of `src/` before deleting.

3. **`AnalyzeWorkspace.tsx` max-w constraints — layout or content?**
   - What we know: Lines 238 and 289 have `max-w-5xl` and `max-w-4xl mx-auto` constraints.
   - What's unclear: Whether these are outermost layout wrappers (should be removed per D-05) or inner chat bubble containers (should be kept for readability).
   - Recommendation: Inspect the full component structure to determine if these are the first child of the `<main>` or nested inside content areas.

---

## Environment Availability

Step 2.6: SKIPPED — this phase is purely code changes (route deletion, CSS class removal, next.config.ts additions). No external tools, databases, or services required beyond the existing project stack.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run src/lib/hamilton/navigation.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NAV-01 | Old Pro routes redirect to Hamilton screens, not 404 | smoke | Manual browser check (Next.js redirects are config-level, not unit-testable) | manual-only |
| NAV-02 | All Hamilton screens render without max-w-* outer wrapper | visual/smoke | `npx vitest run src/lib/hamilton/navigation.test.ts` (nav shape); visual check in browser | existing nav tests pass |
| MON-04 | Monitor page fills full canvas width | visual/smoke | Manual browser check at 1280px and 1920px widths | manual-only |

### Sampling Rate
- **Per task commit:** `npx vitest run src/lib/hamilton/navigation.test.ts` (fast, ~1s)
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
None — the navigation.test.ts file already exists and covers the nav shape. No new test infrastructure needed for this phase. Visual width verification is manual-only (no DOM rendering in vitest `node` environment).

---

## Security Domain

This phase makes no changes to authentication, authorization, data access, or API surface. The old Pro tab pages that are being deleted do not expose security-relevant endpoints (they are premium-gated by the parent `pro/layout.tsx`). Redirects in `next.config.ts` do not affect the security headers already configured.

ASVS categories V2/V3/V4/V6 are not applicable. V5 (Input Validation) is not applicable — this phase adds no new inputs.

---

## Sources

### Primary (HIGH confidence)
- Verified via codebase inspection: `src/app/pro/(hamilton)/layout.tsx`, `src/app/pro/page.tsx`, `src/components/hamilton/layout/HamiltonShell.tsx`, `src/components/hamilton/layout/HamiltonTopNav.tsx`, `src/components/hamilton/layout/HamiltonLeftRail.tsx`, `src/lib/hamilton/navigation.ts`
- Verified via grep: All `max-w-*` and `maxWidth` occurrences across the `src/app/pro/` and `src/components/hamilton/` directories
- Verified via grep: Old Pro route directories and their file contents
- Verified via grep: Import chains from `pro/peers/actions.ts`

### Secondary (MEDIUM confidence)
- [ASSUMED] Next.js `async redirects()` in `next.config.ts` for permanent route redirects — standard App Router pattern

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Route cleanup scope: HIGH — all files identified, imports verified
- Full-width fix targets: HIGH — all `maxWidth` locations found via grep
- Redirects pattern: MEDIUM — standard Next.js pattern, not verified against docs in this session
- `brief/route.ts` consumer status: LOW — unclear if any active Hamilton screen calls it

**Research date:** 2026-04-09
**Valid until:** 2026-05-09 (stable domain — only code changes, no external APIs)

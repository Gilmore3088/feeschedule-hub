# Phase 40: Hamilton Shell - Research

**Researched:** 2026-04-09
**Domain:** Next.js App Router route groups, server component layouts, multi-zone auth gating, left rail workspace memory
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Hamilton screens live at `/pro/hamilton`, `/pro/analyze`, `/pro/simulate`, `/pro/reports`, `/pro/monitor`
- **D-02:** `/pro` redirects to `/pro/monitor`. Monitor is the default landing page.
- **D-03:** `/pro/hamilton` (Home / Executive Briefing) is accessible as a quick link from Monitor, not the default landing.
- **D-04:** Existing `/pro` pages stay as-is. Gradual migration — this phase adds new routes alongside existing ones.
- **D-05:** The Hamilton shell layout wraps only the 5 Hamilton routes. Other `/pro` pages continue using the existing `ProLayout`.
- **D-06:** Left rail content is screen-specific. `LEFT_RAIL_CONFIG` from `navigation.ts` defines structure per screen.
- **D-07:** Empty state shows guided onboarding — "Set up your institution profile", "Run your first analysis", "Create a peer set".
- **D-08:** Left rail is collapsible on smaller screens. Mobile gets bottom nav or hamburger (Claude's discretion).
- **D-09:** Non-subscribers who hit a Hamilton URL see a Hamilton-branded upgrade page within the shell — NOT a generic /subscribe redirect.
- **D-10:** Admin users fully bypass the paywall with a subtle "Admin Mode" indicator bar.
- **D-11:** Auth check lives in the Hamilton shell layout, not in individual screen components. Uses `getCurrentUser()` + `canAccessPremium()`.
- **D-12:** Hamilton shell is a server component. Interactive children are client components pushed as low as possible.
- **D-13:** The `.hamilton-shell` CSS class (Phase 38) wraps the entire Hamilton layout.
- **D-14:** Institutional context flows from user's profile (set in Settings, Phase 41). All child screens read from layout — no per-screen institution selection.
- **D-15:** `ensureHamiltonProTables()` (Phase 39) is called once from the Hamilton shell layout on first render.

### Claude's Discretion

- Whether to use a Next.js route group `(hamilton)` with a `layout.tsx` or a wrapper component approach
- Exact left rail collapse/expand animation behavior
- Mobile navigation pattern (bottom nav vs hamburger)
- How the Hamilton-branded upgrade page is structured (could be a page or a modal)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SHELL-01 | `(hamilton)` route group with shared server component layout wrapping all 5 screens | Route group pattern confirmed below; layout.tsx with server auth pattern |
| SHELL-02 | HamiltonTopNav component with locked nav labels and active state | `HAMILTON_NAV` array from navigation.ts is the source of truth; server-rendered via pathname convention |
| SHELL-03 | HamiltonContextBar showing selected institution, horizon, and analysis focus | `User` interface has `institution_name`, `institution_type`, `asset_tier` — passed server-side |
| SHELL-04 | HamiltonLeftRail workspace memory (saved analyses, recent work, pinned institutions, peer sets) | `LEFT_RAIL_CONFIG` from navigation.ts defines sections per screen; DB queries to hamilton_saved_analyses + hamilton_scenarios |
| SHELL-05 | Institutional context flows from Settings to layout to all child screens without per-screen selection | `getCurrentUser()` returns institution fields; derive from user row, pass as props to children |
</phase_requirements>

## Summary

Phase 40 builds the Hamilton shell: the persistent layout that all 5 Pro screens (Home/Analyze/Simulate/Reports/Monitor) render inside. It is a pure infrastructure phase — no screen content is built. The deliverables are: (1) a Next.js route group `(hamilton)` under `src/app/pro/` containing a `layout.tsx`, five stub `page.tsx` files, and a `/pro` redirect; (2) four shell components (`HamiltonShell`, `HamiltonTopNav`, `HamiltonContextBar`, `HamiltonLeftRail`) in `src/components/hamilton/layout/`; and (3) a Hamilton-branded upgrade gate rendered within the shell for non-subscribers.

The existing `ProLayout` at `src/app/pro/layout.tsx` is the direct model: server component inner function, `getCurrentUser()` + `canAccessPremium()` auth check, admin bypass bar, `Suspense` wrapper, and warm parchment background. The Hamilton shell follows this pattern exactly, diverging only in (a) routing to a Hamilton-branded upgrade page instead of `/subscribe`, (b) using the `.hamilton-shell` CSS isolation boundary instead of the ProLayout's bare className, and (c) injecting the three-piece shell layout (top nav, context bar, left rail) around `{children}`.

The `HAMILTON_NAV` array in `src/lib/hamilton/navigation.ts` is already locked — six entries with exact hrefs. The `LEFT_RAIL_CONFIG` per-screen structure is also locked there. `User.institution_name`, `User.institution_type`, and `User.asset_tier` already exist on the user row returned by `getCurrentUser()`, so the context bar gets its data for free with no new DB queries. The critical implementation choice (Claude's discretion) is the route group structure: `src/app/pro/(hamilton)/` vs a wrapper component. Given the proposal in `proposed-file-tree.txt` and CONTEXT.md D-05, the route group approach is clearly correct — it keeps the 5 Hamilton routes isolated inside `(hamilton)/layout.tsx` while existing `/pro/*` routes remain under the parent `pro/layout.tsx`.

**Primary recommendation:** Use `src/app/pro/(hamilton)/layout.tsx` as the Hamilton shell server component. The route group parentheses prevent URL segment collision, so routes remain `/pro/hamilton`, `/pro/analyze`, etc. This is the idiomatic Next.js pattern for shared layouts on a subset of routes within a parent segment.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js App Router | 16.1.6 (project) | Route groups, nested layouts, server components | Already in project; route groups are the canonical solution for layout isolation |
| React | 19.2.3 (project) | Server/client component model | Already in project |
| Tailwind CSS v4 | project standard | Shell layout styling | Already in project |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `src/lib/hamilton/navigation.ts` | Phase 38 artifact | `HAMILTON_NAV`, `LEFT_RAIL_CONFIG`, `CTA_HIERARCHY` | Top nav and left rail structure — import directly |
| `src/lib/auth.ts` | project | `getCurrentUser()`, `User` interface | Auth gating in layout.tsx |
| `src/lib/access.ts` | project | `canAccessPremium()` | Paywall check |
| `src/lib/personalization.ts` | project | `derivePersonalizationContext()` | Institution context derivation |
| `src/lib/hamilton/pro-tables.ts` | Phase 39 artifact | `ensureHamiltonProTables()` | Cold-start table creation in layout |
| `src/app/globals.css` | Phase 38 artifact | `.hamilton-shell` CSS tokens | Editorial design isolation boundary |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Route group `(hamilton)/layout.tsx` | Wrapper component passed as prop | Route group is idiomatic; wrapper would require manual prop threading to every page |
| Server component layout + client children | Full client layout | Server layout = faster TTFB + no auth waterfall; preferred per D-12 |

**Installation:** No new packages required. All dependencies already present.

## Architecture Patterns

### Recommended Project Structure

```
src/app/pro/
├── layout.tsx                     # EXISTING ProLayout — untouched
├── page.tsx                       # EXISTING — add redirect to /pro/monitor
├── (hamilton)/
│   ├── layout.tsx                 # NEW: Hamilton shell server component
│   ├── hamilton/
│   │   └── page.tsx               # NEW: stub — "Executive Briefing"
│   ├── analyze/
│   │   └── page.tsx               # NEW: stub — "Analysis Workspace"
│   ├── simulate/
│   │   └── page.tsx               # NEW: stub — "Scenario Modeling"
│   ├── reports/
│   │   └── page.tsx               # NEW: stub — "Report Builder"
│   └── monitor/
│       └── page.tsx               # NEW: stub — "Institutional Monitor"

src/components/hamilton/layout/
├── HamiltonShell.tsx              # NEW: outermost div with .hamilton-shell class
├── HamiltonTopNav.tsx             # NEW: client component — nav with active state
├── HamiltonContextBar.tsx         # NEW: client or server — institution + horizon + focus
└── HamiltonLeftRail.tsx           # NEW: client component — collapsible, screen-specific
```

### Pattern 1: Route Group Layout (SHELL-01)

**What:** Next.js route groups use parenthetical folder names `(hamilton)` to apply a shared layout without adding a URL segment. Routes inside `(hamilton)/` still map to `/pro/hamilton`, `/pro/analyze`, etc.

**When to use:** When a subset of routes within a parent segment needs its own layout that differs from the parent. The `(hamilton)` group layout executes AFTER the parent `pro/layout.tsx`, so both auth checks run: ProLayout handles base Pro gating, Hamilton layout handles Hamilton-specific upgrade check.

**Important:** The parent `pro/layout.tsx` already does `canAccessPremium()` → redirect to `/subscribe`. The Hamilton shell layout should NOT duplicate the generic premium redirect. Instead: if a premium user hits Hamilton but has no Hamilton subscription tier, the shell renders the Hamilton-branded upgrade page (D-09). For this phase, `canAccessPremium()` returning true is sufficient — the premium tier distinction is deferred.

**Layout nesting order:**
1. `src/app/layout.tsx` (root)
2. `src/app/pro/layout.tsx` (Pro — auth + `canAccessPremium`)
3. `src/app/pro/(hamilton)/layout.tsx` (Hamilton shell — admin bar, top nav, context bar, left rail)

```typescript
// Source: Next.js App Router — route group pattern [VERIFIED: codebase grep]
// src/app/pro/(hamilton)/layout.tsx

import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { canAccessPremium } from "@/lib/access";
import { ensureHamiltonProTables } from "@/lib/hamilton/pro-tables";
import { HamiltonShell } from "@/components/hamilton/layout/HamiltonShell";
import { HamiltonUpgradeGate } from "@/components/hamilton/layout/HamiltonUpgradeGate";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Hamilton | Bank Fee Index", template: "%s | Hamilton" },
};

export default function HamiltonLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <HamiltonLayoutInner>{children}</HamiltonLayoutInner>
    </Suspense>
  );
}

async function HamiltonLayoutInner({ children }: { children: React.ReactNode }) {
  let user = null;
  try {
    user = await getCurrentUser();
  } catch { /* DB not available */ }

  if (!user || !canAccessPremium(user)) {
    // Pro layout already handles login redirect + generic premium gate.
    // This branch only fires if somehow reached without Pro access.
    return <HamiltonUpgradeGate />;
  }

  // Cold-start: create Hamilton Pro tables if they don't exist
  ensureHamiltonProTables().catch(() => {});

  const isAdmin = user.role === "admin" || user.role === "analyst";

  const institutionContext = {
    name: user.institution_name,
    type: user.institution_type,
    assetTier: user.asset_tier,
  };

  return (
    <HamiltonShell
      user={user}
      isAdmin={isAdmin}
      institutionContext={institutionContext}
    >
      {children}
    </HamiltonShell>
  );
}
```

### Pattern 2: HamiltonTopNav — Server-Rendered Active State (SHELL-02)

**What:** The `ProNav` component uses `usePathname()` — a client hook — to derive active state. For the Hamilton shell, the nav must work without client JS per the success criteria. The solution is to make `HamiltonTopNav` a server component that receives `pathname` derived from the layout's URL context, OR accept that a thin client wrapper is needed only for `usePathname()`.

**Verdict:** `usePathname()` requires `"use client"`. The minimal approach is to make `HamiltonTopNav` a client component (as ProNav is) but with no other interactivity — just the nav link active state. This is acceptable under D-12 ("interactive children are client components pushed as low as possible"). The nav itself is a single leaf node.

**Key data source:** Import `HAMILTON_NAV` from `@/lib/hamilton/navigation.ts` — the locked array with exact hrefs. Do not redefine nav items in the component.

```typescript
// Source: [VERIFIED: src/lib/hamilton/navigation.ts + src/components/pro-nav.tsx pattern]
// src/components/hamilton/layout/HamiltonTopNav.tsx
"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { HAMILTON_NAV } from "@/lib/hamilton/navigation";

export function HamiltonTopNav() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 ...">
      <nav>
        {HAMILTON_NAV.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link key={item.href} href={item.href} ...>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
```

**Note on Admin nav item:** `HAMILTON_NAV[5]` has href `/admin`. The admin role check from the layout should be used to conditionally show this item — non-admin Pro users should not see the Admin link.

### Pattern 3: HamiltonContextBar — Institution Context (SHELL-03)

**What:** The context bar shows institution name, type, asset tier, and analysis horizon. Per D-14, this data flows from `getCurrentUser()` → layout → context bar. No per-screen institution selection.

**When to use:** Phase 41 (Settings) is when users configure their institution profile. For Phase 40, the context bar renders whatever is in `user.institution_name` etc. — possibly null. The empty-state treatment is: show placeholder text ("Configure your institution in Settings") with a link to `/pro/settings`.

**Data available on `User` row (no extra DB query needed):**
- `user.institution_name` — institution name
- `user.institution_type` — bank/credit union/etc.
- `user.asset_tier` — asset size category

Horizon and analysis focus are UI state (not persisted in Phase 40). Use `useState` defaults (`"LTM"` for horizon, `"Pricing"` for focus) in a client context bar component. Settings persistence deferred to Phase 41.

### Pattern 4: HamiltonLeftRail — Screen-Specific Workspace Memory (SHELL-04)

**What:** The left rail shows saved work from the Hamilton Pro tables. It is screen-specific: different sections appear per the current screen, as defined in `LEFT_RAIL_CONFIG`.

**Implementation approach:**
- `HamiltonLeftRail` is a client component (handles collapse state)
- It receives `screen` prop (derived from pathname in parent or passed from layout)
- It renders sections based on `LEFT_RAIL_CONFIG[screen].sections`
- For Wave 0/stub implementation: render the correct section titles with empty states

**Data sources per screen:**
- "Saved Analyses" → `hamilton_saved_analyses` table (user_id filter)
- "Recent Work" → same table, order by `updated_at DESC`
- "Pinned Institutions" → no table in Phase 40 (Settings Phase 41 owns this) — render empty state
- "Scenarios" → `hamilton_scenarios` table
- "Report History" → `hamilton_reports` table
- "Watchlist" → `hamilton_watchlists` table

**Left rail query pattern:**
```typescript
// Server-side, in layout or via a server action called from layout
const savedAnalyses = await sql`
  SELECT id, title, analysis_focus, updated_at
  FROM hamilton_saved_analyses
  WHERE user_id = ${userId} AND status = 'active'
  ORDER BY updated_at DESC LIMIT 10
`;
```

Pass results as props to client `HamiltonLeftRail` component.

### Pattern 5: Cold-Start ensureHamiltonProTables (D-15)

**What:** Per the existing pattern in `src/app/admin/hamilton/chat/page.tsx`:
```typescript
ensureHamiltonProTables().catch(() => {});
```

Fire-and-forget. Non-blocking. Called on each layout render but safe because `CREATE TABLE IF NOT EXISTS` is idempotent.

### Pattern 6: Pro Redirect to Monitor (D-02)

The existing `src/app/pro/page.tsx` renders the Pro dashboard. Per D-02, it should redirect to `/pro/monitor`. Since existing Pro pages stay as-is (D-04), add a redirect in the `src/app/pro/(hamilton)/monitor/page.tsx` context, OR modify `src/app/pro/page.tsx` to redirect. The cleaner approach: modify `pro/page.tsx` to add a redirect to `/pro/monitor` at the top. This does not break existing Pro pages.

### Anti-Patterns to Avoid

- **Redefining nav items in the component:** `HAMILTON_NAV` is the single source of truth. Never create a local PRO_NAV_ITEMS-style array inside the Hamilton nav component.
- **Calling `ensureHamiltonProTables()` in each page:** Call it once in the layout — per D-15.
- **Full client layout:** The outer layout must be a server component. Push `"use client"` only to leaf nodes (TopNav, ContextBar dropdowns, LeftRail collapse button).
- **Separate auth check per page:** Auth lives in the shell layout (D-11). Individual page stubs have no auth logic.
- **Showing Admin nav link to non-admins:** Check `user.role === "admin" || user.role === "analyst"` before rendering the Admin item.
- **Generic `/subscribe` redirect for non-subscribers hitting Hamilton URLs:** Per D-09, the upgrade gate renders within the shell, Hamilton-branded.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Navigation structure | New nav items array | `HAMILTON_NAV` from `navigation.ts` | Phase 38 locked this; deviating breaks ARCH-04 |
| Auth check | Custom session parsing | `getCurrentUser()` + `canAccessPremium()` | Already handles TTL, HMAC signature, DB lookup |
| Institution context derivation | New user profile queries | `User` object fields already on session | `institution_name`, `institution_type`, `asset_tier` already returned by `getCurrentUser()` |
| Left rail section config | Per-component hardcoded sections | `LEFT_RAIL_CONFIG` from `navigation.ts` | Single source of truth for screen-specific sections |
| CSS design tokens | New CSS variables | `.hamilton-shell` tokens from `globals.css` | Phase 38 scoped all `--hamilton-*` tokens here |
| Cold-start table creation | Per-screen CREATE TABLE calls | `ensureHamiltonProTables()` single call in layout | Idempotent, one call in layout covers all screens |
| Personalization context | New derivation logic | `derivePersonalizationContext(user)` | Pure function in `personalization.ts` |

## Common Pitfalls

### Pitfall 1: Route Group Double Layout
**What goes wrong:** Creating `(hamilton)/layout.tsx` that re-runs the full `ProLayout` auth logic, causing double redirects or double DB queries.
**Why it happens:** Developer copies ProLayout wholesale into the Hamilton layout.
**How to avoid:** The Hamilton layout trusts that ProLayout has already authenticated the user. The Hamilton layout only adds the Hamilton-specific upgrade check (D-09) and the shell structure. Do not repeat `redirect("/login")` — that already fired in ProLayout.
**Warning signs:** Login loop or double SQL queries in server logs.

### Pitfall 2: HAMILTON_NAV href Mismatch with Route Group Paths
**What goes wrong:** `HAMILTON_NAV` has `href: "/pro/home"` but the route group creates the page at `src/app/pro/(hamilton)/hamilton/page.tsx`, which resolves to `/pro/hamilton` — not `/pro/home`.
**Why it happens:** D-01 specifies `/pro/hamilton` (not `/pro/home`) as the Home route. `HAMILTON_NAV[0].href` must be updated to match, or the nav active state never fires.
**How to avoid:** Verify: `HAMILTON_NAV[0].href === "/pro/hamilton"`. Current value in `navigation.ts` is `${HAMILTON_BASE}/home` = `/pro/home`. This is a mismatch with D-01 which specifies `/pro/hamilton`. **The planner must include a task to update `HAMILTON_NAV[0].href` from `/pro/home` to `/pro/hamilton` in `navigation.ts`.**
**Warning signs:** Home nav item never shows active state.

### Pitfall 3: Left Rail DB Queries in Client Component
**What goes wrong:** Developer fetches saved analyses inside `HamiltonLeftRail` using a `useEffect` + client-side fetch.
**Why it happens:** Left rail is a client component (for collapse state), but DB queries must be server-side.
**How to avoid:** Fetch `savedAnalyses`, `recentWork` etc. in the server layout, then pass as props to the client `HamiltonLeftRail`. Pattern: server fetches, client renders + interacts.
**Warning signs:** DB connection errors in client-side logs, or `sql` import in a `"use client"` file.

### Pitfall 4: .hamilton-shell Not Applied
**What goes wrong:** The editorial design tokens (`--hamilton-surface`, `--hamilton-font-serif`, etc.) are not active because the `.hamilton-shell` class was never placed on the outer wrapper.
**Why it happens:** Developer uses a generic `<div className="min-h-screen bg-[#FAF7F2]">` (copied from ProLayout) instead of the `HamiltonShell` wrapper that applies `.hamilton-shell`.
**How to avoid:** `HamiltonShell` component must have `className="hamilton-shell min-h-screen"` on its root element. This is the CSS isolation boundary from Phase 38 (ARCH-01).
**Warning signs:** Headings use Geist sans instead of Newsreader serif; parchment tone wrong.

### Pitfall 5: ensureHamiltonProTables Blocks Render
**What goes wrong:** `await ensureHamiltonProTables()` in the layout causes slow TTFB on every request because it runs 12+ DDL statements.
**Why it happens:** Developer awaits the call instead of fire-and-forget.
**How to avoid:** Always call as `ensureHamiltonProTables().catch(() => {})` — non-awaited, per the established pattern in `admin/hamilton/chat/page.tsx`.
**Warning signs:** Hamilton routes take 500ms+ on first load but subsequent loads are fast.

### Pitfall 6: Existing /pro Routes Broken by Route Group
**What goes wrong:** Adding a `(hamilton)/layout.tsx` breaks `src/app/pro/market/`, `/pro/peers/`, etc.
**Why it happens:** Misunderstanding of how route groups scope layouts.
**How to avoid:** Route group layout ONLY applies to routes physically nested inside `(hamilton)/`. Routes at `src/app/pro/market/` are outside the route group and unaffected. Verify by running existing Pro routes after creating the group.

## Code Examples

### HamiltonShell Component (client wrapper for CSS isolation)
```typescript
// Source: [VERIFIED: src/app/globals.css .hamilton-shell, src/app/pro/layout.tsx pattern]
// src/components/hamilton/layout/HamiltonShell.tsx
"use client"; // needed if it holds collapse state; otherwise server is fine

import { HamiltonTopNav } from "./HamiltonTopNav";
import { HamiltonContextBar } from "./HamiltonContextBar";
import { HamiltonLeftRail } from "./HamiltonLeftRail";
import type { User } from "@/lib/auth";

interface HamiltonShellProps {
  user: User;
  isAdmin: boolean;
  institutionContext: {
    name: string | null;
    type: string | null;
    assetTier: string | null;
  };
  savedAnalyses?: Array<{ id: string; title: string; analysis_focus: string }>;
  recentScenarios?: Array<{ id: string; fee_category: string }>;
  children: React.ReactNode;
}

export function HamiltonShell({
  user,
  isAdmin,
  institutionContext,
  savedAnalyses = [],
  recentScenarios = [],
  children,
}: HamiltonShellProps) {
  return (
    <div className="hamilton-shell min-h-screen">
      {isAdmin && (
        <div className="bg-gray-900 text-white text-xs px-4 py-1.5 flex items-center justify-between">
          <span className="text-gray-400">Admin Mode — viewing Hamilton Pro</span>
          <a href="/admin" className="text-blue-400 hover:text-blue-300 font-medium">
            Back to Admin
          </a>
        </div>
      )}
      <HamiltonTopNav isAdmin={isAdmin} />
      <HamiltonContextBar institutionContext={institutionContext} />
      <div className="flex">
        <HamiltonLeftRail
          savedAnalyses={savedAnalyses}
          recentScenarios={recentScenarios}
        />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
```

### Hamilton-Branded Upgrade Gate (D-09)
```typescript
// Source: [ASSUMED — shape based on D-09 requirements and ProLayout pattern]
// src/components/hamilton/layout/HamiltonUpgradeGate.tsx
// NOT a redirect — renders within the shell for Hamilton-brand continuity
export function HamiltonUpgradeGate() {
  return (
    <div className="hamilton-shell min-h-screen flex flex-col items-center justify-center px-8 py-24">
      <div className="max-w-lg text-center">
        <h1 style={{ fontFamily: "var(--hamilton-font-serif)" }}>Hamilton</h1>
        <p>Fee intelligence for financial executives. $500/mo or $5,000/yr.</p>
        <a href="/subscribe?plan=hamilton">Start Free Trial</a>
      </div>
    </div>
  );
}
```

### Stub Page Pattern for All 5 Routes
```typescript
// Source: [VERIFIED: pattern — server component page with export const metadata]
// src/app/pro/(hamilton)/monitor/page.tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Institutional Monitor",
};

export default function MonitorPage() {
  return (
    <div className="p-8">
      <h1>Institutional Monitor</h1>
      <p className="text-[--hamilton-text-secondary]">Coming in Phase 46.</p>
    </div>
  );
}
```

### /pro redirect to /pro/monitor
```typescript
// Source: [VERIFIED: Next.js redirect pattern used throughout this codebase]
// src/app/pro/page.tsx — ADD at top, before existing render
import { redirect } from "next/navigation";
// At the top of the server component function:
redirect("/pro/monitor");
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `"use client"` layout with `usePathname` for active state (ProNav) | Server layout + isolated client nav leaf | This phase | Better TTFB, nav renders in server HTML |
| Generic `/subscribe` redirect for all non-premium | Hamilton-branded upgrade gate within shell | This phase (D-09) | Conversion-optimized, brand-consistent |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `HAMILTON_NAV[0].href` needs updating from `/pro/home` to `/pro/hamilton` to match D-01 | Pitfall 2 + Architecture Patterns | Active state never fires for Home nav item; navigation broken |
| A2 | Parent `pro/layout.tsx` runs before `(hamilton)/layout.tsx` in Next.js layout nesting | Pattern 1 | Hamilton layout may need its own full auth check if parent layout does not apply to route group children |
| A3 | Phase 41 (Settings) owns institution profile editing; Phase 40 only reads existing `user.institution_name` etc. | Pattern 3 (ContextBar) | If institution fields are not yet on the user row from Phase 38/39, context bar shows nothing |
| A4 | `HamiltonUpgradeGate` is a component (not a page/route) rendered within the shell | Pattern 1 | Upgrade gate URL would be `/pro/upgrade` if it were a separate page — different from D-09 intent |

**Note on A2:** [VERIFIED: Next.js App Router docs pattern — route group layout DOES nest under parent segment layout] Parent `pro/layout.tsx` applies to all routes under `/pro/` including those in route groups. This confirms the Hamilton layout can skip the generic auth redirect.

**Note on A1:** [VERIFIED: src/lib/hamilton/navigation.ts line 13] `HAMILTON_NAV[0].href` is currently `${HAMILTON_BASE}/home` = `/pro/home`. But D-01 specifies the route as `/pro/hamilton`. This is a confirmed discrepancy that must be resolved in Wave 0.

## Open Questions (RESOLVED)

1. **Should `(hamilton)/layout.tsx` handle the `/pro` → `/pro/monitor` redirect, or does `/pro/page.tsx` handle it?**
   - RESOLVED: Plan 01 Task 3 adds redirect in `pro/page.tsx` for premium users. Non-premium users still see existing content.

2. **Navigation.ts HAMILTON_NAV href correction: fix in this phase or Phase 38 cleanup?**
   - RESOLVED: Plan 01 Task 1 fixes href to `/pro/hamilton` and updates the corresponding test assertion in this phase.

## Environment Availability

Step 2.6: SKIPPED (no external dependencies — this is a pure Next.js/TypeScript code phase with all dependencies already installed in the project).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (vitest.config.ts) |
| Config file | `vitest.config.ts` — @/ alias configured, node environment |
| Quick run command | `npx vitest run src/lib/hamilton/` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SHELL-01 | Route group layout renders children without error | smoke | Manual — file existence + TypeScript compile | Wave 0 |
| SHELL-02 | HamiltonTopNav renders locked nav labels from HAMILTON_NAV | unit | `npx vitest run src/lib/hamilton/navigation.test.ts` | ✅ (tests navigation.ts) |
| SHELL-03 | Context bar renders institution name from user props | unit | `npx vitest run src/components/hamilton/` | ❌ Wave 0 |
| SHELL-04 | Left rail renders correct sections per LEFT_RAIL_CONFIG | unit | `npx vitest run src/lib/hamilton/navigation.test.ts` | ✅ (LEFT_RAIL_CONFIG tested) |
| SHELL-05 | Institution context passed through to child stubs | smoke | TypeScript compile (`npx tsc --noEmit`) | N/A |

### Sampling Rate
- **Per task commit:** `npx vitest run src/lib/hamilton/`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/components/hamilton/layout/` — directory does not exist; create with all 4 layout components
- [ ] `src/app/pro/(hamilton)/` — directory does not exist; create layout.tsx + 5 stub pages
- [ ] HamiltonTopNav unit test is not strictly required (ProNav has no tests either), but TypeScript strict mode compile covers contract

*(Existing test infrastructure covers navigation.ts and LEFT_RAIL_CONFIG — no new test files required for SHELL-02 and SHELL-04.)*

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `getCurrentUser()` — HMAC-SHA256 signed session cookie, 24h TTL |
| V3 Session Management | yes | Existing session system; Hamilton layout inherits ProLayout session check |
| V4 Access Control | yes | `canAccessPremium()` — role + subscription_status check |
| V5 Input Validation | no | Shell phase has no user inputs |
| V6 Cryptography | yes (inherited) | `crypto.timingSafeEqual` for session signature verification — already in auth.ts |

### Known Threat Patterns for Shell Layout

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Auth bypass via direct URL to Hamilton route | Elevation of Privilege | `canAccessPremium()` check in layout; parent ProLayout also gates — double check |
| Admin bar shown to non-admins | Elevation of Privilege | `user.role === "admin" || user.role === "analyst"` conditional rendering |
| Institution data leakage (wrong user's data in left rail) | Information Disclosure | All DB queries filter by `WHERE user_id = ${userId}` from authenticated session |
| Session not present when Hamilton layout renders | Spoofing | `getCurrentUser()` returns null → renders `HamiltonUpgradeGate`; no crash |

## Sources

### Primary (HIGH confidence)
- `src/app/pro/layout.tsx` — ProLayout auth pattern, admin bar, Suspense wrapper
- `src/lib/hamilton/navigation.ts` — HAMILTON_NAV, LEFT_RAIL_CONFIG (Phase 38, locked)
- `src/lib/hamilton/modes.ts` — MODE_BEHAVIOR (Phase 38, locked)
- `src/lib/hamilton/pro-tables.ts` — ensureHamiltonProTables() (Phase 39, locked)
- `src/lib/auth.ts` — getCurrentUser(), User interface, canAccessPremium()
- `src/app/globals.css` — .hamilton-shell CSS isolation boundary (Phase 38, locked)
- `Hamilton-Design/hamilton_revamp_package/02-navigation-and-information-architecture.md` — nav hierarchy
- `Hamilton-Design/hamilton_revamp_package/07-ui-component-map.md` — component names
- `Hamilton-Design/hamilton_revamp_package/proposed-file-tree.txt` — directory structure
- `.planning/phases/40-hamilton-shell/40-CONTEXT.md` — all locked decisions D-01 through D-15

### Secondary (MEDIUM confidence)
- `Hamilton-Design/*/screen.png` — visual targets for shell layout (verified via image read)
- `src/app/admin/hamilton/chat/page.tsx` — ensureHamiltonTables fire-and-forget pattern

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in project, no new installs
- Architecture: HIGH — route group pattern verified against existing codebase, Next.js App Router conventions
- Auth patterns: HIGH — directly verified against auth.ts and access.ts source code
- Navigation.ts discrepancy (A1): HIGH — directly verified, `/pro/home` in navigation.ts vs `/pro/hamilton` in CONTEXT.md D-01
- Left rail data queries: MEDIUM — table schema verified from pro-tables.ts; exact query shape is planner/implementer decision

**Research date:** 2026-04-09
**Valid until:** 2026-05-09 (stable framework, 30-day window)

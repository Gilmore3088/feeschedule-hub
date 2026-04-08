# Architecture Research

**Domain:** Two-sided SaaS — Consumer + B2B audience separation in Next.js App Router
**Researched:** 2026-04-07
**Confidence:** HIGH — based on direct codebase inspection and App Router patterns

---

## Current State Assessment

The existing app has a functional but incomplete audience split. Key observations from the codebase:

- Route group `(public)/` exists with `CustomerNav` + `CustomerFooter` layout
- `/pro/` is a flat route directory (not a route group), sharing the same `CustomerNav` as `(public)/`
- `GatewayClient` at root renders a split-panel choice screen — the "choose your experience" pattern
- `CustomerNav` does conditional nav rendering: consumer links vs. pro links based on `canAccessPremium(user)`
- `ProDashboard` is a server component rendered inline from `/pro/page.tsx` when the user is premium
- `/pro/layout.tsx` imports `CustomerNav` + `CustomerFooter` — identical to `(public)/layout.tsx`
- No `middleware.ts` exists — all routing logic lives in page-level auth checks (`getCurrentUser` + `redirect`)
- Account profile (`user.institution_name`, `user.asset_tier`, `user.state_code`, `user.job_role`) is stored on the User type but only used in `ProDashboard` for district derivation and `ProfileForm` for editing
- Hamilton is admin-only (`analyst` or `admin` role). Pro users access a different agent stack via `/pro/research`
- Report generation at `POST /api/reports/generate` uses an allow-listed `VALID_REPORT_TYPES` set; pro-specific types like `peer_brief` are already present but gated by `canAccessPremium`

---

## Standard Architecture

### System Overview

```
┌────────────────────────────────────────────────────────────────────┐
│                         Root Layout                                 │
│  (fonts, globals.css, Plausible script — no nav, no auth)          │
├───────────────────────┬────────────────────────────────────────────┤
│    (public)/          │    pro/                                     │
│    Consumer Shell     │    B2B Shell                                │
│  ┌─────────────────┐  │  ┌────────────────────────────────────┐    │
│  │ ConsumerNav     │  │  │ ProNav (dark, data-dense)          │    │
│  │ ConsumerFooter  │  │  │ PersonalizationBanner (district,   │    │
│  │ SearchModal     │  │  │   institution, peer context)       │    │
│  └────────┬────────┘  │  └────────────┬───────────────────────┘   │
│           │            │               │                            │
│  Institution pages    │  Four-door dashboard                       │
│  Fee pages            │  Hamilton  Peer Builder  Reports  Fed Data │
│  Guides               │  Report generation pipeline                │
│  Research (public)    │  Pro-only research (scoped agents)         │
│  FeeScout ask widget  │  Personalized data context                 │
└───────────────────────┴────────────────────────────────────────────┘
         │                               │
         └─────────────┬─────────────────┘
                       │
         ┌─────────────▼──────────────────┐
         │   Shared Data Layer             │
         │   src/lib/crawler-db/           │
         │   src/lib/auth.ts               │
         │   src/lib/access.ts             │
         │   src/lib/fee-taxonomy.ts       │
         │   src/lib/hamilton/             │
         │   src/lib/report-engine/        │
         └────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Lives At |
|-----------|---------------|----------|
| Root layout | Font injection, global CSS, analytics script | `src/app/layout.tsx` |
| `(public)/layout.tsx` | Consumer shell: ConsumerNav + ConsumerFooter + SearchModal | `src/app/(public)/layout.tsx` |
| `pro/layout.tsx` | B2B shell: ProNav + PersonalizationBanner (auth guard here) | `src/app/pro/layout.tsx` |
| `GatewayClient` | Split-panel entry point for unauthenticated visitors | `src/app/gateway-client.tsx` |
| `ConsumerNav` | Consumer nav with Find Institution, Benchmarks, Guides, Search | `src/components/consumer/nav.tsx` (rename from customer-nav) |
| `ProNav` | B2B nav with dark palette: Dashboard, Market, Peers, Hamilton, Reports | `src/components/pro/nav.tsx` (new) |
| `PersonalizationBanner` | Contextual header strip: district, institution tier, last-login quick stats | `src/components/pro/personalization-banner.tsx` (new) |
| `ProDashboard` | Four-door launchpad server component | `src/app/pro/dashboard.tsx` (refactor) |
| `HamiltonChat` | Pro-facing Hamilton UI (different from admin Hamilton) | `src/app/pro/research/analyst-hub.tsx` (exists, rename) |
| Report generator UI | Scoped report trigger: peer brief, state index, monthly pulse | `src/app/pro/reports/new/page.tsx` (exists) |
| `UpgradeGate` | Inline paywall component for consumer pages | `src/components/upgrade-gate.tsx` (exists) |
| Shared data components | `DataFreshness`, `MaturityBadge`, `DeltaPill`, `Sparkline` | `src/components/` (audience-agnostic) |

---

## Recommended Project Structure

```
src/app/
├── layout.tsx                    # Root: fonts, globals.css only
├── page.tsx                      # GatewayPage -> GatewayClient (keep)
├── gateway-client.tsx            # Split-panel entry (keep, tweak pro CTA to /pro)
│
├── (public)/                     # Consumer experience (route group)
│   ├── layout.tsx                # ConsumerNav + ConsumerFooter + SearchModal
│   ├── page.tsx                  # Consumer landing (replace gateway link target)
│   ├── fees/                     # Fee category pages
│   ├── institution/[id]/         # Institution detail (educational tone)
│   ├── guides/                   # Consumer guides
│   ├── research/                 # Public research articles
│   └── districts/                # Public district pages
│
├── pro/                          # B2B experience (flat dir, NOT route group)
│   ├── layout.tsx                # ProNav + PersonalizationBanner (auth guard here)
│   ├── page.tsx                  # Authenticated -> ProDashboard; unauthed -> ProLanding
│   ├── dashboard.tsx             # Four-door launchpad server component
│   ├── market/                   # Market explorer (exists)
│   ├── peers/                    # Peer builder (exists)
│   ├── reports/                  # Report center
│   │   ├── new/                  # Scoped report generator (exists)
│   │   └── [id]/                 # Report viewer
│   ├── research/                 # Hamilton access for pro users
│   ├── brief/                    # Competitive brief generator (exists)
│   ├── districts/                # District views (Beige Book unlocked)
│   ├── categories/               # 49-category access
│   └── data/                     # API keys, CSV exports
│
├── admin/                        # Internal ops (unchanged)
│   └── hamilton/                 # Admin-only Hamilton (full tool access)
│
├── (auth)/                       # Login, register (route group, no nav)
│
└── api/                          # API routes (unchanged structure)
    ├── hamilton/chat/            # Admin Hamilton endpoint
    ├── reports/generate/         # Report generation (add pro scope check)
    ├── research/[agentId]/       # Agent streaming (public + pro agents)
    └── v1/                       # Public API
```

```
src/components/
├── consumer/                     # Consumer-only components
│   ├── nav.tsx                   # Rename from customer-nav.tsx
│   └── footer.tsx                # Rename from customer-footer.tsx
│
├── pro/                          # B2B-only components (partially exists)
│   ├── nav.tsx                   # New: dark B2B nav
│   ├── personalization-banner.tsx # New: district + institution context strip
│   ├── four-door-launcher.tsx    # New: Hamilton / Peer Builder / Reports / Fed Data
│   ├── peer-group-selector.tsx   # Exists
│   └── brief-status-poller.tsx   # Exists
│
└── shared/                       # Audience-agnostic (promote from root flat list)
    ├── data-freshness.tsx
    ├── maturity-badge.tsx
    ├── delta-pill.tsx
    └── sparkline.tsx             # Exists
```

```
src/lib/
├── personalization.ts            # New: derive dashboard context from User profile
├── hamilton/                     # Exists
├── report-engine/                # Exists — add canAccessReportType() to access.ts
└── access.ts                     # Exists — extend with canAccessReportType()
```

### Structure Rationale

- **`pro/` as flat directory (not route group):** Keeps `/pro/*` URLs visible in the browser. Route groups like `(pro)/` strip the segment from the URL, but we want `/pro/research` not `/research`. The tradeoff is that `pro/layout.tsx` must manage its own auth guard.
- **`(public)/` stays a route group:** Consumer pages at `/fees`, `/institution`, `/guides` do not need a `/public/` prefix. The parenthetical group gives them a shared layout without polluting the URL.
- **`src/components/consumer/` and `src/components/pro/`:** Prevents cross-contamination. Consumer components use warm palette (`#FAF7F2`, `#C44B2E`). Pro components use dark/data-dense styling.
- **`src/components/shared/`:** Data display components (`DeltaPill`, `Sparkline`, `MaturityBadge`) are genuinely reused across both audiences and admin. Promoting them out of the root flat list into `shared/` makes the intent explicit.

---

## Architectural Patterns

### Pattern 1: Layout-Level Audience Shell

**What:** Each audience gets its own `layout.tsx` that owns the chrome (nav, footer, optional personalization bar). Pages within the audience are pure content — they do not import nav components directly.

**When to use:** Always, for this product. Consumer and B2B experiences diverge significantly in navigation, palette, and contextual tooling. A single conditional nav creates exponential branching as features are added.

**Trade-offs:** Two layout files to maintain. Shared components like `SearchModal` may get imported in both layouts (acceptable duplication given the divergence).

**Example:**
```typescript
// src/app/pro/layout.tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { canAccessPremium } from "@/lib/access";
import { ProNav } from "@/components/pro/nav";
import { PersonalizationBanner } from "@/components/pro/personalization-banner";

export default async function ProLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?from=/pro");
  if (!canAccessPremium(user)) redirect("/subscribe?from=pro");

  return (
    <div className="min-h-screen bg-[#0C0F1A]">
      <ProNav user={user} />
      <PersonalizationBanner user={user} />
      <main>{children}</main>
    </div>
  );
}
```

### Pattern 2: Profile-Driven Personalization via Server Component Props

**What:** The `User` type already carries `institution_name`, `asset_tier`, `state_code`, `job_role`. Derive contextual display data in a thin `personalization.ts` service and pass it as typed props to dashboard components. Do not use client-side state or cookies for personalization context — derive it at render time from the session user.

**When to use:** Any component that customizes display based on the logged-in user's institution profile.

**Trade-offs:** Personalization is render-time only. Acceptable for this product — fee data updates on a daily batch cadence anyway.

**Example:**
```typescript
// src/lib/personalization.ts
import { STATE_TO_DISTRICT, DISTRICT_NAMES } from "@/lib/fed-districts";
import { STATE_NAMES } from "@/lib/us-states";
import type { User } from "@/lib/auth";

export interface PersonalizationContext {
  districtId: number | null;
  districtName: string | null;
  stateName: string | null;
  assetTier: string | null;
  institutionName: string | null;
  jobRole: string | null;
}

export function derivePersonalizationContext(user: User): PersonalizationContext {
  const districtId = user.state_code ? STATE_TO_DISTRICT[user.state_code] ?? null : null;
  return {
    districtId,
    districtName: districtId ? DISTRICT_NAMES[districtId] ?? null : null,
    stateName: user.state_code ? STATE_NAMES[user.state_code] ?? null : null,
    assetTier: user.asset_tier,
    institutionName: user.institution_name,
    jobRole: user.job_role,
  };
}
```

### Pattern 3: Scoped Report Generation via Type Allow-List

**What:** The report generation endpoint (`POST /api/reports/generate`) already uses a `VALID_REPORT_TYPES` allow-list. Extend `access.ts` with `canAccessReportType()` that gates by role. Pro users get `peer_brief`, `state_index`, `monthly_pulse`. Admin/analyst get all types including `national_index`.

**When to use:** Exposing report generation to pro users without giving them access to all report types or template machinery.

**Trade-offs:** Report templates remain server-side. Pro users trigger generation and receive presigned R2 URLs — they never see the template source. This is the correct boundary.

**Example:**
```typescript
// src/lib/access.ts (addition)
const PRO_REPORT_TYPES = new Set(["peer_brief", "state_index", "monthly_pulse"]);
const ADMIN_REPORT_TYPES = new Set(["national_index", "peer_brief", "state_index", "monthly_pulse"]);

export function canAccessReportType(user: User | null, reportType: string): boolean {
  if (!user) return false;
  if (user.role === "admin" || user.role === "analyst") return ADMIN_REPORT_TYPES.has(reportType);
  if (canAccessPremium(user)) return PRO_REPORT_TYPES.has(reportType);
  return false;
}
```

### Pattern 4: Four-Door Launchpad Dashboard

**What:** The pro dashboard is restructured as a server component rendering four entry-point cards: Hamilton Chat, Peer Builder, Reports, and Federal Data. Each card shows a live data teaser from the session user and a lightweight DB query. Cards link to corresponding `/pro/*` routes.

**When to use:** Replacing the current `ProDashboard` which mixes marketing content with functional tools in one long component.

**Trade-offs:** Four DB queries on dashboard load. Use `Promise.all()` to parallelize. If any query fails, its card degrades gracefully rather than blocking the entire page.

### Pattern 5: Consumer Landing as Standalone Page

**What:** The root `/` stays as the GatewayClient split-panel (brand moment). The consumer entry from the left panel targets `(public)/page.tsx` — a full consumer landing page that is statically rendered (ISR, 1-hour revalidation), SEO-optimized, and does not call `getCurrentUser()`.

**When to use:** Once a user picks an audience, their route should feel like a dedicated product. The gateway is appropriate only as a first-touch brand statement.

**Trade-offs:** Two "home" pages to maintain. The gateway left panel must stay in sync with the consumer landing value proposition.

---

## Data Flow

### Personalization Data Flow

```
HTTP Request -> pro/layout.tsx
    |
getCurrentUser() -> session cookie -> SQL join sessions + users
    |
User { institution_name, asset_tier, state_code, job_role, ... }
    |
derivePersonalizationContext(user) -> PersonalizationContext
    |
ProNav receives { user, ctx }         PersonalizationBanner receives { ctx }
    |                                         |
Renders district chip             "Boston Fed | $300M-$1B | Treasury"
    |
ProDashboard receives { user }
    |
Promise.all([
  getPeerIndex({ state_code: user.state_code }),
  getRecentConversations(user.id),
  getUsageStats(user.id),
  getDataFreshness()
])
    |
Four-door launcher with live teasers
```

### Scoped Report Generation Flow

```
Pro user fills PeerGroupSelector -> submits form
    |
POST /api/reports/generate { report_type: "peer_brief", params: { ... } }
    |
getCurrentUser() -> canAccessReportType(user, "peer_brief") -> true
    |
freshness gate -> DB insert report_jobs { user_id, report_type, params }
    |
after() -> fire-and-forget Modal trigger (Python pipeline)
    |
Returns { jobId } immediately
    |
Client polls GET /api/reports/[id]/status
    |
BriefStatusPoller component updates UI
    |
On complete -> presigned R2 URL -> redirect to /pro/reports/[id]
```

### Hamilton Agent Access Boundaries

```
/admin/hamilton   -> /api/hamilton/chat
  auth: role === "analyst" || "admin"
  tools: publicTools + internalTools (pipeline tools, admin-only data)
  model: claude-sonnet-4-5-20250929
  daily limit: 200 (admin), 50 (analyst)

/pro/research     -> /api/research/[agentId] (agentId = "fee-analyst")
  auth: canAccessPremium(user)
  tools: publicTools ONLY (no internal pipeline tools)
  model: claude-haiku-4-5-20251001 (cost-controlled)
  daily limit: 50 queries
```

The boundary already exists in the agent config — the architecture just needs the pro layout's auth guard to make it reliable rather than per-page.

---

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Current (< 1K pro users) | Session-based auth in layout.tsx is sufficient. No middleware needed. |
| 1K-10K pro users | Add `middleware.ts` for fast auth redirect on unauthenticated /pro/* hits (skip layout DB roundtrip) |
| 10K+ pro users | Split ProDashboard queries into parallel Suspense boundaries with streaming UI |

### Scaling Priorities

1. **First bottleneck: `getCurrentUser()` on every pro page render.** The session join query hits Postgres on every request. Mitigation when needed: 60-second edge cache on session validation, or store role + id in a signed JWT claim.

2. **Second bottleneck: Personalization queries in ProDashboard.** Four `Promise.all()` queries per dashboard render. Mitigation: ISR with `revalidate = 300` for peer index slices; only usage stats need `force-dynamic`.

---

## Anti-Patterns

### Anti-Pattern 1: Conditional Nav in a Single Component

**What people do:** Keep expanding `CustomerNav` with `if (isPro)` branches. The current `CustomerNav` already does this — 8 pro items vs. 4 consumer items, both in the same component.

**Why it's wrong:** Nav logic becomes a maintenance burden. Pro nav references pro-specific routes and tooling consumers should never see. Dark-mode palette, keyboard shortcuts, and search behavior differ between audiences.

**Do this instead:** Create `src/components/pro/nav.tsx`. Rename `customer-nav.tsx` to `src/components/consumer/nav.tsx`. Each layout imports its own nav. One-time migration, not ongoing complexity.

### Anti-Pattern 2: Auth Guards in Every Page Component

**What people do:** Add `getCurrentUser()` + `redirect()` at the top of every pro page. The current codebase does this — `/pro/research/page.tsx`, `/pro/reports/new/page.tsx`, and others each duplicate the guard.

**Why it's wrong:** If the auth rule changes, every page must be updated. A missed page is a security gap.

**Do this instead:** Move the `canAccessPremium` check into `pro/layout.tsx`. One guard at layout level protects all `/pro/*` routes. Individual pages may still check granular permissions (e.g., `canAccessReportType`) but the baseline access check lives in one place.

### Anti-Pattern 3: Personalization Logic Scattered in Dashboard Components

**What people do:** Call `STATE_TO_DISTRICT[user.state_code]`, `DISTRICT_NAMES[district]`, `STATE_NAMES[user.state_code]` directly inside `ProDashboard` — which is exactly what the current `dashboard.tsx` does.

**Why it's wrong:** When `PersonalizationBanner` also needs district derivation, the logic gets copied. When a third component needs it, it gets copied again.

**Do this instead:** Extract to `src/lib/personalization.ts`. `derivePersonalizationContext(user)` returns a typed `PersonalizationContext`. All pro components import this function.

### Anti-Pattern 4: Exposing Report Template Machinery to Pro Users

**What people do:** Give pro users access to the same report generation UI as admin, or return template source as part of the report job payload.

**Why it's wrong:** The flagship report templates are a core competitive asset. Pro users should receive rendered output (presigned PDF URL), not the template machinery.

**Do this instead:** The report generation pipeline runs server-side on Modal. The API returns a `jobId`. The client polls for status and receives a presigned R2 URL to the rendered PDF. The template HTML/Jinja never leaves the server.

---

## Integration Points

### New vs. Modified Components

| Component | Status | Depends On |
|-----------|--------|------------|
| `src/lib/personalization.ts` | New | `User` type, `fed-districts.ts`, `us-states.ts` |
| `src/lib/access.ts` — `canAccessReportType()` | Modified | `User` type |
| `src/app/pro/layout.tsx` | Modified (add auth guard + new nav) | `personalization.ts`, `pro/nav.tsx` |
| `src/components/pro/nav.tsx` | New | None |
| `src/components/pro/personalization-banner.tsx` | New | `personalization.ts` |
| `src/components/pro/four-door-launcher.tsx` | New | None |
| `src/app/pro/dashboard.tsx` | Modified (four-door refactor) | `personalization.ts`, `four-door-launcher.tsx` |
| `src/components/consumer/nav.tsx` | Rename + minor edit from `customer-nav.tsx` | None |
| `src/app/(public)/layout.tsx` | Modified (import from new path) | `consumer/nav.tsx` |
| `src/app/(public)/page.tsx` | New consumer landing page | Consumer nav layout |
| `POST /api/reports/generate` | Modified (use `canAccessReportType`) | `access.ts` |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `pro/layout.tsx` -> pages | Layout handles auth redirect; pages call `getCurrentUser()` independently for User data as props | Coarse gate in layout, fine-grained checks in pages |
| `personalization.ts` -> pro components | Pure function import, no DB calls | Zero extra DB query per request |
| `access.ts` -> API routes and layouts | All access checks centralized | Do not duplicate `canAccessPremium` logic in route files |
| `(public)/` pages -> consumer components | One-way: pages import from `src/components/consumer/` | Consumer components must not import from `src/components/pro/` |
| `/api/hamilton/chat` vs `/api/research/[agentId]` | Two separate endpoints, different tool sets and models | Do not merge — different cost profiles and audit trails |

---

## Build Order for v6.0

Dependencies flow downward. Build in this sequence to avoid rework:

1. **`src/lib/personalization.ts`** — pure function, no UI, no DB. All pro personalization components depend on it. Zero risk.

2. **`src/lib/access.ts` — add `canAccessReportType()`** — pure function extension. Unblocks report scoping.

3. **`pro/layout.tsx` — centralized auth guard** — replaces per-page guards. Validate all `/pro/*` routes still work.

4. **`src/components/pro/nav.tsx`** — new component. Import in `pro/layout.tsx`. Remove pro branch from `customer-nav.tsx`.

5. **`src/components/consumer/nav.tsx`** — rename + update import path in `(public)/layout.tsx` and `account/page.tsx`.

6. **`src/components/pro/personalization-banner.tsx`** — new component. Import in `pro/layout.tsx`. Depends on `personalization.ts`.

7. **`ProDashboard` refactor to four-door launchpad** — depends on stable nav and `personalization.ts`.

8. **Consumer landing page at `(public)/page.tsx`** — standalone SEO page. Update gateway-client left panel href.

9. **Report scoping for pro** — update generate route to use `canAccessReportType()`. Update pro reports UI to show allowed types only.

10. **Institution page educational redesign** — add "why does this matter?" context panels. Depends on consumer layout being stable from step 8.

---

## Sources

- Direct codebase inspection: `src/app/`, `src/lib/`, `src/components/` (2026-04-07)
- `src/app/(public)/layout.tsx` — existing consumer shell pattern
- `src/app/pro/layout.tsx` — current state (shares CustomerNav with consumer)
- `src/lib/auth.ts` — User type with profile fields (`institution_name`, `asset_tier`, `state_code`, `job_role`)
- `src/lib/access.ts` — existing access control pattern to extend
- `src/app/api/reports/generate/route.ts` — allow-list pattern for report type gating
- `src/lib/hamilton/hamilton-agent.ts` — tool boundaries between admin Hamilton and pro research agents
- Next.js App Router: route groups `(name)/` do not affect URL segments; flat dirs like `pro/` preserve the URL prefix

---
*Architecture research for: Bank Fee Index v6.0 Two-Sided Experience*
*Researched: 2026-04-07*

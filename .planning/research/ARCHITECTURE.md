# Architecture Research

**Domain:** Hamilton Pro Platform — 5-screen decision system on existing Next.js 16 App Router
**Researched:** 2026-04-08
**Confidence:** HIGH (based on direct codebase inspection, not inference)

---

## Current State Assessment

The existing Hamilton codebase has a solid foundation that v8.0 extends without replacing:

- `src/lib/hamilton/` has 7 files: `voice.ts`, `generate.ts`, `validate.ts`, `types.ts`, `hamilton-agent.ts`, `chat-memory.ts`, `index.ts`
- `/api/hamilton/chat` exists — streaming endpoint with auth, rate-limit, cost circuit breaker, and conversation persistence
- `hamilton_conversations` and `hamilton_messages` tables exist in Supabase
- `src/app/pro/research/page.tsx` is the current Hamilton entry point — will be superseded by the new shell
- The `(hamilton)` route group does **not** exist yet — it is purely additive
- `User` type already carries `institution_name`, `institution_type`, `asset_tier`, `state_code` — these are the institution context fields needed by the Hamilton shell

---

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      Browser (React 19 + Vercel AI SDK)                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │   Home   │  │ Analyze  │  │ Simulate │  │ Reports  │  │ Monitor  │  │
│  │  page.tsx│  │ page.tsx │  │ page.tsx │  │ page.tsx │  │ page.tsx │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  │
│       │             │             │              │             │         │
│  ┌────┴─────────────┴─────────────┴──────────────┴─────────────┴──────┐ │
│  │  HamiltonShell  — (hamilton)/layout.tsx                             │ │
│  │  HamiltonTopNav  |  HamiltonContextBar  |  HamiltonLeftRail         │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │  streaming SSE / fetch
┌────────────────────────────────▼────────────────────────────────────────┐
│                     Next.js App Router (Server)                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │ /api/hamilton│  │ /api/hamilton│  │ /api/hamilton│  │/api/hamilton│  │
│  │ /analyze     │  │ /simulate    │  │ /monitor     │  │/chat (exists)│ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └─────┬──────┘  │
│         │                 │                 │                 │         │
│  ┌──────┴─────────────────┴─────────────────┴─────────────────┴──────┐  │
│  │  src/lib/hamilton/                                                  │  │
│  │  hamilton-agent.ts  modes.ts  simulation.ts  monitor.ts            │  │
│  │  generate.ts  validate.ts  voice.ts  types.ts  report-summary.ts   │  │
│  │  insights.ts  navigation.ts  db.ts                                 │  │
│  └────────────────────────────┬───────────────────────────────────────┘  │
│                               │                                          │
│  ┌────────────────────────────▼───────────────────────────────────────┐  │
│  │  PostgreSQL (Supabase) — raw sql via postgres package               │  │
│  │  Existing: hamilton_conversations, hamilton_messages, users         │  │
│  │  New: hamilton_saved_analyses, hamilton_scenarios,                  │  │
│  │       hamilton_reports, hamilton_watchlists,                        │  │
│  │       hamilton_signals, hamilton_priority_alerts                    │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Implementation |
|-----------|---------------|----------------|
| `(hamilton)/layout.tsx` | Route group shell, auth guard, institution context fetch, passes props to HamiltonShell | Async server component |
| `HamiltonShell` | Renders top nav + left rail + context bar, initializes InstitutionContext provider | Client component with `usePathname` for active state |
| `HamiltonContextBar` | Displays locked institution name + tier badge pulled from layout props | Reads from context |
| `HamiltonLeftRail` | Workspace memory: saved analyses, recent scenarios, pinned institutions, settings link | Client component, data fetched in parent page |
| `modes.ts` | `HamiltonMode` enum + `SCREEN_CONSTRAINTS` map (allowed/forbidden behaviors per screen) | Pure TypeScript, no deps |
| `navigation.ts` | `HAMILTON_NAV` constant: `{ label, href, mode }[]` consumed by TopNav and LeftRail | Consumed by both shell components |
| `simulation.ts` | Scenario computation: current state → proposed state → deltas → interpretation contract | Pure computation + one DB read for percentile data |
| `monitor.ts` | Status strip builder, signal prioritization, watchlist summaries | Reads from 3 new tables |
| `insights.ts` | Reusable insight block generator for Home and Analyze | Called from `/api/hamilton/home` and `/api/hamilton/analyze` |
| `report-summary.ts` | Executive summary artifact assembly from scenario + analysis refs | Called from `/api/hamilton/report-summary` |
| `db.ts` | `ensureHamiltonProTables()` — creates all 6 new tables idempotently | Called once at layout cold start |

---

## Recommended Project Structure

The `(hamilton)` route group is the correct isolation mechanism. It parallels the existing `(auth)` and `(public)` groups: no URL segment added, isolated layout, and the wrong chrome (ProNav + CustomerFooter from `pro/layout.tsx`) stays out of Hamilton screens.

```
src/
├── app/
│   ├── (hamilton)/
│   │   ├── layout.tsx              # auth guard + institution context + HamiltonShell
│   │   ├── home/page.tsx           # Executive Briefing
│   │   ├── analyze/page.tsx        # Analysis workspace
│   │   ├── simulate/page.tsx       # Scenario workspace
│   │   ├── reports/page.tsx        # Report output + archive
│   │   └── monitor/page.tsx        # Continuous intelligence
│   └── api/
│       └── hamilton/
│           ├── chat/route.ts       # EXISTS — keep, add optional mode param
│           ├── analyze/route.ts    # NEW — typed AnalyzeResponse, streaming
│           ├── simulate/route.ts   # NEW — typed SimulationResponse, JSON
│           ├── monitor/route.ts    # NEW — typed MonitorResponse, JSON
│           └── report-summary/route.ts  # NEW — report assembly, JSON
├── components/
│   └── hamilton/
│       ├── layout/                 # HamiltonShell, TopNav, ContextBar, LeftRail
│       ├── shared/                 # HamiltonViewCard (used by Home + Analyze), ConfidencePill, ActionBar
│       ├── home/                   # ExecutiveBriefingHeader, WhatChangedRow, RecommendedActionCard, etc.
│       ├── analyze/                # AnalysisHeader, WhatThisMeansCard, EvidencePanel, ExploreFurtherPrompts
│       ├── simulate/               # ScenarioSetupCard, FeeSliderInput, ComparativeModelingCard, etc.
│       ├── reports/                # ReportHeader, ExecutiveSummaryBlock, SnapshotComparisonTable, etc.
│       └── monitor/                # MonitorHeader, StatusStrip, PriorityAlertCard, SignalTimeline, WatchlistPanel
└── lib/
    └── hamilton/
        ├── voice.ts                # EXISTS — add getScreenVoiceBoundaries(mode)
        ├── generate.ts             # EXISTS — add generateUIInsightBlock, generateSimulationInterpretation, generateReportSummary
        ├── validate.ts             # EXISTS — add validateScenarioOutput, validateMonitorSnippet
        ├── types.ts                # EXISTS — add AnalyzeResponse, SimulationResponse, MonitorResponse, ReportSummaryResponse DTOs
        ├── hamilton-agent.ts       # EXISTS — add buildScreenPrompt(mode: HamiltonMode)
        ├── chat-memory.ts          # EXISTS — add saveAnalysis, saveScenario, pinConversation, listAnalyses, listScenarios
        ├── index.ts                # EXISTS — re-export new modules as they ship
        ├── modes.ts                # NEW
        ├── simulation.ts           # NEW
        ├── monitor.ts              # NEW
        ├── insights.ts             # NEW
        ├── report-summary.ts       # NEW
        ├── navigation.ts           # NEW
        └── db.ts                   # NEW — ensureHamiltonProTables()
```

### Structure Rationale

- `(hamilton)/layout.tsx` not `pro/hamilton/layout.tsx`: Hamilton is a distinct product shell, not a sub-section of the consumer pro experience. The route group keeps Hamilton URLs clean (`/home`, `/analyze`) and isolates its chrome from `ProNav` + `CustomerFooter`.
- `components/hamilton/shared/`: `HamiltonViewCard` appears in both Home and Analyze specs — a shared subfolder prevents duplication while keeping screen-specific components isolated.
- `lib/hamilton/db.ts` is new: centralizes all 6 table creation calls in one `ensureHamiltonProTables()` function rather than spreading `ensureXxx` calls across 4 API routes.

---

## Architectural Patterns

### Pattern 1: Route Group for Isolated Shell

**What:** `(hamilton)` route group provides a layout wrapping all 5 screens without adding a URL segment. The layout runs once per navigation: one auth check, one DB read for institution context, passes typed props to `HamiltonShell`.

**When to use:** Any set of related routes needing shared chrome (nav, context bar) that must not inherit chrome from another layout.

**Trade-offs:** Clean URL structure, isolated auth. Navigating between `/pro/...` and `/analyze` crosses layout boundaries (full unmount/remount). This is intentional — Hamilton is a distinct product experience.

**Example:**
```typescript
// src/app/(hamilton)/layout.tsx
export default async function HamiltonLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccessPremium(user)) redirect("/subscribe");

  // Single DB read — institution context used by all 5 screens
  const institution = user.institution_name
    ? { name: user.institution_name, type: user.institution_type, tier: user.asset_tier }
    : null;

  // ensureHamiltonProTables called here once at cold start
  ensureHamiltonProTables().catch(() => {});

  return (
    <HamiltonShell institution={institution} user={{ id: user.id, displayName: user.display_name }}>
      {children}
    </HamiltonShell>
  );
}
```

### Pattern 2: Screen-Typed API Endpoints (not one generic endpoint)

**What:** Each Hamilton screen gets its own API route returning a typed response shape. The existing `/api/hamilton/chat` handles conversational surfaces (Analyze chat panel, Monitor floating chat). Simulate, Monitor, and Home each get their own endpoint returning the typed interfaces from `06-api-and-agent-contracts.md`.

**When to use:** When screens have meaningfully different response shapes. Forcing every Hamilton screen through the streaming chat endpoint makes typed responses impossible and prevents mode-level agent behavior constraints.

**Trade-offs:** More route files, but each is thin (auth guards + call into `lib/hamilton/` modules). The `/api/hamilton/chat` already contains the auth + cost guard pattern — new routes copy the same guards.

**Example:**
```typescript
// src/app/api/hamilton/simulate/route.ts
export async function POST(request: Request) {
  // Same auth + cost guard as /api/hamilton/chat
  const user = await getCurrentUser();
  if (!user || !canAccessPremium(user)) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { feeCategory, currentValue, proposedValue, institutionId } = await request.json();

  // Pure computation — no LLM needed for percentile math
  const simulation = await buildSimulationResponse({ feeCategory, currentValue, proposedValue, institutionId });

  // LLM only for the interpretation block
  const interpretation = await generateSimulationInterpretation(simulation);

  return Response.json({ ...simulation, interpretation });
}
```

### Pattern 3: Institution Context via Layout + React Context, Not Per-Page Fetch

**What:** The institution context (name, type, asset tier) is fetched once in `(hamilton)/layout.tsx` from the `users` table and passed as props to `HamiltonShell`. `HamiltonShell` initializes an `InstitutionContext` React context provider. Screen-level components that need institution data call `useInstitution()` — no prop threading required.

**When to use:** Data that does not change between page navigations within a session. The `User` object on the DB already has all required fields.

**Trade-offs:** Institution context is stale until next page load. Acceptable for v8.0 — the Settings page (where a user changes institution context) redirects to `/home` after save, triggering a fresh layout render.

### Pattern 4: ensureHamiltonProTables() Pattern for All 6 New Tables

**What:** The existing `chat-memory.ts` uses `ensureHamiltonTables()` — `CREATE TABLE IF NOT EXISTS` called at cold start, errors swallowed. Extend with `ensureHamiltonProTables()` in `src/lib/hamilton/db.ts` that creates all 6 new tables in a single function called once from `(hamilton)/layout.tsx`.

**When to use:** All new Hamilton Pro DB tables. Avoids separate migration step on Vercel/Supabase deploys.

**Trade-offs:** No migration history. Tables created on first request if absent. Acceptable for this project's deployment model. Do not split across individual API route handlers — racing `CREATE TABLE IF NOT EXISTS` calls across Vercel workers is harmless but wasteful.

---

## Data Flow

### Analyze Screen

```
User submits analysis prompt in AnalysisWorkspace
    |
useChat({ api: "/api/hamilton/analyze" }) — Vercel AI SDK
    |
POST /api/hamilton/analyze
    auth guard + rate limit + cost circuit breaker
    |
buildScreenPrompt("analyze") — modes.ts constrains: synthesis, comparison, no final recommendation
    |
streamText() -> Anthropic claude-sonnet streaming
    |
onFinish: logUsage() + saveAnalysis() -> hamilton_saved_analyses row
    |
SSE stream -> client renders: AnalysisHeader + WhatThisMeansCard + EvidencePanel
    |
ExploreFurtherPrompts offered from response.exploreFurther[]
```

### Simulate Screen

```
User configures ScenarioSetupCard (fee category + current/proposed values)
    |
POST /api/hamilton/simulate (JSON, not streaming)
    |
buildSimulationResponse() in simulation.ts
    — getNationalIndex() for fee category percentile data
    — compute percentile position + median gap + risk profile for current + proposed
    — compute deltas
    |
generateSimulationInterpretation(result) in generate.ts
    — Anthropic call (small, 150-200 words per voice rules)
    |
Response.json() -> client renders:
    ComparativeModelingCard + HamiltonInterpretationCard + StrategicTradeoffsCard
    |
ScenarioActionsBar:
    "Save"        -> hamilton_scenarios row
    "Send to Report" -> navigate to /reports?scenario_id=X
```

### Monitor Screen

```
Page load: GET /api/hamilton/monitor (JSON, no streaming)
    |
buildMonitorResponse(userId) in monitor.ts
    — reads hamilton_watchlists for user
    — reads hamilton_signals (last 30 days, sorted severity DESC)
    — reads hamilton_priority_alerts (unacknowledged)
    |
Client renders: StatusStrip + PriorityAlertCard + SignalTimeline + WatchlistPanel
    |
Floating chat overlay:
    useChat({ api: "/api/hamilton/chat", body: { mode: "monitor" } })
    hamilton-agent.ts constrains monitor mode: summarize changes, prioritize signals
    No simulation triggers, no report generation from this surface
```

### Institution Context Flow

```
User navigates to any (hamilton) route
    |
(hamilton)/layout.tsx server component
    getCurrentUser() — reads fsh_session cookie -> SQL join
    canAccessPremium(user) check
    ensureHamiltonProTables().catch(() => {})
    |
Passes { institution: { name, type, tier }, user: { id, displayName } } to HamiltonShell
    |
HamiltonShell (client component)
    initializes InstitutionContext.Provider
    HamiltonContextBar: renders "First National Bank | $300M-$1B"
    HamiltonLeftRail: renders saved analyses / scenarios for this user
    |
Screen pages call useInstitution() — no per-page DB fetch needed
```

---

## Integration Points

### Existing Code: What to Keep, What to Extend

| File | Status | Change |
|------|--------|--------|
| `src/lib/hamilton/voice.ts` | Keep | Add `getScreenVoiceBoundaries(mode: HamiltonMode)` returning allowed/forbidden per screen |
| `src/lib/hamilton/generate.ts` | Keep | Add `generateUIInsightBlock()`, `generateSimulationInterpretation()`, `generateReportSummary()` |
| `src/lib/hamilton/validate.ts` | Keep | Add `validateScenarioOutput()`, `validateMonitorSnippet()` |
| `src/lib/hamilton/types.ts` | Keep | Add `AnalyzeResponse`, `SimulationResponse`, `MonitorResponse`, `ReportSummaryResponse` DTOs |
| `src/lib/hamilton/hamilton-agent.ts` | Keep | Add `buildScreenPrompt(mode: HamiltonMode)` alongside existing `buildHamiltonSystemPrompt()` |
| `src/lib/hamilton/chat-memory.ts` | Keep | Add `saveAnalysis()`, `saveScenario()`, `listAnalyses()`, `listScenarios()`, `pinConversation()` |
| `src/app/api/hamilton/chat/route.ts` | Keep | Accept optional `mode` field in body, pass to `buildScreenPrompt()` |
| `src/app/pro/research/page.tsx` | Redirect after (hamilton) ships | Add redirect to `/analyze` once shell is deployed |

### New Backend Files

| File | Purpose |
|------|---------|
| `src/lib/hamilton/modes.ts` | `HamiltonMode` enum + `SCREEN_CONSTRAINTS` map |
| `src/lib/hamilton/simulation.ts` | `buildSimulationResponse(params)` — percentile computation + delta math |
| `src/lib/hamilton/monitor.ts` | `buildMonitorResponse(userId)` — reads signals, alerts, watchlists |
| `src/lib/hamilton/insights.ts` | `generateInsightBlock(focus, data)` — reusable for Home + Analyze |
| `src/lib/hamilton/report-summary.ts` | `assembleReportSummary(scenarioId, analysisId)` — composes report artifact |
| `src/lib/hamilton/navigation.ts` | `HAMILTON_NAV` constant consumed by TopNav + LeftRail |
| `src/lib/hamilton/db.ts` | `ensureHamiltonProTables()` — creates all 6 new tables idempotently |

### New API Routes

| Route | Method | Auth | Response Shape |
|-------|--------|------|----------------|
| `/api/hamilton/analyze` | POST | premium | `AnalyzeResponse` (streaming SSE) |
| `/api/hamilton/simulate` | POST | premium | `SimulationResponse` (JSON) |
| `/api/hamilton/monitor` | GET | premium | `MonitorResponse` (JSON) |
| `/api/hamilton/report-summary` | POST | premium | `ReportSummaryResponse` (JSON) |

### New DB Tables (6)

| Table | Owned By |
|-------|----------|
| `hamilton_saved_analyses` | Analyze screen — save conversation outputs |
| `hamilton_scenarios` | Simulate screen — save fee scenarios |
| `hamilton_reports` | Reports screen — save report artifacts |
| `hamilton_watchlists` | Monitor screen — per-user watchlist config |
| `hamilton_signals` | Monitor screen — normalized market signals |
| `hamilton_priority_alerts` | Monitor screen — promoted signal subset per user |

### External Services Integration

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Anthropic API | Existing — `@ai-sdk/anthropic` + `streamText` | New screen endpoints reuse same client + cost guards |
| Supabase PostgreSQL | Existing — `sql` tagged template from `crawler-db/connection.ts` | 6 new tables follow same `ensureXxx()` pattern |
| Stripe | No change | Premium gate already in `canAccessPremium()` — Hamilton layout inherits same check |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `(hamilton)/layout.tsx` → HamiltonShell | Props (institution context) | Layout is server component; HamiltonShell is client — the props cross the boundary once |
| HamiltonShell → screen pages | React context (`InstitutionContext`) | Do not thread institution props through 5 levels of screen components |
| Screen pages → API routes | `useChat` (streaming) or `fetch` (JSON) | Analyze uses `useChat`; Simulate, Monitor, Home use plain `fetch` |
| API routes → `lib/hamilton/` | Direct import | Routes stay thin; logic lives in lib modules |
| `simulation.ts` → `crawler-db/` | Direct import of `getNationalIndex()` or equivalent | Simulation needs percentile data — read from existing index queries |
| Monitor floating chat → `/api/hamilton/chat` | `useChat` with `body: { mode: "monitor" }` | Reuses existing endpoint; mode constrains system prompt behavior |
| Daily cost counter | Shared across all Hamilton API routes | All new routes must call `getDailyCostCents()` + `logUsage()` from `research/history.ts` |

---

## Build Order

Build in this sequence — each step unblocks the next.

**Step 1 — Foundation (no new deps, pure TypeScript):**
- `src/lib/hamilton/modes.ts` — `HamiltonMode` enum used by everything
- `src/lib/hamilton/navigation.ts` — consumed by shell components
- Extend `src/lib/hamilton/types.ts` — add 4 screen DTOs

**Step 2 — DB tables (blocks any screen that reads/writes Pro data):**
- `src/lib/hamilton/db.ts` — `ensureHamiltonProTables()` for all 6 tables

**Step 3 — Shell layout (blocks all screen pages):**
- `src/app/(hamilton)/layout.tsx`
- `src/components/hamilton/layout/HamiltonShell.tsx`
- `src/components/hamilton/layout/HamiltonTopNav.tsx`
- `src/components/hamilton/layout/HamiltonContextBar.tsx`
- `src/components/hamilton/layout/HamiltonLeftRail.tsx`

**Step 4 — Backend modules + API routes (parallel, no inter-dependency):**
- `simulation.ts` + `/api/hamilton/simulate`
- `insights.ts` + `/api/hamilton/analyze`
- `monitor.ts` + `/api/hamilton/monitor`
- `report-summary.ts` + `/api/hamilton/report-summary`
- Extend `generate.ts` with new generator functions
- Extend `hamilton-agent.ts` with `buildScreenPrompt(mode)`
- Extend `chat-memory.ts` with analysis + scenario persistence

**Step 5 — Screen pages (each unblocked after shell + its API route):**
- Home: `home/page.tsx` + `components/hamilton/home/`
- Analyze: `analyze/page.tsx` + `components/hamilton/analyze/`
- Simulate: `simulate/page.tsx` + `components/hamilton/simulate/`
- Reports: `reports/page.tsx` + `components/hamilton/reports/`
- Monitor: `monitor/page.tsx` + `components/hamilton/monitor/` + floating chat overlay

**Step 6 — Migration (after all screens ship):**
- Add redirect in `src/app/pro/research/page.tsx` → `/analyze`
- Update any nav links across `pro/` routes pointing to old Hamilton entry points

---

## Anti-Patterns

### Anti-Pattern 1: Using the pro/ Layout for Hamilton Screens

**What people do:** Add Hamilton screens as sub-routes under `/pro/` (e.g., `/pro/analyze`) to reuse the existing `pro/layout.tsx` auth guard.

**Why it's wrong:** `pro/layout.tsx` renders `ProNav`, `ProMobileNav`, and `CustomerFooter` — the consumer-facing warm shell. Hamilton needs a locked top nav + left rail workspace. Fighting the existing chrome on every screen adds complexity with no benefit.

**Do this instead:** `src/app/(hamilton)/layout.tsx` with its own `canAccessPremium` check and `HamiltonShell` as the root component.

### Anti-Pattern 2: Routing All Screens Through /api/hamilton/chat

**What people do:** Pass a `mode=simulate` body parameter to the existing chat endpoint and parse mode-specific behavior inside one route handler.

**Why it's wrong:** The chat endpoint uses `streamText` with `UIMessage[]` input and SSE streaming. Simulate needs deterministic JSON (percentile math is not LLM output). Monitor needs a GET endpoint. Forcing these through the streaming chat endpoint requires client-side hacks to parse the stream as typed data.

**Do this instead:** Dedicated typed routes per screen. Chat endpoint stays for conversational surfaces (Analyze chat panel, Monitor floating chat). Simulation and Monitor get separate routes returning typed JSON.

### Anti-Pattern 3: Prop-Drilling Institution Context Through Screen Components

**What people do:** Pass `institution` as a prop from layout → HamiltonShell → every screen page → every card component that needs institution data.

**Why it's wrong:** `ScenarioSetupCard` needs the institution to pre-fill the institution field. `HamiltonViewCard` needs it for the context bar label. Threading props five levels deep is brittle and breaks when new components are added.

**Do this instead:** `HamiltonShell` initializes `InstitutionContext.Provider` (it already receives `institution` as a prop from the layout). Components call `useInstitution()`. Context is initialized in the client shell component boundary — not in the server layout.

### Anti-Pattern 4: Spreading ensureXxx() Across 4 API Route Handlers

**What people do:** Add a separate `ensureXxxTables()` call inside each of the 4 new API route handlers, following the existing `ensureHamiltonTables()` pattern in `chat/route.ts`.

**Why it's wrong:** 4 concurrent cold-start requests trigger 4 races to create 6 tables each. Harmless due to `IF NOT EXISTS`, but it's redundant DB round-trips and scatters table ownership across route files.

**Do this instead:** Single `ensureHamiltonProTables()` in `src/lib/hamilton/db.ts`. Call it once in `(hamilton)/layout.tsx` with `.catch(() => {})` so the layout renders even if DB is flaky. All 6 tables are guaranteed to exist before any screen renders.

### Anti-Pattern 5: Shared HamiltonViewCard Without a Shared Subfolder

**What people do:** Duplicate `HamiltonViewCard.tsx` into both `components/hamilton/home/` and `components/hamilton/analyze/` since it appears in both screen specs.

**Why it's wrong:** Two copies diverge. The design system call (confidence level coloring, citation footer pattern) must be consistent across both screens.

**Do this instead:** `components/hamilton/shared/HamiltonViewCard.tsx`. Both screen component folders import from `../shared/`. Create `components/hamilton/shared/` for `HamiltonViewCard`, `ConfidencePill`, and `ActionBar` — all three are listed in the global component spec.

---

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-500 pro users | Current Supabase + Vercel monolith is fine. No queue needed. Direct DB writes from API routes are sufficient. |
| 500-5,000 pro users | Monitor signal generation should move to Modal cron worker (same pattern as fee crawler). Read replicas for Hamilton signal queries. |
| 5,000+ users | Separate Hamilton API into dedicated Vercel Fluid workers. Redis for watchlist fanout. |

The first bottleneck will be the Anthropic API cost ceiling ($5-10/report), not DB or server capacity. The daily circuit breaker at $50 in `/api/hamilton/chat` must be shared with all new endpoints — all Hamilton API routes must contribute to the same daily cost counter via the existing `getDailyCostCents()` + `logUsage()` calls in `src/lib/research/history.ts`.

---

## Sources

- Direct codebase inspection: `src/app/pro/layout.tsx`, `src/lib/hamilton/hamilton-agent.ts`, `src/lib/hamilton/chat-memory.ts`, `src/app/api/hamilton/chat/route.ts`, `src/lib/auth.ts`, `src/lib/access.ts`, `src/lib/hamilton/voice.ts` (2026-04-08)
- Design specs: `Hamilton-Design/hamilton_revamp_package/01` through `08-implementation-backlog.md`
- Existing route group pattern: `src/app/(auth)/`, `src/app/(public)/`
- Existing `ensureHamiltonTables()` pattern in `src/lib/hamilton/chat-memory.ts`

---
*Architecture research for: Hamilton Pro Platform v8.0*
*Researched: 2026-04-08*

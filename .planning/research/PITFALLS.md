# Pitfalls Research

**Domain:** Hamilton Pro Platform — adding a 5-screen decision system to an existing Next.js App Router app
**Researched:** 2026-04-08
**Confidence:** HIGH (based on direct codebase inspection of Hamilton v3.1 source, design package, and known sparse-data state)

---

## Critical Pitfalls

### Pitfall 1: Simulation Percentiles Are Meaningless With 0.3% Approval Rate

**What goes wrong:**
The SimulationResponse contract returns `currentPercentile` and `proposedPercentile` as the core output of the Simulate screen. These percentiles are computed against the fee index — but only 58 approved fees exist (0.3% of observations). The index currently includes staged and pending fees to reach usable counts (the national index already uses this mix with maturity badges). If the simulation engine computes percentiles only against approved fees, the distributions will be extremely sparse and the percentile output will be numerically meaningless — for many fee categories there will be fewer than 10 approved data points. A "current percentile: 67th" built on 8 data points is not a defensible analytical output.

**Why it happens:**
The simulation contract looks reasonable on paper. `currentPercentile` implies a well-populated distribution. Engineers implement the percentile calculation against `WHERE review_status = 'approved'` because that is the "clean" data, discover the distribution is empty, and then either (a) silently fall back to all data without documenting the confidence level, or (b) return a percentile against staged+pending data while the UI presents it as a fact.

**How to avoid:**
The index already handles this correctly with maturity badges — reproduce that pattern in the simulation engine. Define explicit confidence tiers for percentile output: "strong" (10+ approved observations), "provisional" (10+ total observations, staged+pending mix), "insufficient" (under 10 observations). Never return a raw percentile number without its confidence tier in the `SimulationResponse`. The UI must surface the maturity tier inline with the percentile — a "67th percentile (provisional, 23 observations)" is defensible; "67th percentile" alone is not. Add a `confidenceTier` field to `SimulationResponse.currentState` and `proposedState`.

**Warning signs:**
- `simulation.ts` queries `WHERE review_status = 'approved'` without a fallback or count check
- The Simulate screen displays a percentile number with no accompanying confidence indicator
- A fee category with fewer than 5 data points returns a non-null percentile

**Phase to address:**
Phase 3 (backend types and persistence) — define the confidence tier contract before the simulation engine is built. Phase 4 (agent behavior) — simulation response builder must include confidence tier. Never ship Simulate screen without it.

---

### Pitfall 2: Agent Mode Splitting Breaks the Existing Pro Chat

**What goes wrong:**
The current `getHamilton("pro")` in `src/lib/research/agents.ts` uses `PRO_PREFIX` + `HAMILTON_SYSTEM_PROMPT` + `REGULATION_INSTRUCTION` + `EXTERNAL_INTELLIGENCE_INSTRUCTION` as a combined system prompt. It is a single agent with one prompt. The revamp requires 5 screen-specific behaviors (home, analyze, simulate, report, monitor) with explicit `canRecommend`, `canExport`, `canSimulate` flags per mode.

If the mode split is implemented by modifying the existing `getHamilton("pro")` call, the current `/pro/research` page (which uses `AnalystHub` and calls `agentId: "hamilton"`) will start receiving mode-scoped behavior it was not designed for. The `analyst-hub.tsx` component does not know about `HamiltonMode` — it streams undifferentiated chat responses. A mode-split system prompt injected into a plain chat UI produces confusing behavior: the agent may refuse to make recommendations in analyze mode, or silently apply simulate-mode response structure to a general question.

**Why it happens:**
The cleanest implementation of mode-specific behavior is to modify the system prompt in `getHamilton()` based on a `mode` parameter. This is also the most dangerous modification because `getHamilton()` is called from the existing pro chat page. The refactor scope expands invisibly.

**How to avoid:**
Do not modify `getHamilton("pro")` to add mode-splitting until the existing `/pro/research` AnalystHub has been replaced or explicitly scoped to a mode. The implementation order must be: (1) define `HamiltonMode` and `MODE_BEHAVIOR` as a standalone `modes.ts` module (already stubbed), (2) create a new `getHamiltonForMode(mode: HamiltonMode)` function that is only called from the new 5-screen routes, (3) leave `getHamilton("pro")` untouched until the AnalystHub is superseded by the Analyze screen. Run the existing AnalystHub tests after any change to `agents.ts`.

**Warning signs:**
- `getHamilton("pro")` signature changes to accept a mode parameter before new screen routes are built
- `/pro/research/page.tsx` calling a mode-aware agent without passing a mode
- Hamilton refusing to make a recommendation in the existing pro chat after a backend change

**Phase to address:**
Phase 4 (agent behavior) — create `getHamiltonForMode()` as a new function. Phase 5 (frontend) — wire it to new screen routes only. The existing `/pro/research` chat must continue working throughout.

---

### Pitfall 3: Monitor System Becomes a Log Viewer Instead of a Decision Surface

**What goes wrong:**
The `hamilton_signals` table stores normalized monitor events. The natural implementation stores every signal detected — fee changes, regulatory alerts, peer movements — as a raw row. The Monitor screen then renders a paginated feed of these rows. The result is a log viewer: chronological, undifferentiated, high volume, requiring the user to read and interpret every entry. This is exactly what the product architecture document calls out: "Remove or simplify — heavy trend widget, duplicate dashboard content, too many competing panels."

Signal accumulation happens fast. If the monitor runs on 4,000+ institutions quarterly, a single cycle produces hundreds of signals. A feed of 200+ signals with no prioritization is noise, not intelligence.

**Why it happens:**
Storing all signals is the safe, complete approach. Displaying them in a feed is the obvious UI pattern. The work of prioritization — which signals actually matter to this user's institution, which override others, which should surface as a priority alert vs. a background signal — is ambiguous and gets deferred to "a future phase."

**How to avoid:**
The prioritization logic is the product, not the storage. Build `hamilton_priority_alerts` as the primary display surface — only 1-3 alerts promoted to priority at any given time, with explicit `severity` and `status` fields. The signal feed is secondary and collapsible. Implement a simple scoring function in `monitor.ts` that takes institution context (the user's charter type, asset tier, fee categories they care about) and filters signals to the relevant ones before any are stored as priority alerts. A monitor screen with 3 high-priority alerts and a collapsed "12 background signals" is a decision surface. A feed of 200 rows is a log.

Cap the signal feed displayed to the 20 most recent by default with a "load more" control. Never render unbounded signal lists.

**Warning signs:**
- `hamilton_signals` being queried with no LIMIT or severity filter on the Monitor page
- Monitor screen showing more than 5 signals in the initial viewport without any prioritization indicator
- `hamilton_priority_alerts` table exists but the Monitor screen displays `hamilton_signals` directly

**Phase to address:**
Phase 3 (data model) — `hamilton_priority_alerts` must have explicit status/severity fields and a FK to signals. Phase 5 (Monitor frontend) — build priority alert as the hero module; signal feed is secondary. The scoring/promotion logic should be defined before the Monitor screen is built.

---

### Pitfall 4: Recharts SVGs Cannot Render Inside @react-pdf/renderer

**What goes wrong:**
The Report screen requires charts in the PDF export (peer distribution histograms, scenario comparison visuals). Recharts renders SVG via React in the browser DOM. `@react-pdf/renderer` uses its own layout engine and cannot render React components that produce browser DOM SVGs — it renders a PDF document tree, not HTML. Attempting to pass a `<BarChart />` or `<ResponsiveContainer />` directly inside a `<Document>` or `<Page>` from `@react-pdf/renderer` will fail silently or throw at runtime.

This is a known, documented limitation. The decision to use `@react-pdf/renderer` (not Puppeteer) was already made and is serverless-safe — but the chart rendering path was not resolved.

**Why it happens:**
The Analyze screen and Simulate screen already use Recharts. The report builder naturally tries to embed the same charts in the PDF. The prop-passing API looks similar enough that the mistake isn't obvious until runtime.

**How to avoid:**
Charts in PDFs must be pre-rendered to PNG before PDF generation. Two viable paths:
1. **Server-side: `canvas` + `chartjs-to-image` or a headless chart library** — generate a PNG buffer server-side from the chart data and embed it as `<Image src={pngBuffer} />` inside `@react-pdf/renderer`. This keeps the PDF generation entirely serverless.
2. **Client-side: `html2canvas` on the Recharts container** — capture the rendered chart DOM as a PNG, upload or pass it to the PDF generation function. Requires the chart to be rendered in the browser first.

The server-side approach is cleaner for serverless. Use `@nivo/charts` or a Node-compatible chart-to-image library that doesn't require a DOM. Do not attempt to render Recharts inside the PDF renderer.

**Warning signs:**
- A Recharts component imported inside a file that also imports `@react-pdf/renderer`
- PDF generation failing silently and producing a blank chart area
- Attempting to install `canvas` as a dependency in the Next.js project (it is a native module and will fail on Vercel's serverless edge unless explicitly configured)

**Phase to address:**
Phase 5 (Report frontend) — before any chart appears in the report design, establish and test the chart-to-PNG strategy. Do not start the PDF layout until this is resolved.

---

### Pitfall 5: Editorial Design Migration Breaks Admin Pages via Shared CSS

**What goes wrong:**
The new Hamilton Pro shell uses a warm parchment editorial aesthetic: Newsreader serif headings, no-border tonal layering, `#FAF7F2` background, `#C44B2E` terracotta accents. The admin design system uses Geist, gray cards with 1px borders, `bg-gray-50/80` table headers, and `.admin-card` CSS classes defined in `globals.css`.

If the new Hamilton shell introduces new CSS custom properties or modifies existing `globals.css` variables to support the editorial design, those changes will leak into admin pages. The `globals.css` file is shared — a change to `--color-background` or the base `body` styles affects every page. The admin's `.admin-card`, `.skeleton`, and dark mode overrides are already fragile; they rely on cascading behavior that new base-level changes will disrupt.

**Why it happens:**
The instinct is to define the editorial design system at the `:root` level in `globals.css` as CSS custom properties and then use them in Hamilton components. This feels clean but makes the new design global.

**How to avoid:**
Scope all Hamilton Pro editorial CSS under a `.hamilton-shell` parent class or a route group layout that applies that class to the root div. Never modify `:root` CSS variables for Hamilton-specific colors. Newsreader font should be declared via a scoped `font-family` on the `HamiltonShell` component, not as a `body` override in `globals.css`. The warm color tokens (`--hamilton-bg`, `--hamilton-accent`, `--hamilton-text`) should be custom properties defined on `.hamilton-shell {}` — they will cascade to all Hamilton child components without polluting admin scope.

Test: toggle between `/admin/market` and `/hamilton/home` without a page reload; neither page should look visually broken.

**Warning signs:**
- New `--color-*` variables added to `:root` in `globals.css` for Hamilton-specific colors
- `body { font-family: var(--font-newsreader) }` added anywhere in `globals.css`
- Admin table headers changing background color after Hamilton CSS is added

**Phase to address:**
Phase 1 (architecture cleanup) — establish `.hamilton-shell` as the CSS isolation boundary before any editorial styles are written. Phase 5 (frontend build) — verify admin pages in CI after Hamilton CSS additions.

---

### Pitfall 6: Left Rail + Floating Chat Forces "use client" Up the Component Tree

**What goes wrong:**
The left rail requires `usePathname()` to highlight the active screen (the existing `AdminNav` and `ProNav` are already "use client" for this reason). The floating chat overlay requires state (`isOpen`, `messages`, streaming response) and hooks from `@ai-sdk/react`. If both are placed in the `HamiltonShell` layout component, the layout must be a client component. Making the layout a client component forces every child page that is currently a Server Component to either (a) lose server-rendering benefits, or (b) be passed as `{children}` to the client shell — which Next.js App Router supports, but only if the page itself is not also trying to be a client component.

The existing pro layout (`src/app/pro/layout.tsx`) is a Server Component that wraps `ProNav` (client) via composition. This pattern works. The risk is abandoning it when the Hamilton shell feels "more interactive" and deserves to be fully client-side.

**Why it happens:**
The Hamilton shell has multiple interactive concerns (nav, chat, context bar). The path of least resistance is `"use client"` at the shell level. Once the shell is a client component, all data fetching for the initial page state must move to client-side `useEffect` calls or API fetches, losing server-rendering and increasing TTFB.

**How to avoid:**
Keep `HamiltonShell` as a Server Component. Isolate interactive sub-components: `HamiltonLeftRail` is a client component for `usePathname()`; `FloatingChatOverlay` is a client component for chat state. Both are passed as props or rendered as siblings inside the server shell — Next.js App Router explicitly supports this pattern ("passing client components as children of server components"). The screen-specific page content remains server-rendered. The server component passes static data (institution name, initial thesis, alert count) to the client overlay as props — no client-side data fetching for initial state.

**Warning signs:**
- `HamiltonShell` or the route group layout has `"use client"` at the top
- Hamilton screen pages calling `useEffect` to fetch data that could be server-side
- TTFB increasing on Hamilton pages relative to existing pro pages after the shell is built

**Phase to address:**
Phase 5 (frontend shell) — establish the server/client boundary in `HamiltonShell` before building any screen. Revisit the `ProLayout` server component pattern as the template.

---

### Pitfall 7: The "One API Response Per Screen" Contract Gets Abandoned Under Time Pressure

**What goes wrong:**
The API and agent contracts document defines distinct response shapes per screen: `AnalyzeResponse`, `SimulationResponse`, `ReportSummaryResponse`, `MonitorResponse`. These are meaningfully different — Analyze has `confidence.level`, Simulate has `deltas`, Report has no inputs. Under implementation time pressure, the temptation is to route all five screens through the existing generic streaming chat endpoint (`/api/research/[agentId]`) and let the agent produce free-form markdown. This works for the Analyze screen (exploration, free-form is acceptable) but is wrong for Simulate (structured percentile/delta output), Report (export-ready artifact), and Monitor (status + signal feed).

The existing `AnalystHub` already demonstrates this failure mode: it uses streaming markdown and post-processes it with `extractMetrics()` and `extractChartData()` to recover structure from free-form text. This is brittle. A Report that relies on markdown parsing to find "Executive Summary" headings will break when Hamilton uses a slightly different heading format.

**Why it happens:**
The streaming chat endpoint already works. Building structured JSON endpoints for each screen is additional backend work. Teams ship the easy path first and intend to "add structure later" — but later never comes because the screens appear to work.

**How to avoid:**
Define typed response interfaces in `src/lib/hamilton/types.ts` before any screen is built (already in the backlog as Phase 3). Simulate and Report endpoints must return JSON, not streaming markdown. Analyze can remain streaming (it is an exploration surface). Monitor can be a JSON snapshot endpoint. Create separate API routes: `/api/hamilton/simulate` (POST, returns `SimulationResponse`), `/api/hamilton/report-summary` (POST, returns `ReportSummaryResponse`), `/api/hamilton/monitor` (GET, returns `MonitorResponse`). The streaming endpoint stays for Analyze and the floating chat.

**Warning signs:**
- Simulate screen parsing `interpretation` out of streaming markdown text
- Report summary generated by asking Hamilton to "write an executive summary" in chat format
- `extractMetrics()` or `extractTableData()` being called on Simulate or Report responses

**Phase to address:**
Phase 3 (backend types) — define all response types. Phase 4 (agent behavior) — build screen-specific response builders, not markdown parsers. This must be established before any Phase 5 screen is built.

---

### Pitfall 8: Scenario Archive and Saved Analyses Grow Without Garbage Collection

**What goes wrong:**
`hamilton_scenarios` and `hamilton_saved_analyses` are write-only tables in the current schema stub — there is no `deleted_at` column, no archive status, no TTL. A pro user running 10 simulations per session accumulates hundreds of rows quickly. The Simulate screen's scenario archive panel (Phase 6) loads "compare scenarios" from the DB. Without pagination or a row limit, the archive query becomes a full table scan against the user's entire scenario history. At 1,000 scenarios per active user this is still manageable, but the UI becomes unusable before the database becomes a bottleneck.

More critically: the `hamilton_reports` table stores `report_json JSONB` which contains the full structured report content. A McKinsey-grade report with charts and data can be 50-100KB of JSON. At 20 reports per user, this is 1-2MB of JSONB per user in the reports table — again manageable individually, but a risk at scale and a performance issue if reports are fetched without column projection.

**Why it happens:**
MVP data models omit soft-delete and pagination because they are not needed at zero users. Adding them retroactively requires a migration and query changes.

**How to avoid:**
Add `status TEXT NOT NULL DEFAULT 'active'` and `deleted_at TIMESTAMPTZ` to `hamilton_scenarios` and `hamilton_saved_analyses` in the initial schema. Add a LIMIT to every archive query (default: 20, max: 100 via URL param). For `hamilton_reports`, never SELECT `report_json` in list queries — project only `id, title, report_type, created_at, exported_at`. Fetch `report_json` only when viewing a specific report.

**Warning signs:**
- SQL schema missing `deleted_at` or `status` columns on scenario/analysis tables
- Archive query with no `LIMIT` clause
- Reports list query that includes `SELECT *` or `SELECT report_json`

**Phase to address:**
Phase 3 (data model) — add these fields to the schema stub before the tables are created. Do not ship `sql-schema.sql` to production without soft-delete and list-query projections.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Computing percentiles against all fee data without a confidence tier | Simulation screen works with sparse data | User trusts a "73rd percentile" built on 6 data points; wrong pricing decision | Never — always expose the observation count and maturity tier |
| Routing all Hamilton screens through the generic streaming chat endpoint | Fast to build — Analyze pattern already exists | Simulate and Report produce unparseable free-form text; no typed response contract | Only for Analyze (exploration) and the floating chat; never for Simulate, Report, or Monitor |
| Putting `"use client"` on `HamiltonShell` layout to simplify interactive concerns | Simpler component model | All child pages lose server rendering; data fetching moves to client-side useEffect; TTFB degrades | Never for the layout; acceptable for isolated interactive children (rail, chat overlay) |
| Skipping soft-delete on scenario tables at launch | Faster schema, no migration needed | Archive queries become unbounded; cannot undo accidental deletes | Only acceptable with a manual DELETE policy and a hard row-count ceiling per user |
| Defining Hamilton Pro editorial colors in `:root` CSS variables | Clean global design system | Admin pages inherit wrong colors; dark mode behavior changes unexpectedly | Never — scope to `.hamilton-shell` |
| Reusing `getHamilton("pro")` for mode-specific behavior via a `mode` parameter | One function, less code | Breaks existing AnalystHub chat; mode behavior leaks across screens | Never while AnalystHub is still in use |
| Using `html2canvas` to capture Recharts for PDF | No new dependencies | Requires charts to be DOM-rendered first; unreliable on server; produces blurry captures at 1x resolution | Only acceptable as a client-side fallback; not for server-side PDF generation |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `@react-pdf/renderer` + Recharts | Passing a `<BarChart>` inside a `<Document>` | Pre-render charts to PNG server-side using a Node-compatible chart library; embed as `<Image>` in the PDF |
| Vercel AI SDK streaming + mode-specific responses | Using `streamText` for all Hamilton responses including Simulate and Report | Use `streamText` for Analyze and floating chat; use a direct `anthropic.messages.create()` call with `response_format: json_object` for Simulate and Report endpoints |
| Next.js App Router route groups + new Hamilton shell | Creating `src/app/(hamilton)/` route group that collides with existing `/pro/` routes | Confirm route group naming does not shadow existing `/pro/research` and `/pro/` paths; test that existing pro routes still resolve |
| `hamilton_scenarios` UUID primary key + existing `users` table integer ID | Foreign key type mismatch — scenarios use `user_id INTEGER` but Postgres UUID tables expect UUID FK | Verify `users.id` is integer (it is, per MEMORY.md); `user_id INTEGER NOT NULL` is correct — do not add a UUID FK by mistake |
| Monitor signals + quarterly crawl cadence | Building the signal detection logic assuming real-time data | Signals are batch-generated post-crawl; design the monitor as a snapshot view (last run) not a live feed; no WebSocket or polling needed |
| @react-pdf/renderer on Vercel serverless | Installing `canvas` native module expecting it to work | Vercel serverless does not support arbitrary native modules; use `@vercel/og` image generation or a pure-JS PDF approach; test PDF generation in the Vercel build environment explicitly |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Loading all 49 fee categories for every Simulate query | Slow response building the peer distribution for simulation | Scope simulation queries to the single `fee_category` being simulated; fetch the full 49-category index only on the Home screen initial load | First simulation request |
| `hamilton_signals` queried without user scoping | Monitor page slow for all users because it queries the full signals table | Always filter by watchlist `institution_ids` and `fee_categories` from `hamilton_watchlists` for the current user | When signal count exceeds 1,000 rows |
| Floating chat streaming during heavy Simulate computation | Page freezes while simulation endpoint and chat stream fire simultaneously | Disable the floating chat input while a Simulate API call is in-flight; streaming and JSON endpoints use separate fetch lifecycle | Immediately on first simultaneous use |
| PDF generation blocking the API response | `/api/hamilton/report-summary` times out on Vercel's 10-second serverless function limit if PDF is generated inline | Generate the report JSON first (fast); trigger PDF rendering as a separate async step or client-side; do not block the API response on PDF generation | First large report with charts |
| `response_json JSONB` in `hamilton_reports` selected in list queries | Reports list page loads full JSON payload for every report in the list | Always use `SELECT id, title, report_type, created_at, exported_at FROM hamilton_reports WHERE user_id = $1 LIMIT 20` for list views | When a user has 5+ reports |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| `institution_id TEXT NOT NULL` in scenario tables taken from request body | User saves scenarios attributed to any institution, not their own | `institution_id` must come from `users.institution_name` or a verified user profile field server-side — never from the POST body |
| Hamilton mode passed as a URL query param to the agent API | User crafts `?mode=simulate` to bypass the `canRecommend: false` constraint on analyze mode | Mode must be determined server-side from the route (the screen the API call originates from), not from a client-supplied parameter |
| PDF export endpoint with no auth check | Unauthenticated requests trigger Claude API calls for report generation | `/api/hamilton/export-pdf` must call `getCurrentUser()` and verify `canAccessPremium()` before any PDF work begins |
| `hamilton_saved_analyses` visible across users | User queries analyses saved by another institution | Every query against Hamilton tables must include `WHERE user_id = $1` with the ID from `getCurrentUser()` — never trust a `user_id` in the request body |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Simulate screen shows a percentile with no confidence indicator | User treats a "72nd percentile" built on 9 provisional data points as authoritative; makes a pricing decision on bad data | Always show observation count and maturity tier inline: "72nd percentile — provisional (23 observations)" |
| Report screen has an input or slider | Breaks the "Report is read-only and export-first" contract from the product architecture; user tries to re-run analysis from the report view | Report screen must have zero input controls; all configuration happens in Simulate or Analyze; Report is a static artifact |
| Monitor feed shows 50+ signals on initial load | User scans a log, not an intelligence feed; signal value approaches zero | Maximum 3 priority alerts in the hero position; signal feed starts collapsed or capped at 5 visible rows; a "view all signals" expansion is secondary |
| Floating chat visible on the Report screen | User tries to explore analysis via chat from within the export view; chat state is lost when the tab closes | Float chat should be dismissed or hidden on the Report screen; Report is a communication artifact, not an exploration surface |
| Left rail navigation does not indicate which screen the user is on | User loses orientation in a multi-screen workflow | Active screen state in the left rail must be driven by the current route (`usePathname()`), not by client state; deep links must produce the correct active state |

---

## "Looks Done But Isn't" Checklist

- [ ] **Simulation screen:** Verify `SimulationResponse` includes `confidenceTier` field and that the UI renders it. Verify a fee category with fewer than 10 total observations shows "insufficient" maturity, not a numeric percentile.
- [ ] **Agent mode split:** Verify `/pro/research` (AnalystHub) still works after `getHamiltonForMode()` is added to `agents.ts`. Run the existing streaming chat test with `agentId: "hamilton"`.
- [ ] **PDF export:** Verify PDF generation works in a Vercel-simulated environment (`vercel dev`), not just locally. Verify charts appear in the PDF as images, not blank spaces.
- [ ] **Monitor screen:** Verify the signal feed is scoped to the user's watchlist institutions and fee categories — not the full `hamilton_signals` table. Verify `hamilton_priority_alerts` is the primary display surface with `hamilton_signals` secondary.
- [ ] **Hamilton shell CSS isolation:** Toggle between `/admin/market` and a Hamilton screen; verify admin table styles are unchanged. Verify Newsreader font does not appear in admin pages.
- [ ] **Left rail as server component:** Verify `HamiltonShell` does not have `"use client"` at the top. Verify Hamilton screen pages respond to `curl` with populated HTML (server-rendered).
- [ ] **Structured endpoints:** Verify `/api/hamilton/simulate` returns typed JSON, not streaming markdown. Verify the response parses cleanly as `SimulationResponse`.
- [ ] **Scenario soft-delete:** Verify `hamilton_scenarios` and `hamilton_saved_analyses` tables have `deleted_at` column before any data is written to production.
- [ ] **Report list query:** Verify the reports list endpoint does NOT select `report_json`. Verify individual report fetch DOES select `report_json`.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Simulation percentiles shipped without confidence tier | MEDIUM | Add `confidenceTier` to `SimulationResponse` type; update simulation engine to return it; add UI indicator; existing saved scenarios will lack the field — handle with a default of "unknown" until re-run |
| Agent mode split breaks existing AnalystHub | LOW | Revert `getHamilton("pro")` to its pre-change state; move mode-specific logic to `getHamiltonForMode()` only; the streaming endpoint is stateless so no data migration needed |
| Monitor is a log viewer (100+ signals displayed) | MEDIUM | Add severity filter and LIMIT to signal query; implement priority alert promotion logic; retrospectively mark existing signals with severity scores; cap UI to 20 rows |
| PDF charts are blank in production | MEDIUM | Identify if failure is native module (`canvas`) or renderer incompatibility; switch to a pure-JS chart-to-image library; if using client-side `html2canvas`, implement as a client-initiated download instead of server-generated file |
| Hamilton CSS leaks into admin pages | LOW | Wrap all Hamilton-specific CSS under `.hamilton-shell` selector; test admin pages; a CSS scoping change is surgical and low-risk |
| Structured endpoint contract abandoned mid-build | HIGH | Requires retrofitting Simulate and Report screens to consume typed JSON; free-form markdown parsers are brittle and must be replaced; the later this is caught, the more screen-level rework is needed |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Simulation percentiles without confidence tier | Phase 3 (types) — add `confidenceTier` to `SimulationResponse` before engine is built | Simulate screen with a low-data fee category shows "insufficient" maturity label |
| Agent mode split breaking existing chat | Phase 4 (agent behavior) — create `getHamiltonForMode()` as additive, not destructive | Existing `/pro/research` AnalystHub passes streaming chat test after Phase 4 |
| Monitor complexity creep | Phase 3 (data model) + Phase 5 (Monitor frontend) — priority alerts as hero, signal feed secondary | Monitor screen initial load shows max 3 priority alerts; signal feed is collapsed by default |
| Recharts in PDF renderer | Phase 5 (Report frontend) — chart-to-PNG strategy resolved before any chart in PDF layout | PDF export contains chart images (not blank) in a Vercel-simulated environment |
| Editorial CSS leaking into admin | Phase 1 (architecture cleanup) — `.hamilton-shell` CSS isolation established | `/admin/market` table styles unchanged after Hamilton CSS is added |
| Client component bloat in shell | Phase 5 (shell) — `HamiltonShell` stays server component | `curl` on Hamilton screen URLs returns populated HTML; `HamiltonShell` has no `"use client"` |
| Generic streaming endpoint for all screens | Phase 3 (types) + Phase 4 (agent) — screen-specific response types and builders before frontend | `/api/hamilton/simulate` returns valid `SimulationResponse` JSON; no markdown parsing in Simulate screen |
| Unbounded scenario/analysis tables | Phase 3 (data model) — soft-delete and LIMIT in schema from day one | `hamilton_scenarios` migration includes `deleted_at`; list queries have `LIMIT 20` |

---

## Sources

- Direct inspection: `src/lib/research/agents.ts` (PRO_PREFIX, existing agent config pattern)
- Direct inspection: `src/lib/hamilton/voice.ts`, `generate.ts`, `types.ts` (existing Hamilton structure)
- Direct inspection: `src/app/pro/research/analyst-hub.tsx` (streaming markdown pattern, extractMetrics usage)
- Direct inspection: `src/app/pro/layout.tsx` (server/client boundary pattern for layouts)
- Direct inspection: `src/app/pro/research/page.tsx` (how `getHamilton("pro")` is currently called)
- Hamilton design package: `06-api-and-agent-contracts.md` (screen response contracts)
- Hamilton design package: `05-data-model-and-persistence.md` (schema stub)
- Hamilton design package: `01-product-architecture.md` (non-negotiable screen boundaries)
- Hamilton design package: `stub/types-revamp.ts`, `stub/modes.ts`, `stub/sql-schema.sql`
- `CLAUDE.md` project constraints: content quality, cost, accuracy, no overlap
- `.planning/PROJECT.md` — current state: 58 approved fees (0.3%), data sparsity context
- MEMORY.md: maturity badge system (strong/provisional/insufficient), fee tier system, design system tokens

---
*Pitfalls research for: Hamilton Pro Platform — 5-screen decision system on existing Next.js App Router app*
*Researched: 2026-04-08*

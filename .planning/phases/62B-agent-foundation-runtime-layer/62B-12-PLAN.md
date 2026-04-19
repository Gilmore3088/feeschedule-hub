---
phase: 62B
plan: 12
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/admin/agents/agent-tabs.tsx
  - src/app/admin/agents/layout.tsx
  - src/app/admin/agents/overview/tiles.tsx
  - src/lib/crawler-db/agent-console-types.ts
  - src/app/admin/agents/__tests__/tiles.test.tsx
autonomous: true
gap_closure: true
requirements: [OBS-05, OBS-03]
must_haves:
  truths:
    - "A user visiting /admin/agents for the first time can read the page header and understand what each of the 4 tabs is for without running SQL or reading the runbook"
    - "A user hovering any of the 5 health-metric tiles sees a plain-English one-sentence definition of that metric"
    - "Numeric metric values are colored per threshold band (emerald = healthy, amber = watch, red = critical) so drift is visible at a glance"
    - "A page-level legend explains the 5 health dimensions and their units above the tile grid"
  artifacts:
    - path: src/app/admin/agents/agent-tabs.tsx
      provides: "Tab nav with title-attribute tooltips and visible subtitles per tab"
    - path: src/app/admin/agents/layout.tsx
      provides: "Page-level intro paragraph explaining the Agents Console 4-tab model"
    - path: src/lib/crawler-db/agent-console-types.ts
      provides: "HEALTH_METRIC_DESCRIPTIONS + HEALTH_METRIC_UNITS + HEALTH_METRIC_THRESHOLDS maps"
    - path: src/app/admin/agents/overview/tiles.tsx
      provides: "Tile tooltips, threshold color bands, page-level legend card"
  key_links:
    - from: "agent-tabs.tsx TABS array"
      to: "tooltip + subtitle rendering"
      via: "description field on each tab record; title attribute + <span> subtitle"
      pattern: "description:"
    - from: "tiles.tsx"
      to: "HEALTH_METRIC_DESCRIPTIONS / HEALTH_METRIC_THRESHOLDS"
      via: "import from agent-console-types"
      pattern: "HEALTH_METRIC_DESCRIPTIONS"
---

<objective>
Close UAT Gaps 3 and 4 — Agent Console UX clarity. The Agents Console ships correctly (21/22 unit tests green, 4 tabs render, dark mode clean), but a new user cannot tell what the tabs or tiles mean without reading the runbook or the source code. This plan adds in-UI semantic context without changing data flow.

Purpose: Transform /admin/agents from a debug tool that requires the runbook open on a second monitor into a self-explanatory page. Every tab gets a one-line subtitle, every metric tile gets a tooltip + threshold color, and the page gets an intro legend so James (the sole reader) stops having to re-derive the framework context on every visit.

Output: Updated tab nav with subtitles/tooltips, a legend card above the Overview tile grid, threshold-colored metric values, and a companion descriptions/thresholds map shipped in agent-console-types.ts so both server pages and client tiles can read them.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/62B-agent-foundation-runtime-layer/62B-CONTEXT.md
@.planning/phases/62B-agent-foundation-runtime-layer/62B-UAT.md
@.planning/runbooks/agent-bootstrap.md

<interfaces>
<!-- Key types the executor needs. Do not re-read agent-console-types.ts - these are the full exports. -->

From src/lib/crawler-db/agent-console-types.ts:
```typescript
export type HealthMetric =
  | "loop_completion_rate"
  | "review_latency_seconds"
  | "pattern_promotion_rate"
  | "confidence_drift"
  | "cost_to_value_ratio";

export const HEALTH_METRICS: HealthMetric[] = [
  "loop_completion_rate",
  "review_latency_seconds",
  "pattern_promotion_rate",
  "confidence_drift",
  "cost_to_value_ratio",
];

export const HEALTH_METRIC_LABELS: Record<HealthMetric, string> = {
  loop_completion_rate: "Loop Completion",
  review_latency_seconds: "Review Latency",
  pattern_promotion_rate: "Pattern Promotion",
  confidence_drift: "Confidence Drift",
  cost_to_value_ratio: "Cost / Value",
};

export type AgentHealthTile = {
  agent_name: string;
  metrics: {
    loop_completion_rate: number | null;
    review_latency_seconds: number | null;
    pattern_promotion_rate: number | null;
    confidence_drift: number | null;
    cost_to_value_ratio: number | null;
  };
  bucket_start: string | null;
};
```

Current tab array structure (src/app/admin/agents/agent-tabs.tsx:6-11):
```typescript
const TABS: { label: string; href: string; exact?: boolean }[] = [
  { label: "Overview", href: "/admin/agents", exact: true },
  { label: "Lineage", href: "/admin/agents/lineage" },
  { label: "Messages", href: "/admin/agents/messages" },
  { label: "Replay", href: "/admin/agents/replay" },
];
```

Runbook §7 SLA table (source of truth for metric thresholds):
- LOG < 100ms, REVIEW < 15min, IMPROVE < 5min, Escalation < 24h, Digest review < 48h
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Add HEALTH_METRIC_DESCRIPTIONS, HEALTH_METRIC_UNITS, and HEALTH_METRIC_THRESHOLDS to agent-console-types.ts</name>
  <files>src/lib/crawler-db/agent-console-types.ts</files>
  <read_first>
    - src/lib/crawler-db/agent-console-types.ts (full file — will add three new exports without touching existing ones)
    - .planning/runbooks/agent-bootstrap.md §7 (SLAs per Loop Step — source of truth for latency thresholds)
  </read_first>
  <action>
    Append three new exports at the bottom of `src/lib/crawler-db/agent-console-types.ts`, after `HEALTH_METRIC_LABELS` and before the lineage types. Do NOT modify any existing export. Copy these values verbatim:

    ```typescript
    /**
     * One-sentence plain-English definition for each health metric.
     * Surfaced as tooltip text on Overview tiles (UAT Gap 4).
     * Source: .planning/runbooks/agent-bootstrap.md + D-15.
     */
    export const HEALTH_METRIC_DESCRIPTIONS: Record<HealthMetric, string> = {
      loop_completion_rate:
        "Share of review cycles that finished all 5 loop steps (LOG → REVIEW → DISSECT → UNDERSTAND → IMPROVE) without error or timeout.",
      review_latency_seconds:
        "Time from an unreviewed agent_event being written to the agent's review() being invoked by the dispatcher.",
      pattern_promotion_rate:
        "Share of IMPROVE proposals that passed the adversarial canary gate and were committed as a new lesson.",
      confidence_drift:
        "Signed change in mean extraction/verification confidence vs. the rolling 7-day baseline. Positive = improving, negative = regressing.",
      cost_to_value_ratio:
        "Dollars of Anthropic API spend per validated output unit (e.g. per accepted fee, per resolved handshake). Lower is better.",
    };

    /**
     * Unit suffix for each metric; shown next to the value in the Overview legend.
     */
    export const HEALTH_METRIC_UNITS: Record<HealthMetric, string> = {
      loop_completion_rate: "% (0-100)",
      review_latency_seconds: "seconds (lower is better)",
      pattern_promotion_rate: "% (0-100)",
      confidence_drift: "signed ratio (target: ≥ 0)",
      cost_to_value_ratio: "$ per validated unit (lower is better)",
    };

    /**
     * Threshold bands for coloring metric values (UAT Gap 4).
     * - `healthy`: value is in a good state → emerald
     * - `watch`: value is drifting but not critical → amber
     * - else: critical → red
     *
     * Each band is a predicate; the first one that returns true wins.
     * Anchored to runbook §7 SLA table (REVIEW < 15min = 900s).
     */
    export const HEALTH_METRIC_THRESHOLDS: Record<
      HealthMetric,
      { healthy: (v: number) => boolean; watch: (v: number) => boolean }
    > = {
      loop_completion_rate: {
        healthy: (v) => v >= 0.95,
        watch: (v) => v >= 0.85,
      },
      review_latency_seconds: {
        healthy: (v) => v <= 900,
        watch: (v) => v <= 1800,
      },
      pattern_promotion_rate: {
        healthy: (v) => v >= 0.5,
        watch: (v) => v >= 0.2,
      },
      confidence_drift: {
        healthy: (v) => v >= -0.01,
        watch: (v) => v >= -0.05,
      },
      cost_to_value_ratio: {
        healthy: (v) => v <= 2.0,
        watch: (v) => v <= 5.0,
      },
    };
    ```

    Leave `agent-console.ts` re-exports untouched for now (tile consumer imports directly from `agent-console-types` per comment at top of file).
  </action>
  <verify>
    <automated>grep -c "^export const HEALTH_METRIC_DESCRIPTIONS" src/lib/crawler-db/agent-console-types.ts && grep -c "^export const HEALTH_METRIC_UNITS" src/lib/crawler-db/agent-console-types.ts && grep -c "^export const HEALTH_METRIC_THRESHOLDS" src/lib/crawler-db/agent-console-types.ts && npx tsc --noEmit --project tsconfig.json</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "^export const HEALTH_METRIC_DESCRIPTIONS" src/lib/crawler-db/agent-console-types.ts` returns 1
    - `grep -c "^export const HEALTH_METRIC_UNITS" src/lib/crawler-db/agent-console-types.ts` returns 1
    - `grep -c "^export const HEALTH_METRIC_THRESHOLDS" src/lib/crawler-db/agent-console-types.ts` returns 1
    - All 5 HealthMetric keys appear in each of the three new maps (grep each literal: `loop_completion_rate`, `review_latency_seconds`, `pattern_promotion_rate`, `confidence_drift`, `cost_to_value_ratio` appear at minimum 3 times each when grepped against the new block)
    - `npx tsc --noEmit` exits 0 (no type errors introduced)
    - Existing exports `HEALTH_METRICS`, `HEALTH_METRIC_LABELS`, `AgentHealthTile`, `HealthMetric` are unchanged — diff shows only additions
  </acceptance_criteria>
  <done>Three new exports (HEALTH_METRIC_DESCRIPTIONS, HEALTH_METRIC_UNITS, HEALTH_METRIC_THRESHOLDS) present in agent-console-types.ts, TypeScript compile clean, no existing symbols modified.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Add tab subtitles + tooltips + page-level intro to agents console header</name>
  <files>src/app/admin/agents/agent-tabs.tsx, src/app/admin/agents/layout.tsx</files>
  <read_first>
    - src/app/admin/agents/agent-tabs.tsx (full file — will extend TABS shape and replace the <Link> body)
    - src/app/admin/agents/layout.tsx (full file — will replace the single-line <p> with a richer intro card)
  </read_first>
  <action>
    **Part A — `src/app/admin/agents/agent-tabs.tsx`:**

    Replace the `TABS` constant and the `<Link>` body so each tab carries a `description` and a `subtitle`, rendered as a `title` attribute (tooltip) plus a visible second line under the tab label. Preserve the existing active-state styling and aria-current. Use this exact replacement for the TABS array and the <Link> JSX body:

    ```typescript
    const TABS: {
      label: string;
      href: string;
      exact?: boolean;
      subtitle: string;
      description: string;
    }[] = [
      {
        label: "Overview",
        href: "/admin/agents",
        exact: true,
        subtitle: "Agent health at a glance",
        description:
          "5 health metrics × N agents (loop completion, review latency, pattern promotion, confidence drift, cost/value) with 7-day sparklines.",
      },
      {
        label: "Lineage",
        href: "/admin/agents/lineage",
        subtitle: "Trace a published fee to source",
        description:
          "Enter a fee_published_id and walk Tier 3 → Tier 2 → Tier 1 → R2 document within 3 clicks.",
      },
      {
        label: "Messages",
        href: "/admin/agents/messages",
        subtitle: "Agent-to-agent conversations",
        description:
          "Inter-agent handshake log grouped by correlation_id: intent, state, round count, participants.",
      },
      {
        label: "Replay",
        href: "/admin/agents/replay",
        subtitle: "Read-only timeline by correlation_id",
        description:
          "Reconstruct what an agent did at a given moment. Paste a correlation_id to see the events + messages timeline. Read-only (D-16).",
      },
    ];
    ```

    Then in the `<Link>` block, add `title={t.description}` and change the label rendering from `{t.label}` to a two-line stack:

    ```tsx
    <Link
      href={t.href}
      title={t.description}
      aria-current={active ? "page" : undefined}
      aria-describedby={`tab-subtitle-${t.href}`}
      className={`inline-flex flex-col items-start justify-center min-h-11 px-3 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[oklch(0.14_0_0)] ${
        active
          ? "bg-gray-900 text-white dark:bg-white/10 dark:text-gray-100"
          : "text-gray-500 hover:text-gray-900 hover:bg-black/[0.04] dark:hover:text-gray-100 dark:hover:bg-white/[0.04]"
      }`}
    >
      <span className="text-[12px] font-semibold leading-tight">{t.label}</span>
      <span
        id={`tab-subtitle-${t.href}`}
        className={`text-[10px] leading-tight mt-0.5 ${
          active ? "text-white/70 dark:text-gray-300" : "text-gray-400 dark:text-gray-500"
        }`}
      >
        {t.subtitle}
      </span>
    </Link>
    ```

    Also change the <li> wrapper to drop `h-8` if present and let flex-col grow — examine the current wrapper; only the <Link> changes. Keep the <ul> flex row layout as-is.

    **Part B — `src/app/admin/agents/layout.tsx`:**

    Replace the current `<header>` block (lines 25-32 approximately) with a richer intro. Keep the existing `<Breadcrumbs>`, `<AgentTabs>`, and children. The new header should read:

    ```tsx
    <header className="admin-card p-4">
      <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
        Agents
      </h1>
      <p className="text-[12px] text-gray-500 dark:text-gray-400 mt-1 max-w-3xl">
        Debug console for the v10.0 agent team (Hamilton, Knox, Darwin, Atlas + 51 state agents).
        Answers four questions: <strong className="text-gray-700 dark:text-gray-300">how healthy are the agents</strong> (Overview),
        <strong className="text-gray-700 dark:text-gray-300"> where did this number come from</strong> (Lineage),
        <strong className="text-gray-700 dark:text-gray-300"> what are the agents arguing about</strong> (Messages), and
        <strong className="text-gray-700 dark:text-gray-300"> exactly what did the agent do at 14:32</strong> (Replay).
        All four tabs are read-only — no re-execute buttons anywhere.
      </p>
    </header>
    ```

    Wrap it so the intro sits in an `admin-card` for visual weight but does not compete with the Overview tile grid below. Do not change the layout root `<div>`.
  </action>
  <verify>
    <automated>grep -c "subtitle:" src/app/admin/agents/agent-tabs.tsx && grep -c "title={t.description}" src/app/admin/agents/agent-tabs.tsx && grep -c "Debug console for the v10.0 agent team" src/app/admin/agents/layout.tsx && npx tsc --noEmit --project tsconfig.json</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "subtitle:" src/app/admin/agents/agent-tabs.tsx` returns 4 (one per tab)
    - `grep -c "description:" src/app/admin/agents/agent-tabs.tsx` returns 4
    - `grep -c "title={t.description}" src/app/admin/agents/agent-tabs.tsx` returns 1
    - `grep -c "aria-describedby" src/app/admin/agents/agent-tabs.tsx` returns 1
    - `grep -c "Debug console for the v10.0 agent team" src/app/admin/agents/layout.tsx` returns 1
    - `grep -c "how healthy are the agents" src/app/admin/agents/layout.tsx` returns 1
    - `grep -c "where did this number come from" src/app/admin/agents/layout.tsx` returns 1
    - `grep -c "what are the agents arguing about" src/app/admin/agents/layout.tsx` returns 1
    - `grep -c "exactly what did the agent do" src/app/admin/agents/layout.tsx` returns 1
    - `npx tsc --noEmit` exits 0
    - Existing `aria-current` and active-state class logic preserved (grep `aria-current` still returns 1 in agent-tabs.tsx)
  </acceptance_criteria>
  <done>Tab nav shows label + subtitle + hover tooltip; layout header explains the 4-tab purpose in one paragraph; TypeScript compile clean.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Add tooltips, threshold colors, and a legend card to Overview tiles + extend test</name>
  <files>src/app/admin/agents/overview/tiles.tsx, src/app/admin/agents/__tests__/tiles.test.tsx</files>
  <read_first>
    - src/app/admin/agents/overview/tiles.tsx (full file — will add legend + modify tile markup)
    - src/app/admin/agents/__tests__/tiles.test.tsx (existing 4 tests — will add 3 new ones)
    - src/lib/crawler-db/agent-console-types.ts (after Task 1 — to confirm new exports exist)
  </read_first>
  <behavior>
    - Test 1 (new): When a tile renders a non-null value, its root element has a `title` attribute equal to `HEALTH_METRIC_DESCRIPTIONS[metric]`.
    - Test 2 (new): When `loop_completion_rate = 0.95`, the value element has class or data attribute matching `healthy` (emerald color). When `loop_completion_rate = 0.5`, it matches `critical` (red).
    - Test 3 (new): The component renders a legend card containing all 5 metric labels at least once above the tile grid.
    - Existing 4 tests remain green.
  </behavior>
  <action>
    **Part A — `src/app/admin/agents/overview/tiles.tsx`:**

    1. Extend the import from `@/lib/crawler-db/agent-console-types` to also pull:
       ```typescript
       HEALTH_METRIC_DESCRIPTIONS,
       HEALTH_METRIC_UNITS,
       HEALTH_METRIC_THRESHOLDS,
       ```

    2. Add a helper function **above** the `formatMetric` function:
       ```typescript
       type ThresholdBand = "healthy" | "watch" | "critical";

       function getThresholdBand(metric: HealthMetric, value: number | null): ThresholdBand | null {
         if (value === null) return null;
         const t = HEALTH_METRIC_THRESHOLDS[metric];
         if (t.healthy(value)) return "healthy";
         if (t.watch(value)) return "watch";
         return "critical";
       }

       const BAND_CLASSES: Record<ThresholdBand, string> = {
         healthy: "text-emerald-600 dark:text-emerald-400",
         watch: "text-amber-600 dark:text-amber-400",
         critical: "text-red-600 dark:text-red-400",
       };
       ```

    3. Add a Legend component **above** the `Tiles` export:
       ```tsx
       function Legend() {
         return (
           <section
             data-testid="health-legend"
             className="admin-card p-4"
             aria-label="Health metric legend"
           >
             <h2 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
               What these metrics mean
             </h2>
             <dl className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2 text-[11px]">
               {HEALTH_METRICS.map((m) => (
                 <div key={m}>
                   <dt className="font-semibold text-gray-900 dark:text-gray-100">
                     {HEALTH_METRIC_LABELS[m]}
                     <span className="ml-1.5 text-[10px] font-normal text-gray-500 dark:text-gray-400">
                       {HEALTH_METRIC_UNITS[m]}
                     </span>
                   </dt>
                   <dd className="text-gray-500 dark:text-gray-400 leading-snug">
                     {HEALTH_METRIC_DESCRIPTIONS[m]}
                   </dd>
                 </div>
               ))}
             </dl>
             <p className="mt-3 text-[10px] text-gray-400 dark:text-gray-500">
               Color bands: <span className="text-emerald-600 dark:text-emerald-400 font-semibold">emerald</span> healthy
               · <span className="text-amber-600 dark:text-amber-400 font-semibold">amber</span> watch
               · <span className="text-red-600 dark:text-red-400 font-semibold">red</span> critical.
             </p>
           </section>
         );
       }
       ```

    4. In the `Tiles` component, render `<Legend />` **above** the outer `<div className="flex flex-col gap-4">` agent list. Place it inside a new outer wrapper:
       ```tsx
       return (
         <div className="flex flex-col gap-4">
           <Legend />
           <div className="flex flex-col gap-4">
             {data.map((agent) => ( ... existing agent section ... ))}
           </div>
         </div>
       );
       ```

    5. In the tile markup (the existing `<div data-testid="agent-tile" ...>` block), modify it to:
       - Add `title={HEALTH_METRIC_DESCRIPTIONS[metric]}` on the root `<div>`
       - Add `data-band={getThresholdBand(metric, value) ?? "none"}` on the root `<div>`
       - Change the value span's className to include the band color:
         ```tsx
         const band = getThresholdBand(metric, value);
         // ...
         <span
           data-testid="tile-value"
           className={`text-lg font-bold tabular-nums ${band ? BAND_CLASSES[band] : "text-gray-900 dark:text-gray-100"}`}
         >
           {formatMetric(metric, value)}
         </span>
         ```
       - Keep the existing label span, agent_name span, and sparkline block unchanged.

    Preserve every existing `data-testid`. Do not change the empty-state card.

    **Part B — `src/app/admin/agents/__tests__/tiles.test.tsx`:**

    Append three new test cases inside the existing `describe("Tiles (OBS-05)", ...)` block (after the existing 4 tests). Do not modify the existing tests. Use this verbatim:

    ```typescript
      it("renders tile root with title attribute from HEALTH_METRIC_DESCRIPTIONS (Gap 4 tooltip)", () => {
        const data: AgentHealthTile[] = [
          {
            agent_name: "knox",
            bucket_start: "2026-04-16T00:00:00Z",
            metrics: {
              loop_completion_rate: 0.95,
              review_latency_seconds: 60,
              pattern_promotion_rate: 0.5,
              confidence_drift: 0.01,
              cost_to_value_ratio: 2.5,
            },
          },
        ];
        render(<Tiles data={data} sparklines={{}} />);
        const loopTile = screen
          .getAllByTestId("agent-tile")
          .find((el) => el.getAttribute("data-metric") === "loop_completion_rate");
        expect(loopTile).toBeTruthy();
        expect(loopTile!.getAttribute("title")).toMatch(/5 loop steps/i);
      });

      it("applies threshold band (healthy for 0.95, critical for 0.5) on loop_completion_rate", () => {
        const healthy: AgentHealthTile[] = [
          {
            agent_name: "knox",
            bucket_start: "2026-04-16T00:00:00Z",
            metrics: {
              loop_completion_rate: 0.95,
              review_latency_seconds: 60,
              pattern_promotion_rate: 0.5,
              confidence_drift: 0.01,
              cost_to_value_ratio: 2.5,
            },
          },
        ];
        const { unmount } = render(<Tiles data={healthy} sparklines={{}} />);
        const healthyTile = screen
          .getAllByTestId("agent-tile")
          .find((el) => el.getAttribute("data-metric") === "loop_completion_rate");
        expect(healthyTile!.getAttribute("data-band")).toBe("healthy");
        unmount();

        const critical: AgentHealthTile[] = [
          {
            agent_name: "knox",
            bucket_start: "2026-04-16T00:00:00Z",
            metrics: {
              loop_completion_rate: 0.5,
              review_latency_seconds: 60,
              pattern_promotion_rate: 0.5,
              confidence_drift: 0.01,
              cost_to_value_ratio: 2.5,
            },
          },
        ];
        render(<Tiles data={critical} sparklines={{}} />);
        const criticalTile = screen
          .getAllByTestId("agent-tile")
          .find((el) => el.getAttribute("data-metric") === "loop_completion_rate");
        expect(criticalTile!.getAttribute("data-band")).toBe("critical");
      });

      it("renders the legend card with all 5 metric labels", () => {
        const data: AgentHealthTile[] = [
          {
            agent_name: "knox",
            bucket_start: "2026-04-16T00:00:00Z",
            metrics: {
              loop_completion_rate: 0.95,
              review_latency_seconds: 60,
              pattern_promotion_rate: 0.5,
              confidence_drift: 0.01,
              cost_to_value_ratio: 2.5,
            },
          },
        ];
        render(<Tiles data={data} sparklines={{}} />);
        const legend = screen.getByTestId("health-legend");
        expect(legend.textContent).toMatch(/Loop Completion/);
        expect(legend.textContent).toMatch(/Review Latency/);
        expect(legend.textContent).toMatch(/Pattern Promotion/);
        expect(legend.textContent).toMatch(/Confidence Drift/);
        expect(legend.textContent).toMatch(/Cost \/ Value/);
      });
    ```
  </action>
  <verify>
    <automated>npx vitest run src/app/admin/agents/__tests__/tiles.test.tsx --reporter=verbose</automated>
  </verify>
  <acceptance_criteria>
    - `npx vitest run src/app/admin/agents/__tests__/tiles.test.tsx` exits 0 with 7 passing tests (4 existing + 3 new)
    - `grep -c "HEALTH_METRIC_DESCRIPTIONS" src/app/admin/agents/overview/tiles.tsx` returns ≥ 2 (import + usage)
    - `grep -c "HEALTH_METRIC_THRESHOLDS" src/app/admin/agents/overview/tiles.tsx` returns ≥ 2
    - `grep -c "data-testid=\"health-legend\"" src/app/admin/agents/overview/tiles.tsx` returns 1
    - `grep -c "data-band=" src/app/admin/agents/overview/tiles.tsx` returns 1
    - `grep -c "title={HEALTH_METRIC_DESCRIPTIONS" src/app/admin/agents/overview/tiles.tsx` returns 1
    - `npx tsc --noEmit` exits 0
    - Existing tile `data-testid="agent-tile"` and `data-testid="sparkline"` still present (grep each, both return ≥ 1)
  </acceptance_criteria>
  <done>Overview tab renders a legend card above the agent grid, each tile has a hover tooltip (HTML title), and numeric values are colored emerald/amber/red per threshold bands. 7/7 tiles tests green.</done>
</task>

</tasks>

<verification>
## Overall Phase Checks

Run automated verification:
```bash
npx tsc --noEmit
npx vitest run src/app/admin/agents/
grep -c "^export const HEALTH_METRIC_DESCRIPTIONS" src/lib/crawler-db/agent-console-types.ts
grep -c "subtitle:" src/app/admin/agents/agent-tabs.tsx
grep -c "data-testid=\"health-legend\"" src/app/admin/agents/overview/tiles.tsx
```

Expected:
- tsc exits 0
- vitest run on agents/ passes (22 existing + 3 new = 25 total, zero failures)
- descriptions export present (1)
- 4 subtitles in TABS
- Legend testid present (1)

## Manual UAT Retest (blocked by Gap 1 plan; re-run after both merged)
- Visit /admin/agents → header shows "Debug console for the v10.0 agent team..." paragraph with 4 bolded questions
- Each tab shows label on line 1, subtitle on line 2 (e.g., "Agent health at a glance")
- Hover any tab → browser tooltip appears with the description
- Overview tab: Legend card visible at top listing all 5 metrics + units + color-band key
- Each tile hover: browser tooltip appears with metric definition
- Loop Completion = 95% renders in emerald; a critical value renders in red
</verification>

<success_criteria>
- UAT Test 3 ("pass but i dont understand them") can be re-run and pass on user comprehension
- UAT Test 4 ("pass although no super clear") can be re-run and pass
- No regressions in existing tiles.test.tsx (4 original tests still green)
- Three new tests added; all 3 green
- TypeScript clean
- No changes to server queries, no DB touches, no nav changes outside /admin/agents
</success_criteria>

<output>
After completion, create `.planning/phases/62B-agent-foundation-runtime-layer/62B-12-SUMMARY.md` documenting:
- HEALTH_METRIC_DESCRIPTIONS / UNITS / THRESHOLDS added to agent-console-types.ts
- Tab nav extended with subtitles + tooltips
- Layout intro paragraph added
- Overview tiles: tooltips + threshold colors + legend card
- 3 new tile tests green, 4 existing still green
- Files touched: 4
</output>

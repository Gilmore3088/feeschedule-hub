---
phase: 62B
plan: 10
type: execute
wave: 5
depends_on: [62B-01, 62B-06, 62B-09]
files_modified:
  - src/app/admin/admin-nav.tsx
  - src/app/admin/agents/layout.tsx
  - src/app/admin/agents/page.tsx
  - src/app/admin/agents/overview/tiles.tsx
  - src/app/admin/agents/lineage/page.tsx
  - src/app/admin/agents/lineage/tree-view.tsx
  - src/app/admin/agents/messages/page.tsx
  - src/app/admin/agents/messages/thread-view.tsx
  - src/app/admin/agents/replay/page.tsx
  - src/app/admin/agents/replay/timeline.tsx
  - src/lib/crawler-db/agent-console.ts
  - src/app/admin/agents/__tests__/tiles.test.tsx
  - src/app/admin/agents/__tests__/tree-view.test.tsx
  - src/app/admin/agents/replay/__tests__/timeline.test.tsx
autonomous: false
requirements: [OBS-03, OBS-04]
must_haves:
  truths:
    - "AdminNav includes a new 'Agents' link pointing at /admin/agents"
    - "/admin/agents renders 4 tabs: Overview, Lineage, Messages, Replay (Radix Tabs)"
    - "Overview tab shows 5 health-metric tiles × top-level agents + a sparkline per tile reusing src/components/sparkline.tsx"
    - "Lineage tab accepts a fee_published_id input and renders a hierarchical collapsible tree (Tier 3 → Tier 2 → Tier 1 → R2 link) powered by lineage_graph()"
    - "Lineage tree reaches the R2 link in <=3 expansions (OBS-03 3-click bar)"
    - "Messages tab lists recent agent_messages threads grouped by correlation_id, showing state, intent, round_number"
    - "Replay tab accepts a correlation_id and renders the timeline from v_agent_reasoning_trace (via get_reasoning_trace tool or direct query)"
    - "Replay is read-only — no re-execute button per D-16"
    - "OBS-04 replay UI: vitest `src/app/admin/agents/replay/__tests__/timeline.test.tsx` mounts <Timeline rows={...}/> with a mixed events+messages fixture and asserts items render in created_at order with kind badges"
  artifacts:
    - path: src/app/admin/agents/layout.tsx
      provides: "4-tab shell using Radix Tabs"
    - path: src/lib/crawler-db/agent-console.ts
      provides: "Server-side queries: getAgentHealthTiles, getReasoningTrace, getLineageGraph, listRecentThreads"
    - path: src/app/admin/agents/lineage/tree-view.tsx
      provides: "Recursive Radix Collapsible tree for JSON lineage"
  key_links:
    - from: "AdminNav Agents link"
      to: "/admin/agents/layout.tsx"
      via: "href in NAV_GROUPS array"
      pattern: "label: \"Agents\""
    - from: "Overview tiles"
      to: "getAgentHealthTiles in agent-console.ts"
      via: "server component fetch + sparkline mapping"
      pattern: "Sparkline"
    - from: "Lineage tree"
      to: "lineage_graph(fee_published_id) SQL function"
      via: "getLineageGraph server query"
      pattern: "lineage_graph"
---

<objective>
Ship the fused `/admin/agents` console (D-13, D-14, D-16, OBS-03, OBS-04): 4 tabs (Overview / Lineage / Messages / Replay), reusing `.admin-card`, `Sparkline`, Radix Tabs + Collapsible — no new design work. This is an admin debug tool, not a dashboard (per §specifics line 166 of CONTEXT).

The backend data already exists:
- OBS-05 tiles → `fee_crawler/agent_base/health_rollup.py` helpers (but this is TS side — we mirror them in `src/lib/crawler-db/agent-console.ts`)
- OBS-01/02 lineage → `lineage_graph()` SQL function
- COMMS-05 replay → `v_agent_reasoning_trace` view
- Messages → `agent_messages` table directly

Purpose: OBS-03 ("admin UI traces in 3 clicks") and OBS-04 ("replay by reasoning_hash") have no UI yet. This plan provides it.

Output: 10 TS/TSX files (UI) + 1 server-side query module + 2 vitest files.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/62B-agent-foundation-runtime-layer/62B-CONTEXT.md
@.planning/phases/62B-agent-foundation-runtime-layer/62B-RESEARCH.md
@src/app/admin/admin-nav.tsx
@src/app/admin/layout.tsx
@src/components/sparkline.tsx
@src/lib/crawler-db/connection.ts

<interfaces>
Existing (do not redesign):
- `src/components/sparkline.tsx` — `<Sparkline data={number[]} width={64} height={24} />`
- `.admin-card` CSS class for consistent card styling
- Radix Tabs + Collapsible primitives already installed (used by command-palette)
- `src/lib/crawler-db/connection.ts` — canonical `postgres` client setup (`prepare: false` for Supavisor)
- `src/app/admin/admin-nav.tsx` — nav structure to extend
- `src/app/admin/layout.tsx` — admin shell

Database (from 62B-01):
- `lineage_graph(p_fee_published_id BIGINT) RETURNS JSONB` — `{tier_3: {row, children: [{tier_2: {...}}]}}`
- `v_agent_reasoning_trace` view: `kind, correlation_id, created_at, agent_name, intent_or_action, tool_name, entity, payload, row_id`
- `agent_health_rollup` table with 5 metrics
- `agent_messages` with state enum, round_number
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Server-side agent-console query module + Overview tiles + Lineage tree</name>
  <files>src/lib/crawler-db/agent-console.ts, src/app/admin/agents/layout.tsx, src/app/admin/agents/page.tsx, src/app/admin/agents/overview/tiles.tsx, src/app/admin/agents/lineage/page.tsx, src/app/admin/agents/lineage/tree-view.tsx, src/app/admin/admin-nav.tsx, src/app/admin/agents/__tests__/tiles.test.tsx, src/app/admin/agents/__tests__/tree-view.test.tsx, src/app/admin/agents/replay/__tests__/timeline.test.tsx</files>
  <read_first>
    - src/app/admin/admin-nav.tsx (understand NAV_GROUPS shape + `usePathname()` active-state pattern)
    - src/app/admin/layout.tsx (sticky header + content grid conventions)
    - src/components/sparkline.tsx (API: data array, width, height)
    - src/lib/crawler-db/connection.ts (postgres client, `sql` tagged template usage)
    - src/lib/crawler-db/fees.ts OR src/lib/crawler-db/fee-index.ts (existing query module pattern — imports, exports, tagged template style)
    - .planning/phases/62B-agent-foundation-runtime-layer/62B-CONTEXT.md D-13..D-17 (console design)
    - .planning/phases/62B-agent-foundation-runtime-layer/62B-RESEARCH.md §Mechanics 11 (nav integration + layout pattern + tree view)
    - Memory note on design system from MEMORY.md ("Bloomberg-density admin aesthetic", admin-card class, tabular-nums, Geist font)
  </read_first>
  <behavior>
    - Test 1 (tiles): Rendered with 2 agents × 5 metrics = 10 tiles; each tile shows metric label, latest value, and a Sparkline
    - Test 2 (tiles): Missing values render as em-dash (—) not NaN
    - Test 3 (tree): Rendered with a lineage JSON tree → 3 expansions reveal Tier 3 → Tier 2 → Tier 1 → R2 link
    - Test 4 (tree): Collapsible at Tier 3 is default-expanded; Tier 2 and Tier 1 default-collapsed
    - Test 5 (timeline, OBS-04): Rendered with a mixed fixture (1 event + 1 message, different timestamps) → items render in created_at order; kind badge (event/message) visible on each row; no re-execute button present (D-16)
  </behavior>
  <action>
**File 1: `src/lib/crawler-db/agent-console.ts`**

Follow the existing module pattern (look at `src/lib/crawler-db/fee-index.ts` for reference):

```typescript
import { getDb } from './connection';

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

export type HealthMetric =
  | 'loop_completion_rate'
  | 'review_latency_seconds'
  | 'pattern_promotion_rate'
  | 'confidence_drift'
  | 'cost_to_value_ratio';

const HEALTH_METRICS: HealthMetric[] = [
  'loop_completion_rate', 'review_latency_seconds', 'pattern_promotion_rate',
  'confidence_drift', 'cost_to_value_ratio',
];

export async function getAgentHealthTiles(agentNames?: string[]): Promise<AgentHealthTile[]> {
  const sql = getDb();
  const rows = agentNames && agentNames.length > 0
    ? await sql`
        SELECT DISTINCT ON (agent_name) agent_name, bucket_start,
               loop_completion_rate, review_latency_seconds,
               pattern_promotion_rate, confidence_drift, cost_to_value_ratio
          FROM agent_health_rollup
         WHERE agent_name = ANY(${agentNames})
         ORDER BY agent_name, bucket_start DESC
      `
    : await sql`
        SELECT DISTINCT ON (agent_name) agent_name, bucket_start,
               loop_completion_rate, review_latency_seconds,
               pattern_promotion_rate, confidence_drift, cost_to_value_ratio
          FROM agent_health_rollup
         ORDER BY agent_name, bucket_start DESC
      `;
  return rows.map((r: any) => ({
    agent_name: r.agent_name,
    bucket_start: r.bucket_start?.toISOString?.() ?? null,
    metrics: {
      loop_completion_rate: r.loop_completion_rate !== null ? Number(r.loop_completion_rate) : null,
      review_latency_seconds: r.review_latency_seconds !== null ? Number(r.review_latency_seconds) : null,
      pattern_promotion_rate: r.pattern_promotion_rate !== null ? Number(r.pattern_promotion_rate) : null,
      confidence_drift: r.confidence_drift !== null ? Number(r.confidence_drift) : null,
      cost_to_value_ratio: r.cost_to_value_ratio !== null ? Number(r.cost_to_value_ratio) : null,
    },
  }));
}

export async function getAgentHealthSparkline(
  agentName: string, metric: HealthMetric, bucketCount = 672,
): Promise<number[]> {
  if (!HEALTH_METRICS.includes(metric)) {
    throw new Error(`unknown metric: ${metric}`);
  }
  const sql = getDb();
  // Dynamic identifier is safe because metric is validated above.
  const rows = await sql.unsafe(
    `SELECT ${metric} AS v FROM agent_health_rollup
       WHERE agent_name = $1 ORDER BY bucket_start DESC LIMIT $2`,
    [agentName, bucketCount],
  );
  return rows.reverse().map((r: any) => Number(r.v ?? 0));
}

export type LineageGraph = any;  // JSONB tree — shape documented in lineage_graph() COMMENT

export async function getLineageGraph(feePublishedId: number): Promise<LineageGraph | null> {
  const sql = getDb();
  const rows = await sql`SELECT lineage_graph(${feePublishedId}::BIGINT) AS g`;
  return rows[0]?.g ?? null;
}

export type ReasoningTraceRow = {
  kind: 'event' | 'message';
  created_at: string;
  agent_name: string;
  intent_or_action: string | null;
  tool_name: string | null;
  entity: string | null;
  payload: unknown;
  row_id: string;
};

export async function getReasoningTrace(correlationId: string, maxRows = 500): Promise<ReasoningTraceRow[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT kind, created_at, agent_name, intent_or_action, tool_name, entity, payload, row_id
      FROM v_agent_reasoning_trace
     WHERE correlation_id = ${correlationId}::UUID
     ORDER BY created_at
     LIMIT ${maxRows}
  `;
  return rows.map((r: any) => ({
    kind: r.kind,
    created_at: r.created_at?.toISOString?.() ?? String(r.created_at),
    agent_name: r.agent_name,
    intent_or_action: r.intent_or_action,
    tool_name: r.tool_name,
    entity: r.entity,
    payload: r.payload,
    row_id: r.row_id,
  }));
}

export type MessageThread = {
  correlation_id: string;
  latest_state: string;
  round_count: number;
  latest_intent: string;
  started_at: string;
  participants: string[];
};

export async function listRecentThreads(sinceHours = 72, limit = 50): Promise<MessageThread[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT correlation_id,
           MIN(created_at) AS started_at,
           MAX(round_number) AS round_count,
           (ARRAY_AGG(intent ORDER BY created_at DESC))[1] AS latest_intent,
           (ARRAY_AGG(state ORDER BY created_at DESC))[1] AS latest_state,
           ARRAY_AGG(DISTINCT sender_agent) AS participants
      FROM agent_messages
     WHERE created_at > NOW() - make_interval(hours => ${sinceHours})
     GROUP BY correlation_id
     ORDER BY started_at DESC
     LIMIT ${limit}
  `;
  return rows.map((r: any) => ({
    correlation_id: r.correlation_id,
    latest_state: r.latest_state,
    round_count: Number(r.round_count),
    latest_intent: r.latest_intent,
    started_at: r.started_at?.toISOString?.() ?? String(r.started_at),
    participants: r.participants,
  }));
}
```

**File 2: `src/app/admin/agents/layout.tsx`** (4-tab shell + Radix Tabs)
Use Radix Tabs primitive. Server component wrapping client TabsList (since Tabs require state). Place sticky tab bar under the admin header. Apply `.admin-card` wrappers to each panel.

**File 3: `src/app/admin/agents/page.tsx`** — Overview default tab
Server component: call `getAgentHealthTiles()`, pass to `<Tiles data={...} />` client component.

**File 4: `src/app/admin/agents/overview/tiles.tsx`**
Grid of 5 metrics × N agents. Each tile: Sparkline + latest value. Use `.admin-card`, `text-lg font-bold tabular-nums` for values (per memory design system).

**File 5: `src/app/admin/agents/lineage/page.tsx`**
Server component with search input (query param `?fee=123`) that calls `getLineageGraph(feeId)` and renders `<TreeView graph={...} />` client component. Accept input via form submit → `?fee=...` URL param.

**File 6: `src/app/admin/agents/lineage/tree-view.tsx`** (client)
Radix Collapsible; recursive render of the JSON tree. Tier 3 (level=3) default-expanded. Each child node: header row + collapsible content. Link to `r2_key` rendered as a plain anchor at the leaf (Tier 1). Reach R2 in 3 expansions (Tier 3 default-expanded → Tier 2 click → Tier 1 click → R2 link visible).

**File 7: `src/app/admin/agents/messages/page.tsx`**
Server component calls `listRecentThreads()`, renders a table of correlation_id, latest_state, round_count, latest_intent, participants. Click row → `/admin/agents/replay?correlation=<id>` (reuse Replay for detail view).

**File 8: `src/app/admin/agents/messages/thread-view.tsx`** (client)
Optional: in-place thread expand on the Messages list showing the ordered messages in that correlation. If MVP-tight, skip this file and route to Replay instead. Create stub file with a `// TODO` comment if not filling this iteration — but the file MUST exist for the plan's files_modified contract.

**File 9: `src/app/admin/agents/replay/page.tsx`**
Server component with `?correlation=...` param; calls `getReasoningTrace(correlationId)`; renders `<Timeline rows={...} />`. Read-only — no "re-execute" button (per D-16).

**File 10: `src/app/admin/agents/replay/timeline.tsx`** (client)
Simple vertical timeline showing events + messages interleaved by created_at. Each item: kind badge (event/message), agent_name, intent_or_action, tool_name/entity, payload preview (first 200 chars, expandable).

**File 11: `src/app/admin/admin-nav.tsx` — EDIT**
Add a new group or item:
```tsx
{
  label: "Agents",
  href: "/admin/agents",
  // icon: optional; match existing pattern
}
```
Preserve the existing NAV_GROUPS shape — read the file first and match.

**Test file: `src/app/admin/agents/__tests__/tiles.test.tsx`**
Vitest + React Testing Library. Render `<Tiles data={[{agent_name: 'knox', metrics: {loop_completion_rate: 0.95, review_latency_seconds: 60, pattern_promotion_rate: null, confidence_drift: 0.01, cost_to_value_ratio: 2.5}}]} />`.
- Assert 5 tiles for 'knox' exist
- Assert '—' appears for null pattern_promotion_rate
- Assert Sparkline component is present (data-testid on Sparkline)

**Test file: `src/app/admin/agents/__tests__/tree-view.test.tsx`**
Render `<TreeView graph={{...}} />` with 3-tier lineage graph. Simulate 2 clicks (Tier 2 then Tier 1) and assert the R2 link is visible. Verify OBS-03 3-click bar.

**Test file: `src/app/admin/agents/replay/__tests__/timeline.test.tsx` (OBS-04)**
Vitest + React Testing Library. Render `<Timeline rows={[{kind:"event", created_at:"2026-04-16T00:00:00Z", agent_name:"darwin", intent_or_action:"review", tool_name:"_agent_base", entity:"_review", payload:{}, row_id:"e1"}, {kind:"message", created_at:"2026-04-16T00:00:05Z", agent_name:"darwin", intent_or_action:"challenge", tool_name:null, entity:"agent_messages", payload:{question:"why?"}, row_id:"m1"}]} />`.
- Assert both rows render in order (event first since its created_at is earlier).
- Assert each row shows a kind badge with the exact string `event` or `message` (data-testid="kind-badge" or CSS class match).
- Assert NO button with text matching `/re-execute/i` exists (D-16 read-only guarantee).
This is the OBS-04 UI-side test — pairs with the Python `test_replay_by_hash` test in 62B-05 Task 2 which covers the SQL layer.

Follow existing vitest patterns in the repo (`vitest.config.ts` uses vite-tsconfig-paths for @/ alias).
  </action>
  <verify>
    <automated>npx vitest run src/app/admin/agents/</automated>
  </verify>
  <acceptance_criteria>
    - File `src/lib/crawler-db/agent-console.ts` exists with `getAgentHealthTiles`, `getAgentHealthSparkline`, `getLineageGraph`, `getReasoningTrace`, `listRecentThreads` exports
    - All 4 tab route files exist: `src/app/admin/agents/page.tsx`, `lineage/page.tsx`, `messages/page.tsx`, `replay/page.tsx`
    - Layout file `src/app/admin/agents/layout.tsx` uses Radix Tabs (grep `@radix-ui/react-tabs`)
    - `src/app/admin/admin-nav.tsx` contains the string `agents` (lowercase) in an href attribute
    - Tree-view vitest passes: R2 link becomes visible after ≤3 user click events
    - Tiles vitest: 5 tiles per agent + handles null values
    - Timeline vitest passes (OBS-04): mixed-fixture render preserves created_at order, kind badges render, no re-execute button present
    - `npx tsc --noEmit` has no new errors (build-clean; if pre-existing errors, at minimum nothing introduced by this plan's files)
  </acceptance_criteria>
  <done>10 UI files + 1 server module + 3 vitest files (tiles, tree-view, timeline); all pass.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: Verify /admin/agents console end-to-end</name>
  <what-built>
Full /admin/agents console with 4 tabs (Overview, Lineage, Messages, Replay). 10 new TSX files + 1 server query module + nav entry. All backed by existing DB objects from 62B-01 and 62B-09.
  </what-built>
  <how-to-verify>
    1. Start dev server: `npm run dev`
    2. Log in as admin
    3. Navigate to /admin/agents — confirm 4 tabs visible
    4. Overview tab: tiles render (may be empty if no agent_health_rollup rows exist locally — run `SELECT refresh_agent_health_rollup()` against local DB first to seed)
    5. Lineage tab: paste a fee_published_id (or "1" if one exists in local DB) → assert you reach the R2 link within 3 expansions (Tier 3 default-open; click Tier 2 chevron; click Tier 1 chevron). OBS-03 bar met.
    6. Messages tab: confirms recent agent_messages threads render (may be empty locally — seed one via SQL or Python test to exercise).
    7. Replay tab: paste a correlation_id from an existing agent_events row; confirm timeline renders ordered events + messages. Confirm NO re-execute button visible.
    8. Visual: tiles use .admin-card; headings use Geist tracking-tight; values are tabular-nums. Match existing admin aesthetic.
  </how-to-verify>
  <resume-signal>Type "approved" if all 4 tabs work and OBS-03 3-click bar is met. Describe any issues otherwise.</resume-signal>
  <action>Checkpoint task — see <how-to-verify> or <context> for operator steps. Execution is manual; no autonomous action required.</action>
  <verify>
    <automated>echo 'checkpoint: human sign-off required per resume-signal'</automated>
  </verify>
  <done>Operator types the resume-signal string (e.g., 'approved') to unblock.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Admin session → /admin/agents | admin role enforced by existing admin layout auth guard |
| getAgentHealthSparkline → dynamic metric column | metric name whitelisted against HEALTH_METRICS before interpolation |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-62B-10-01 | Spoofing | Non-admin user reaches /admin/agents | mitigate | Existing admin layout checks role via `getCurrentUser()` + redirects non-admin — inherited by the `/admin/agents` subroute. No additional auth needed. |
| T-62B-10-02 | Tampering | fee_published_id input injection | mitigate | Cast to BIGINT via `${feePublishedId}::BIGINT` in tagged template; postgres client parameterizes. |
| T-62B-10-03 | Tampering | metric string injection | mitigate | `HEALTH_METRICS` whitelist check before `sql.unsafe`; only 5 allowed column names. |
| T-62B-10-04 | Elevation of Privilege | Replay tab re-executes agent calls | accept | Design is READ-ONLY per D-16. No mutation endpoint exposed. Review ensures no POST/PUT routes added. |
</threat_model>

<verification>
- All 10 UI files present
- vitest passes for tiles + tree-view
- Manual click-through meets OBS-03 3-click bar
</verification>

<success_criteria>
- [ ] 4 tabs render
- [ ] Overview tiles use Sparkline + .admin-card
- [ ] Lineage tree meets 3-click bar
- [ ] Messages lists threads with state/round
- [ ] Replay timeline is read-only
- [ ] AdminNav link works
</success_criteria>

<output>
After completion, create `.planning/phases/62B-agent-foundation-runtime-layer/62B-10-SUMMARY.md` noting: the 4-tab shell structure, the Radix Collapsible recursion depth decision, any deviations from tree default-expansion, and the thread-view.tsx MVP status.
</output>

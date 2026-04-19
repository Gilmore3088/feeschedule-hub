---
phase: 62B
plan: 13
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/crawler-db/agent-console.ts
  - src/lib/crawler-db/agent-console-types.ts
  - src/app/admin/agents/lineage/page.tsx
  - src/app/admin/agents/lineage/recent-picker.tsx
  - src/app/admin/agents/__tests__/recent-picker.test.tsx
autonomous: true
gap_closure: true
requirements: [OBS-02, OBS-03]
must_haves:
  truths:
    - "A user visiting /admin/agents/lineage sees up to 10 recently-published fee IDs as clickable rows, without typing anything"
    - "Clicking a recent-trace row navigates to /admin/agents/lineage?fee=<id> and renders the tree"
    - "The error card when fee_published_id is not found contains a plain-English explanation, NOT raw JSON visible by default"
    - "If raw JSON is shown, it sits behind a <details> element that is collapsed by default"
    - "When fees_published is empty, the page shows a plain-English empty state mentioning the pipeline, with zero raw SQL visible"
  artifacts:
    - path: src/app/admin/agents/lineage/page.tsx
      provides: "Updated Lineage page with Recent Traces panel above the input + cleaned error states"
    - path: src/app/admin/agents/lineage/recent-picker.tsx
      provides: "Client component that renders clickable rows or empty state"
    - path: src/lib/crawler-db/agent-console.ts
      provides: "New export: listRecentPublishedFees(limit=10)"
    - path: src/lib/crawler-db/agent-console-types.ts
      provides: "New export: RecentPublishedFee type"
  key_links:
    - from: "lineage/page.tsx"
      to: "listRecentPublishedFees"
      via: "server-side fetch before render"
      pattern: "listRecentPublishedFees"
    - from: "recent-picker.tsx row click"
      to: "?fee=<id> URL param"
      via: "Link href"
      pattern: "href={`/admin/agents/lineage?fee="
---

<objective>
Close UAT Gaps 5 and 6b — make the Lineage tab discoverable and hide implementation noise. Gap 6a (zero rows in fees_published) is handled by Plan 62B-14 — this plan fixes only the UX.

Purpose: Let James trace a lineage chain without running SQL. The Recent Traces panel surfaces the last 10 published fees as clickable rows; the empty state explains why the list is empty; the error state uses plain English and hides diagnostic JSON behind a collapsed details disclosure.

Output: A new listRecentPublishedFees DB query, a RecentPicker client component, a rewritten Lineage page with the picker above the input, and cleaned error/empty-state copy.
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

<interfaces>
From src/lib/crawler-db/agent-console-types.ts (existing):
```typescript
export type LineageGraph = { tier_3?: LineageTier3 } | null;
export type LineageError = {
  code: "fee_published_not_found" | "tier_2_missing" | "tier_1_missing";
  details: Record<string, unknown>;
};
```

From src/lib/crawler-db/agent-console.ts (existing):
```typescript
export async function getLineageGraph(feePublishedId: number): Promise<LineageGraphResult>;
export async function listRecentThreads(sinceHours = 72, limit = 50): Promise<MessageThread[]>;
```

fees_published columns (supabase/migrations/20260420_fees_tier_tables.sql):
- fee_published_id BIGSERIAL PK
- published_at TIMESTAMPTZ
- canonical_fee_key TEXT NOT NULL  (NOT `fee_category` — use this column)
- institution_id INTEGER NOT NULL
- fee_name TEXT NOT NULL
- amount NUMERIC(12,2)
- frequency TEXT
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Add listRecentPublishedFees query + RecentPublishedFee type</name>
  <files>src/lib/crawler-db/agent-console.ts, src/lib/crawler-db/agent-console-types.ts</files>
  <read_first>
    - src/lib/crawler-db/agent-console.ts (full file)
    - src/lib/crawler-db/agent-console-types.ts (full file)
    - supabase/migrations/20260420_fees_tier_tables.sql (confirm fees_published column names)
  </read_first>
  <action>
    Part A — append to src/lib/crawler-db/agent-console-types.ts AFTER MessageThread (at EOF):

    ```typescript
    /**
     * Recent published fee for the Lineage picker (UAT Gap 6b).
     * Sourced from fees_published ORDER BY published_at DESC LIMIT 10.
     */
    export type RecentPublishedFee = {
      fee_published_id: number;
      canonical_fee_key: string;
      institution_id: number;
      fee_name: string;
      published_at: string;
    };
    ```

    Part B — in src/lib/crawler-db/agent-console.ts:

    1. Add `type RecentPublishedFee,` to the top `import { ... } from "./agent-console-types"` block.
    2. Add `RecentPublishedFee,` to the `export type { ... }` re-export block.
    3. Append this function at EOF (after listRecentThreads):

    ```typescript
    /**
     * Recent published fees for the Lineage tab picker (UAT Gap 6b).
     */
    export async function listRecentPublishedFees(
      limit = 10,
    ): Promise<RecentPublishedFee[]> {
      const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 50);
      const rows = (await sql`
        SELECT fee_published_id,
               canonical_fee_key,
               institution_id,
               fee_name,
               published_at
          FROM fees_published
         ORDER BY published_at DESC
         LIMIT ${safeLimit}
      `) as unknown as Record<string, unknown>[];
      return rows.map((r) => ({
        fee_published_id: Number(r.fee_published_id),
        canonical_fee_key: String(r.canonical_fee_key ?? ""),
        institution_id: Number(r.institution_id ?? 0),
        fee_name: String(r.fee_name ?? ""),
        published_at: toIso(r.published_at) ?? "",
      }));
    }
    ```

    Do NOT modify getLineageGraph, getReasoningTrace, listRecentThreads, getAgentHealthTiles, or getAgentHealthSparkline.
  </action>
  <verify>
    <automated>grep -c "^export type RecentPublishedFee" src/lib/crawler-db/agent-console-types.ts && grep -c "export async function listRecentPublishedFees" src/lib/crawler-db/agent-console.ts && npx tsc --noEmit --project tsconfig.json</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "^export type RecentPublishedFee" src/lib/crawler-db/agent-console-types.ts` returns 1
    - `grep -c "export async function listRecentPublishedFees" src/lib/crawler-db/agent-console.ts` returns 1
    - `grep -c "RecentPublishedFee" src/lib/crawler-db/agent-console.ts` returns >= 2
    - `grep -c "FROM fees_published" src/lib/crawler-db/agent-console.ts` returns 1
    - `npx tsc --noEmit` exits 0
    - Existing exports unchanged (diff is additions only)
  </acceptance_criteria>
  <done>New type + query exported; TypeScript compile clean.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Create RecentPicker client component + vitest</name>
  <files>src/app/admin/agents/lineage/recent-picker.tsx, src/app/admin/agents/__tests__/recent-picker.test.tsx</files>
  <read_first>
    - src/app/admin/agents/lineage/page.tsx (reference for admin-card + dark-mode class patterns)
    - src/lib/crawler-db/agent-console-types.ts (after Task 1 — confirm RecentPublishedFee shape)
  </read_first>
  <behavior>
    - Given 3 rows, renders 3 `<a>` tags with href `/admin/agents/lineage?fee=<id>`
    - Given empty array, renders plain-English empty state mentioning "No published fees yet" and "run the pipeline"
    - Does NOT render `<pre>` in either case
    - Empty state does NOT contain the substring `fee_published_id":`
  </behavior>
  <action>
    Part A — create src/app/admin/agents/lineage/recent-picker.tsx:

    ```tsx
    "use client";

    import Link from "next/link";
    import type { RecentPublishedFee } from "@/lib/crawler-db/agent-console-types";

    type Props = {
      items: RecentPublishedFee[];
    };

    export function RecentPicker({ items }: Props) {
      if (items.length === 0) {
        return (
          <section
            data-testid="recent-picker-empty"
            className="admin-card p-4"
            aria-label="Recent published fees — empty"
          >
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Recent Traces
            </h2>
            <p className="mt-2 text-[12px] text-gray-600 dark:text-gray-300">
              No published fees yet — run the pipeline (Darwin verifies, Knox extracts,
              Hamilton reviews) to produce fee_published rows before tracing.
            </p>
            <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
              Once published fees exist they will appear here as clickable shortcuts.
            </p>
          </section>
        );
      }

      return (
        <section
          data-testid="recent-picker"
          className="admin-card p-3"
          aria-label="Recent published fees"
        >
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 px-1 pb-2">
            Recent Traces — click a row to load its lineage
          </h2>
          <ul className="flex flex-col divide-y divide-black/[0.06] dark:divide-white/[0.06]">
            {items.map((it) => (
              <li key={it.fee_published_id}>
                <Link
                  href={`/admin/agents/lineage?fee=${it.fee_published_id}`}
                  className="flex items-center gap-3 px-2 py-2 min-h-11 rounded-md hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition-colors"
                >
                  <span
                    className="text-[11px] font-mono tabular-nums text-gray-900 dark:text-gray-100 w-20"
                    data-testid="recent-picker-id"
                  >
                    #{it.fee_published_id}
                  </span>
                  <span className="text-[12px] text-gray-700 dark:text-gray-200 flex-1 truncate">
                    {it.fee_name || it.canonical_fee_key}
                  </span>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">
                    inst {it.institution_id}
                  </span>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 tabular-nums">
                    {it.published_at.slice(0, 10)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      );
    }
    ```

    Part B — create src/app/admin/agents/__tests__/recent-picker.test.tsx:

    ```tsx
    // @vitest-environment jsdom
    import { describe, it, expect, afterEach } from "vitest";
    import { cleanup, render, screen } from "@testing-library/react";
    import { RecentPicker } from "../lineage/recent-picker";
    import type { RecentPublishedFee } from "@/lib/crawler-db/agent-console-types";

    afterEach(() => {
      cleanup();
    });

    const SAMPLE: RecentPublishedFee[] = [
      {
        fee_published_id: 1,
        canonical_fee_key: "monthly_maintenance",
        institution_id: 42,
        fee_name: "Monthly Maintenance",
        published_at: "2026-04-18T12:00:00Z",
      },
      {
        fee_published_id: 2,
        canonical_fee_key: "overdraft",
        institution_id: 99,
        fee_name: "Overdraft Fee",
        published_at: "2026-04-17T12:00:00Z",
      },
      {
        fee_published_id: 3,
        canonical_fee_key: "nsf",
        institution_id: 7,
        fee_name: "NSF Fee",
        published_at: "2026-04-16T12:00:00Z",
      },
    ];

    describe("RecentPicker (UAT Gap 6b)", () => {
      it("renders one clickable Link per item with correct href", () => {
        render(<RecentPicker items={SAMPLE} />);
        const link1 = screen.getByRole("link", { name: /Monthly Maintenance/ });
        expect(link1.getAttribute("href")).toBe("/admin/agents/lineage?fee=1");
        const link2 = screen.getByRole("link", { name: /Overdraft Fee/ });
        expect(link2.getAttribute("href")).toBe("/admin/agents/lineage?fee=2");
        expect(screen.getAllByTestId("recent-picker-id").length).toBe(3);
      });

      it("shows explanatory empty state (no raw JSON) when items is empty", () => {
        render(<RecentPicker items={[]} />);
        const emptyCard = screen.getByTestId("recent-picker-empty");
        expect(emptyCard.textContent).toMatch(/No published fees yet/);
        expect(emptyCard.textContent).toMatch(/run the pipeline/);
        // Guard against Gap 5 regression — no raw JSON in the empty state.
        expect(emptyCard.textContent).not.toMatch(/fee_published_id"\s*:/);
        expect(emptyCard.querySelector("pre")).toBeNull();
      });

      it("does not render JSON <pre> for non-empty case", () => {
        const { container } = render(<RecentPicker items={SAMPLE} />);
        expect(container.querySelectorAll("pre").length).toBe(0);
      });
    });
    ```
  </action>
  <verify>
    <automated>npx vitest run src/app/admin/agents/__tests__/recent-picker.test.tsx --reporter=verbose</automated>
  </verify>
  <acceptance_criteria>
    - `npx vitest run src/app/admin/agents/__tests__/recent-picker.test.tsx` exits 0 with 3 passing tests
    - `grep -c "data-testid=\"recent-picker\"" src/app/admin/agents/lineage/recent-picker.tsx` returns 1
    - `grep -c "data-testid=\"recent-picker-empty\"" src/app/admin/agents/lineage/recent-picker.tsx` returns 1
    - `grep -c "No published fees yet" src/app/admin/agents/lineage/recent-picker.tsx` returns 1
    - `grep -c "run the pipeline" src/app/admin/agents/lineage/recent-picker.tsx` returns 1
    - `grep -c "<pre" src/app/admin/agents/lineage/recent-picker.tsx` returns 0
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>RecentPicker renders clickable rows OR plain-English empty state, 3/3 tests green, zero JSON leak.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Wire RecentPicker into lineage/page.tsx + hide JSON behind details disclosure (Gap 5)</name>
  <files>src/app/admin/agents/lineage/page.tsx</files>
  <read_first>
    - src/app/admin/agents/lineage/page.tsx (current file — full replacement)
    - src/app/admin/agents/lineage/recent-picker.tsx (after Task 2 — confirm export symbol)
  </read_first>
  <action>
    Replace the entire contents of src/app/admin/agents/lineage/page.tsx with this exact content:

    ```tsx
    import {
      getLineageGraph,
      listRecentPublishedFees,
      type LineageError,
      type LineageGraph,
      type RecentPublishedFee,
    } from "@/lib/crawler-db/agent-console";
    import { RecentPicker } from "./recent-picker";
    import { TreeView } from "./tree-view";

    export const dynamic = "force-dynamic";

    type SearchParams = { fee?: string };

    const LINEAGE_ERROR_MESSAGES: Record<LineageError["code"], string> = {
      fee_published_not_found:
        "That fee_published_id does not exist in fees_published. Pick one from the Recent Traces list below, or check the table if you expected a specific ID.",
      tier_2_missing:
        "Lineage broken: the Tier-2 (fees_verified) row is missing. This is a data integrity issue — check the promote_to_tier3 handshake log in Messages.",
      tier_1_missing:
        "Lineage broken: the Tier-1 (fees_raw) row is missing. This is a data integrity issue — the extraction source row was deleted or never written.",
    };

    export default async function AgentsLineagePage({
      searchParams,
    }: {
      searchParams: Promise<SearchParams>;
    }) {
      const params = await searchParams;
      const feeParam = params.fee?.trim();
      const feeId = feeParam ? Number(feeParam) : null;
      const validFeeId =
        feeId !== null && Number.isFinite(feeId) && Number.isInteger(feeId) && feeId > 0
          ? feeId
          : null;

      let graph: LineageGraph = null;
      let loadError: string | null = null;
      let lineageError: LineageError | null = null;
      let recent: RecentPublishedFee[] = [];
      let recentError: string | null = null;

      try {
        recent = await listRecentPublishedFees(10);
      } catch (err) {
        recentError = err instanceof Error ? err.message : String(err);
      }

      if (validFeeId !== null) {
        try {
          const result = await getLineageGraph(validFeeId);
          if (result.ok) {
            graph = result.graph;
          } else {
            lineageError = result.error;
          }
        } catch (err) {
          loadError = err instanceof Error ? err.message : String(err);
        }
      }

      return (
        <section className="flex flex-col gap-3">
          <div className="admin-card p-4 text-[12px] text-gray-600 dark:text-gray-300 max-w-3xl">
            <p>
              Trace a published fee back through its pipeline:{" "}
              <strong>
                Tier 3 published → Tier 2 verified → Tier 1 raw → R2 source document
              </strong>
              . Pick a recent trace below, or paste a fee_published_id you already know.
            </p>
          </div>

          <form
            method="GET"
            action="/admin/agents/lineage"
            className="admin-card p-3 flex items-center gap-2"
          >
            <label
              htmlFor="fee"
              className="text-[11px] font-semibold uppercase tracking-wider text-gray-500"
            >
              Fee Published ID
            </label>
            <input
              id="fee"
              name="fee"
              type="number"
              defaultValue={feeParam ?? ""}
              placeholder="e.g. 123"
              className="h-8 rounded-md border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] px-2 text-[12px] tabular-nums w-36"
            />
            <button
              type="submit"
              className="min-h-11 rounded-md bg-gray-900 dark:bg-white/10 text-white text-[12px] font-semibold px-3 py-2 hover:bg-gray-800 dark:hover:bg-white/20"
            >
              Trace
            </button>
            <span className="text-[11px] text-gray-500 dark:text-gray-400 ml-auto">
              3-click bar: Tier 3 expanded → Tier 2 → Tier 1 → R2 link
            </span>
          </form>

          {recentError && (
            <div className="admin-card p-3 text-[11px] text-amber-600 dark:text-amber-400">
              Could not load recent traces: {recentError}
            </div>
          )}
          {!recentError && <RecentPicker items={recent} />}

          {feeParam && validFeeId === null && (
            <div className="admin-card p-4 text-[12px] text-amber-600 dark:text-amber-400">
              Invalid fee_published_id. Enter a positive integer.
            </div>
          )}
          {loadError && (
            <div className="admin-card p-4 text-[12px] text-red-600 dark:text-red-400">
              Query failed: {loadError}
            </div>
          )}
          {lineageError && (
            <div
              data-testid="lineage-error-card"
              className="admin-card p-4 text-[12px] text-red-600 dark:text-red-400"
            >
              <div className="font-semibold">
                {LINEAGE_ERROR_MESSAGES[lineageError.code] ?? "Lineage lookup failed."}
              </div>
              {Object.keys(lineageError.details).length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-[11px] text-red-500/80 dark:text-red-300/70 hover:underline">
                    Details (for debugging)
                  </summary>
                  <pre className="mt-2 text-[10px] font-mono text-red-500/80 dark:text-red-300/70 whitespace-pre-wrap">
                    {JSON.stringify(lineageError.details, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          )}

          {validFeeId !== null && !loadError && !lineageError && (
            <TreeView graph={graph} />
          )}

          {validFeeId === null && !feeParam && recent.length === 0 && !recentError && (
            <div className="admin-card p-6 text-center text-sm text-gray-500 dark:text-gray-400">
              Enter a fee_published_id to trace its full lineage chain.
            </div>
          )}
        </section>
      );
    }
    ```

    Key changes vs. previous file:
    - Top-of-page explanation paragraph (Gap 5 — plain English before any inputs)
    - RecentPicker rendered above the form
    - lineageError details wrapped in `<details>` / `<summary>Details (for debugging)</summary>` — collapsed by default (Gap 5 fix)
    - fee_published_not_found copy points user at the Recent Traces list
    - Added data-testid="lineage-error-card" for future tests

    Do NOT modify tree-view.tsx.
  </action>
  <verify>
    <automated>grep -c "listRecentPublishedFees" src/app/admin/agents/lineage/page.tsx && grep -c "RecentPicker" src/app/admin/agents/lineage/page.tsx && grep -c "<details" src/app/admin/agents/lineage/page.tsx && grep -c "Details (for debugging)" src/app/admin/agents/lineage/page.tsx && npx tsc --noEmit --project tsconfig.json && npx vitest run src/app/admin/agents/</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "listRecentPublishedFees" src/app/admin/agents/lineage/page.tsx` returns >= 1
    - `grep -c "RecentPicker" src/app/admin/agents/lineage/page.tsx` returns >= 2 (import + usage)
    - `grep -c "<details" src/app/admin/agents/lineage/page.tsx` returns 1
    - `grep -c "Details (for debugging)" src/app/admin/agents/lineage/page.tsx` returns 1
    - `grep -c "Trace a published fee back through its pipeline" src/app/admin/agents/lineage/page.tsx` returns 1
    - JSON.stringify still present BUT inside <details> block: `grep -A 3 "<details" src/app/admin/agents/lineage/page.tsx` must show `<summary>` before any JSON.stringify
    - `npx tsc --noEmit` exits 0
    - `npx vitest run src/app/admin/agents/` passes all tests (existing 22 + 3 new recent-picker = 25+)
    - Existing `TreeView` import + render preserved (grep `TreeView` returns >= 2)
  </acceptance_criteria>
  <done>Lineage page shows explanation paragraph, Recent Traces panel, and hides debug JSON behind a disclosure triangle. All agents/ vitest tests green.</done>
</task>

</tasks>

<verification>
## Overall Phase Checks

```bash
npx tsc --noEmit
npx vitest run src/app/admin/agents/
grep -c "^export type RecentPublishedFee" src/lib/crawler-db/agent-console-types.ts
grep -c "FROM fees_published" src/lib/crawler-db/agent-console.ts
grep -c "RecentPicker" src/app/admin/agents/lineage/page.tsx
grep -c "<details" src/app/admin/agents/lineage/page.tsx
```

Expected:
- tsc exits 0
- vitest passes all agents/ tests including new recent-picker (3 new)
- type export present, query present, page imports + uses RecentPicker, details disclosure present

## Manual UAT Retest (run AFTER 62B-14 seeds data)
- Visit /admin/agents/lineage → intro paragraph visible; Recent Traces panel listing rows if 62B-14 seeded data, OR the plain-English empty state if not
- Click a recent row → URL becomes `?fee=<id>`, tree renders
- Visit `/admin/agents/lineage?fee=99999999` → error card shows the plain-English "That fee_published_id does not exist..." with a "Details (for debugging)" disclosure that is collapsed
- Click "Details (for debugging)" → JSON appears below

## Dependencies
- Independent of 62B-14 for correctness (the empty-state path is self-sufficient)
- Full Test 6 re-run (tree-render validation) blocked until 62B-14 seeds ≥1 fees_published row
</verification>

<success_criteria>
- UAT Test 5 ("i dont know { fee_published_id: 35 } what this is") retestable — JSON hidden by default
- UAT Test 6 ("i dont know ids") retestable — picker surfaces IDs without SQL
- 3 new recent-picker tests green
- No regressions in existing tiles.test.tsx / tree-view.test.tsx / timeline.test.tsx
- TypeScript clean
- No DB schema changes, no nav changes outside /admin/agents/lineage
</success_criteria>

<output>
After completion, create `.planning/phases/62B-agent-foundation-runtime-layer/62B-13-SUMMARY.md` documenting:
- New listRecentPublishedFees query + RecentPublishedFee type
- New RecentPicker client component with 3 passing tests
- lineage/page.tsx rewritten with picker + intro paragraph + <details> JSON disclosure
- Gap 5 (JSON leak) and Gap 6b (no picker) both closed
- Files touched: 5
</output>

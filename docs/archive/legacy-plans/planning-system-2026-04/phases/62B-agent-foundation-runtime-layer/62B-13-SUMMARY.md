---
phase: 62B-agent-foundation-runtime-layer
plan: 13
subsystem: ui
tags: [nextjs, react, admin, lineage, agents, postgres, vitest]

requires:
  - phase: 62B-agent-foundation-runtime-layer
    provides: "getLineageGraph + LineageError union from 62B-10; admin-card + dark-mode conventions from 62B-10"
  - phase: 62B-agent-foundation-runtime-layer
    provides: "HEALTH_METRIC_DESCRIPTIONS / UNITS / THRESHOLDS maps added in 62B-12 (preserved untouched)"

provides:
  - "listRecentPublishedFees(limit=10) server query"
  - "RecentPublishedFee type"
  - "RecentPicker client component with empty-state card"
  - "Lineage page with intro paragraph + recent-traces picker + <details> disclosure for debug JSON"

affects: ["UAT retest Gaps 5 and 6b", "62B-14 (seed data lands into the picker)"]

tech-stack:
  added: []
  patterns:
    - "Collapsed <details><summary>Details (for debugging)</summary> disclosure for raw diagnostic payloads in admin UI"
    - "RecentPicker pattern: server component renders a thin server-fetched list, client component only needed for the data-testid handles and Link interactivity"

key-files:
  created:
    - src/app/admin/agents/lineage/recent-picker.tsx
    - src/app/admin/agents/__tests__/recent-picker.test.tsx
  modified:
    - src/lib/crawler-db/agent-console-types.ts
    - src/lib/crawler-db/agent-console.ts
    - src/app/admin/agents/lineage/page.tsx

key-decisions:
  - "Empty-state copy is the spec-mandated 'No published fees yet — run the pipeline (Darwin verifies, Knox extracts, Hamilton reviews)' wording"
  - "Kept page.tsx as a server component (no use client) and put the interactive rows into a small RecentPicker client component — follows the repo pattern of pushing use client as low as possible"
  - "Added data-testid=lineage-error-card to the error card so future UAT can assert 'plain-English first, JSON behind summary' without brittle DOM traversal"

patterns-established:
  - "Admin diagnostic payloads: always behind <details>, never as top-level <pre>"
  - "Admin picker empty states: explain WHY the list is empty in plain English and mention the pipeline step that would populate it"

requirements-completed: [OBS-02, OBS-03]

duration: 9min
completed: 2026-04-18
---

# Phase 62B Plan 13: Lineage Picker + Debug JSON Disclosure Summary

**Closes UAT Gap 5 (raw JSON leak) and Gap 6b (no way to discover valid fee_published_ids) on /admin/agents/lineage by adding a server-rendered Recent Traces picker and collapsing diagnostic payloads behind a <details><summary>Details (for debugging)</summary> disclosure.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-04-18T18:36:45Z
- **Completed:** 2026-04-18T18:45:50Z
- **Tasks:** 3
- **Files modified:** 3
- **Files created:** 2

## Accomplishments

- New `listRecentPublishedFees(limit=10)` query selects `fee_published_id, canonical_fee_key, institution_id, fee_name, published_at` from `fees_published` ordered by `published_at DESC`, with a safe-integer clamp `[1, 50]` on the limit
- New `RecentPublishedFee` type exported from `agent-console-types.ts` and re-exported from `agent-console.ts` for single-import ergonomics
- New `RecentPicker` client component renders either (a) a list of clickable `/admin/agents/lineage?fee=<id>` Links, or (b) a plain-English empty-state card explaining the missing pipeline step
- Rewrote `lineage/page.tsx` to add an intro paragraph describing the Tier 3 → Tier 2 → Tier 1 → R2 chain, render RecentPicker above the form, and wrap the `JSON.stringify(lineageError.details)` block inside `<details><summary>Details (for debugging)</summary></details>` collapsed by default
- 3 new vitest cases on RecentPicker pin the href shape, empty-state copy, and absence of `<pre>` tags in either state (direct regression guard against Gap 5)

## Task Commits

1. **Task 1: Add listRecentPublishedFees query + RecentPublishedFee type** — `1e6e538` (feat)
2. **Task 2: RecentPicker client component + vitest coverage** — `7020436` (feat, tests-first TDD)
3. **Task 3: Wire RecentPicker + hide JSON behind details disclosure** — `2312799` (fix)

## Files Created/Modified

- `src/lib/crawler-db/agent-console-types.ts` — added `RecentPublishedFee` type at EOF; 62B-12's `HEALTH_METRIC_DESCRIPTIONS / UNITS / THRESHOLDS` maps preserved unchanged
- `src/lib/crawler-db/agent-console.ts` — imported + re-exported `RecentPublishedFee`; added `listRecentPublishedFees()` at EOF; `getLineageGraph / getReasoningTrace / listRecentThreads / getAgentHealthTiles / getAgentHealthSparkline` untouched
- `src/app/admin/agents/lineage/recent-picker.tsx` (new) — `"use client"` component, `data-testid=recent-picker` / `recent-picker-empty` / `recent-picker-id` for stable tests, renders `<Link>` rows with min-h-11 for 44px tap target, dark-mode variants on every class, `pre` never rendered
- `src/app/admin/agents/__tests__/recent-picker.test.tsx` (new) — 3 cases (`renders one clickable Link per item with correct href`, `shows explanatory empty state (no raw JSON) when items is empty`, `does not render JSON <pre> for non-empty case`)
- `src/app/admin/agents/lineage/page.tsx` — added intro paragraph, recent-traces fetch with try/catch, inline `recentError` banner, RecentPicker render, `<details><summary>` wrap on debug JSON, softened `fee_published_not_found` copy to point users at the list, `data-testid=lineage-error-card`

## Decisions Made

- Empty-state copy kept verbatim per plan: "No published fees yet — run the pipeline (Darwin verifies, Knox extracts, Hamilton reviews) to produce fee_published rows before tracing."
- `page.tsx` remains a Server Component. Only `recent-picker.tsx` is `"use client"` — the `<Link>` items could render from a server component, but the client boundary gives us stable `data-testid` handles and keeps a single picker surface for future keyboard-shortcut / autocomplete upgrades
- Removed the `validFeeId === null && !feeParam` "prompt" card when `recent.length > 0`, since the picker itself is now the prompt — empty prompt only shows when the picker is empty AND the user hasn't typed anything
- Did not change the `<TreeView />` component, the lineage SQL function, the error codes, or the admin nav — scope bounded to /admin/agents/lineage/page.tsx + new files

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## Verification

- `npx tsc --noEmit` — clean
- `npx vitest run src/app/admin/agents/__tests__/recent-picker.test.tsx` — 3/3 passing
- `npx vitest run src/app/admin/agents/` — 53/53 passing across 13 files (no regressions; existing 50 + 3 new)
- `grep -c "^export type RecentPublishedFee" src/lib/crawler-db/agent-console-types.ts` → 1
- `grep -c "export async function listRecentPublishedFees" src/lib/crawler-db/agent-console.ts` → 1
- `grep -c "FROM fees_published" src/lib/crawler-db/agent-console.ts` → 1
- `grep -c "RecentPicker" src/app/admin/agents/lineage/page.tsx` → 2 (import + usage)
- `grep -c "<details" src/app/admin/agents/lineage/page.tsx` → 1
- `grep -c "Details (for debugging)" src/app/admin/agents/lineage/page.tsx` → 1
- 62B-12's `HEALTH_METRIC_DESCRIPTIONS / UNITS / THRESHOLDS` still present (`grep -c` → 3)

## UAT Retest Readiness

- **Gap 5** (JSON leak) — fixed. Re-run Test 5: visit `/admin/agents/lineage?fee=99999999`, confirm the plain-English sentence is primary and the JSON is hidden behind "Details (for debugging)".
- **Gap 6b** (no picker) — fixed UX. With `fees_published` still at 0 rows, the retest sees the plain-English empty state with the "run the pipeline" sentence. After 62B-14 seeds rows, Test 6 can be re-run end-to-end: picker shows rows, click navigates to `?fee=<id>`, tree renders.
- **Gap 6a** (no data) is explicitly 62B-14's responsibility.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- 62B-14 (seed fees_published) will bring the picker to life. No code changes needed in 62B-13 once seed data lands — the picker will automatically render the 10 most-recent rows.
- UAT Gaps 3 and 4 (tab comprehension, metric definitions) are closed by 62B-12. Gaps 5 and 6b are closed by this plan. Only Gap 1 (Vercel hourly failures, external) and Gap 6a (data seeding) remain open from the 62B UAT register.

## Self-Check: PASSED

All 5 source/test files present on disk. All 3 task commits present in `git log`. No missing artifacts.

---
*Phase: 62B-agent-foundation-runtime-layer*
*Completed: 2026-04-18*

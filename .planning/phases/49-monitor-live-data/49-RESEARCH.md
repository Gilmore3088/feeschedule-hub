# Phase 49: Monitor Live Data - Research

**Researched:** 2026-04-09
**Domain:** Next.js server components, Postgres/hamilton_* tables, Vercel AI SDK streaming, React client state
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Remove `seedMonitorData(user.id)` call from `monitor/page.tsx` — no fake signals injected on page load
- **D-02:** Guard or delete `seed-monitor-data.ts` — keep only as a dev-only utility (not called in production page render)
- **D-03:** All monitor data must come from real DB queries via `fetchMonitorPageData()` — already implemented in `monitor-data.ts`
- **D-04:** When hamilton_signals table is empty, show onboarding guidance: "Add institutions to your watchlist to start receiving signals" with a CTA to Settings or watchlist add action
- **D-05:** Empty state must look intentional (designed card), not broken layout
- **D-06:** User can add institutions or Fed agencies to their watchlist — persists to hamilton_watchlists table immediately
- **D-07:** User can remove items from watchlist — deletes from hamilton_watchlists immediately
- **D-08:** Watchlist panel shows real items from DB, not hardcoded names
- **D-09:** FloatingChatOverlay must stream real Hamilton responses via the Hamilton API — verify existing implementation works
- **D-10:** Pinned Institutions section = real watchlist items from hamilton_watchlists table (same data as Monitor watchlist panel)
- **D-11:** Peer Sets section = real saved_peer_sets from the user's Settings configuration
- **D-12:** Saved Analyses section = real entries from hamilton_saved_analyses table (empty state if none)
- **D-13:** Recent Work section = real recent analyses from hamilton_saved_analyses ordered by updated_at
- **D-14:** Strip ALL hardcoded left rail items (Goldman Sachs, Morgan Stanley, Top 5 Global, Domestic Mid-Caps, Overdraft Yield Audit, etc.)

### Claude's Discretion
- How to implement "add to watchlist" UX (inline button, modal, or search)
- Exact empty state visual styling within Hamilton design system
- Whether Simulate a Change CTA in left rail links to /pro/simulate or waits for Phase 52

### Deferred Ideas (OUT OF SCOPE)
- Signal pipeline automation (auto-generating signals from fee changes) — deferred post-v8.1
- "Simulate a Change" CTA in left rail — wire to /pro/simulate in Phase 52
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MON-01 | Signal feed queries real hamilton_signals table with empty state when no data | fetchMonitorPageData() already does this — need only to remove seedMonitorData call and design empty state |
| MON-02 | User can add/remove watchlist items (institutions, Fed agencies) against real hamilton_watchlists table | addToWatchlist/removeFromWatchlist server actions fully implemented; WatchlistPanel already calls them |
| MON-03 | FloatingChatOverlay streams real Hamilton responses | API endpoint exists at /api/research/hamilton and uses toUIMessageStreamResponse(); overlay uses custom SSE parser — format compatibility must be verified |
</phase_requirements>

---

## Summary

Phase 49 is primarily a **surgical removal and wiring phase**, not a build phase. The Monitor screen's data layer (`fetchMonitorPageData`, `addToWatchlist`, `removeFromWatchlist`) is fully implemented and correct. The blocking issue is a single line in `monitor/page.tsx` that calls `seedMonitorData()` before the real fetch, which means demo data short-circuits the real path whenever the DB is empty. Removing that call — and designing a proper empty state for when `hamilton_signals` has no rows — satisfies MON-01 and MON-02.

The left rail (`HamiltonLeftRail.tsx`) has hardcoded `PINNED_INSTITUTIONS` and `PEER_SETS` constants and only conditionally shows them on the Analyze screen. Per D-10 through D-14, these must be replaced with real data from `hamilton_watchlists` (for pinned institutions) and `saved_peer_sets` (for peer sets). Because `HamiltonLeftRail` is a client component that receives props from `HamiltonShell`, which gets them from the server layout, adding watchlist and peer set data requires adding two new fetch calls to the Hamilton layout and threading them through `HamiltonShell` → `HamiltonLeftRail`. This is the largest structural change in this phase.

For MON-03 (chat streaming), the `FloatingChatOverlay` uses a hand-rolled SSE parser targeting the Vercel AI SDK v4 `0:"text"` format. The API endpoint uses `toUIMessageStreamResponse()` from ai SDK v6 (`"ai": "^6.0.116"`), which uses a different stream format (UIMessage protocol). This is a **critical compatibility risk** that must be resolved — either by switching the overlay to `useChat` from `@ai-sdk/react` or by verifying the v6 stream format against the existing parser.

**Primary recommendation:** Remove seedMonitorData call, design empty state, add watchlist+peer data to layout fetch, wire left rail props, verify/fix FloatingChatOverlay SSE parsing. Five discrete tasks, all within existing architecture.

---

## Standard Stack

This phase uses only existing project dependencies — no new packages required.

| Library | Version | Purpose | Role |
|---------|---------|---------|------|
| `postgres` | 3.4.8 | DB queries via `sql` tagged template | All hamilton_* table reads/writes |
| `@ai-sdk/react` | 3.0.118 | `useChat` hook if SSE parser replaced | FloatingChatOverlay streaming |
| `ai` | 6.0.116 | `streamText`, `toUIMessageStreamResponse` | Hamilton API response format |
| Next.js server actions | 16.1.6 | `addToWatchlist`, `removeFromWatchlist` | Watchlist CRUD mutations |
| `revalidatePath` | built-in | Cache invalidation after watchlist mutations | Already used in actions.ts |

**No new installation needed.** [VERIFIED: package.json]

---

## Architecture Patterns

### Current Data Flow (what exists)

```
monitor/page.tsx (Server Component)
  ├── getCurrentUser()
  ├── seedMonitorData(user.id)        ← REMOVE THIS
  └── fetchMonitorPageData(user.id)
        ├── fetchSignalFeed(20)       → SELECT from hamilton_signals
        ├── fetchTopAlert(userId)     → SELECT from hamilton_priority_alerts JOIN hamilton_signals
        ├── fetchStatusMetrics()      → 3 parallel COUNTs
        └── fetchWatchlist(userId)    → SELECT institution_ids from hamilton_watchlists
```

```
HamiltonLayoutInner (Server Component, layout.tsx)
  ├── getCurrentUser()
  ├── ensureHamiltonProTables()
  ├── SELECT from hamilton_saved_analyses  → savedAnalyses[]
  ├── SELECT from hamilton_scenarios       → recentScenarios[]
  └── HamiltonShell(savedAnalyses, recentScenarios)
        └── HamiltonLeftRail(savedAnalyses, recentScenarios)
              └── PINNED_INSTITUTIONS (hardcoded)  ← REPLACE
              └── PEER_SETS (hardcoded)             ← REPLACE
```

### Target Data Flow (after Phase 49)

```
HamiltonLayoutInner (Server Component, layout.tsx)
  ├── getCurrentUser()
  ├── ensureHamiltonProTables()
  ├── SELECT from hamilton_saved_analyses  → savedAnalyses[]
  ├── SELECT from hamilton_scenarios       → recentScenarios[]
  ├── SELECT institution_ids FROM hamilton_watchlists WHERE user_id = userId  → pinnedInstitutions[]  ← ADD
  ├── getSavedPeerSets(String(user.id))    → peerSets[]  ← ADD
  └── HamiltonShell(savedAnalyses, recentScenarios, pinnedInstitutions, peerSets)  ← ADD PROPS
        └── HamiltonLeftRail(savedAnalyses, recentScenarios, pinnedInstitutions, peerSets)  ← ADD PROPS
              └── render from props (no hardcoded constants)
```

### Pattern: Left Rail Data Threading

The left rail is a client component — it cannot fetch data itself. All data must flow server → layout → HamiltonShell → HamiltonLeftRail via props. Adding new data sections requires updating the prop interface at every layer.

Three files change in lockstep:
1. `src/app/pro/(hamilton)/layout.tsx` — add fetch calls, add props to HamiltonShell
2. `src/components/hamilton/layout/HamiltonShell.tsx` — accept and pass new props
3. `src/components/hamilton/layout/HamiltonLeftRail.tsx` — accept props, remove hardcoded constants

[VERIFIED: Read layout.tsx, HamiltonShell.tsx, HamiltonLeftRail.tsx]

### Pattern: getSavedPeerSets userId type mismatch

`getSavedPeerSets(userId: string)` in `saved-peers.ts` takes a `string` (it compares `created_by TEXT`). The layout has `user.id` as `number`. Call it as `getSavedPeerSets(String(user.id))`.

[VERIFIED: Read saved-peers.ts line 27, layout.tsx line 88]

### Pattern: Watchlist fetch in layout vs. monitor-data.ts

`fetchWatchlist(userId)` in `monitor-data.ts` already reads `institution_ids` from `hamilton_watchlists`. The layout needs to do the same query to populate the left rail's Pinned Institutions section. This is intentional duplication — the Monitor page fetches the full `MonitorPageData` bundle (including watchlist) for the right sidebar, while the layout fetches only the `institution_ids` for the left rail. Both read from the same table row.

To keep it DRY, extract a thin `fetchWatchlistIds(userId: number): Promise<string[]>` helper that can be used from both places, or simply inline the query in the layout (acceptable given its simplicity).

### Pattern: Empty State Design Requirement (D-04, D-05)

`SignalFeed.tsx` already has a minimal `EmptyState` component (line 444) that renders a plain paragraph. Per D-04/D-05, this must be replaced with a designed onboarding card that:
- Has a clear headline: "No signals yet"
- Has guidance: "Add institutions to your watchlist to begin monitoring"
- Has a CTA — either a button that scrolls to the WatchlistPanel's input or a link to Settings

The empty state lives inside `SignalFeed.tsx` (the `EmptyState` function). It renders when `allSignals.length === 0`. This is the correct place to update — no changes to `monitor/page.tsx` needed for the empty state.

[VERIFIED: Read SignalFeed.tsx lines 444-459, 461-499]

---

## Critical Finding: FloatingChatOverlay SSE Format Mismatch

### The Risk

`FloatingChatOverlay.tsx` uses a hand-rolled SSE parser:

```typescript
// Line 44-45 in FloatingChatOverlay.tsx
function parseSSEChunk(line: string): string {
  const match = line.match(/^0:"(.*)"$/);
  ...
}
```

This targets the Vercel AI SDK **v4** data stream protocol where text chunks are encoded as `0:"text content"`.

The API endpoint (`/api/research/hamilton/route.ts`) returns:

```typescript
return result.toUIMessageStreamResponse();  // ai SDK v6
```

**`toUIMessageStreamResponse()` in ai SDK v6 uses the UIMessage stream protocol**, which emits structured event types including `f:{}`, `0:{}`, `e:{}`, `d:{}` prefixes in JSON object format — not the simple `0:"text"` string format. The text content in v6 protocol is inside `0:{"type":"text","value":"chunk"}` objects, not bare quoted strings.

This means `parseSSEChunk` with the regex `/^0:"(.*)"$/` will match nothing in the v6 stream, resulting in **silent empty responses** — Hamilton appears to "think" but never outputs text.

### Resolution Options

**Option A (recommended):** Replace the hand-rolled fetch+parser with `useChat` from `@ai-sdk/react`:
```typescript
import { useChat } from "@ai-sdk/react";
const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
  api: "/api/research/hamilton",
  body: { mode: "monitor" },
});
```
This is the canonical pattern for consuming `toUIMessageStreamResponse()` and handles all protocol versions automatically. The component is already client-only, so no architectural change needed.

**Option B:** Switch the API to `toTextStreamResponse()` (which does use simple text lines). The simulate endpoint already uses this (`src/app/api/hamilton/simulate/route.ts:136`). This keeps the hand-rolled parser working but loses structured message metadata.

**Option C:** Update the regex to parse v6 UIMessage protocol. Fragile and undocumented — not recommended.

**Recommendation: Option A.** The `@ai-sdk/react` package is already installed (`"@ai-sdk/react": "^3.0.118"`). `useChat` is the correct integration point for `toUIMessageStreamResponse()`.

[VERIFIED: Read FloatingChatOverlay.tsx, route.ts, package.json; CITED: Vercel AI SDK protocol docs — `toUIMessageStreamResponse` returns UIMessage stream, consumed by `useChat`]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SSE stream parsing for `toUIMessageStreamResponse` | Custom regex parser | `useChat` from `@ai-sdk/react` | Protocol is versioned and complex; `useChat` handles it correctly |
| Watchlist deduplication | Custom Set logic | Existing `addToWatchlist` action already deduplicates | Server action checks `currentIds.includes(id)` before insert |
| Peer set fetch | Raw SQL in left rail | `getSavedPeerSets()` from `saved-peers.ts` | Already handles table creation and scoped queries |

---

## Common Pitfalls

### Pitfall 1: seedMonitorData Guards Against Itself But Not Against Removal
**What goes wrong:** `seedMonitorData` is idempotent (checks count > 0 before inserting). After removing the call from page.tsx, the existing seed data in the DB remains and will be returned by `fetchMonitorPageData`. Developers may think the live path is working when it is actually returning stale seed records.
**How to avoid:** After removing the seedMonitorData call, manually clear the `hamilton_signals` and `hamilton_priority_alerts` tables in staging/dev to verify the empty state renders correctly.
**Warning signs:** Signal feed shows "First National Bank raised overdraft fee..." after the seedMonitorData call is removed — that means DB still has old seed data.

### Pitfall 2: Left Rail Props Must Flow Through All Three Layers
**What goes wrong:** Adding fetch calls to layout.tsx but forgetting to update `HamiltonShell.tsx`'s interface or not passing the new props down to `HamiltonLeftRail`. TypeScript will catch missing props but the component silently receives empty arrays if optional props default to `[]`.
**How to avoid:** Update all three files atomically: layout.tsx, HamiltonShell.tsx, HamiltonLeftRail.tsx. Run `npx tsc --noEmit` to catch prop threading gaps.
**Warning signs:** Left rail renders empty sections despite having DB rows — check that props are not being dropped at any layer.

### Pitfall 3: getSavedPeerSets Takes string, user.id is number
**What goes wrong:** Passing `user.id` (number) directly to `getSavedPeerSets` gets a TypeScript error — the function expects `userId: string` because `created_by` is a `TEXT` column.
**How to avoid:** Call `getSavedPeerSets(String(user.id))` in the layout.

### Pitfall 4: FloatingChatOverlay userId Prop Unused
**What goes wrong:** `FloatingChatOverlay` receives `userId` but marks it `// eslint-disable-next-line @typescript-eslint/no-unused-vars`. If switching to `useChat`, the `userId` prop will need to be injected into the request body (or removed entirely — the API resolves user from session cookie, not from the request body).
**How to avoid:** When refactoring to `useChat`, confirm that `getCurrentUser()` in the API route authenticates correctly from the session cookie — it does, based on reading the route handler. The `userId` prop can be dropped from FloatingChatOverlay, or kept and injected as `body: { mode: "monitor", userId }` for context enrichment.

### Pitfall 5: WatchlistPanel "Fee Movements" Section is Hardcoded
**What goes wrong:** `WatchlistPanel.tsx` has a hardcoded `FEE_MOVEMENTS` array (Custodial Premium +12.4%, Management Alpha -3.1%, Advisory Spread STABLE). These are demo values not connected to real data.
**How to avoid:** Phase 49 decisions (D-06 through D-08) cover watchlist integrity but do not call out Fee Movements. Confirm with user whether Fee Movements should remain as a placeholder, be hidden, or be replaced. If out of scope, leave as-is and add a TODO comment.

[VERIFIED: Read WatchlistPanel.tsx lines 81-103]

---

## Code Examples

### Pattern: useChat for FloatingChatOverlay

```typescript
// Source: @ai-sdk/react documentation, canonical useChat pattern
"use client";
import { useChat } from "@ai-sdk/react";

export function FloatingChatOverlay({ userId }: { userId: number }) {
  const { messages, input, handleInputChange, handleSubmit, status } = useChat({
    api: "/api/research/hamilton",
    body: { mode: "monitor" },
  });
  const isStreaming = status === "streaming" || status === "submitted";

  // messages is UIMessage[] — render message.parts[0].text or message.content
}
```
[CITED: @ai-sdk/react useChat — standard integration for toUIMessageStreamResponse]

### Pattern: Adding watchlist fetch to layout.tsx

```typescript
// In HamiltonLayoutInner, after existing savedAnalyses + recentScenarios fetches:
let pinnedInstitutions: string[] = [];
try {
  const rows = await sql`
    SELECT institution_ids
    FROM hamilton_watchlists
    WHERE user_id = ${user.id}
    LIMIT 1
  `;
  if (rows.length > 0 && Array.isArray(rows[0]?.institution_ids)) {
    pinnedInstitutions = rows[0].institution_ids as string[];
  }
} catch {
  // Empty is fine — left rail shows empty state
}

let peerSets: SavedPeerSet[] = [];
try {
  peerSets = await getSavedPeerSets(String(user.id));
} catch {
  // Empty is fine
}
```
[VERIFIED: Pattern follows existing savedAnalyses fetch in layout.tsx lines 80-102]

### Pattern: Empty State Card for SignalFeed

```typescript
// Replace EmptyState() in SignalFeed.tsx
function EmptyState() {
  return (
    <div
      style={{
        backgroundColor: "var(--hamilton-surface-container-lowest, #ffffff)",
        padding: "2.5rem",
        borderLeft: "4px solid var(--hamilton-outline-variant, #d8c2b8)",
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
      }}
    >
      <h3
        style={{
          fontFamily: "var(--hamilton-font-serif)",
          fontSize: "1.5rem",
          fontWeight: 400,
          color: "var(--hamilton-on-surface)",
          lineHeight: 1.2,
        }}
      >
        No signals yet.
      </h3>
      <p
        style={{
          fontFamily: "var(--hamilton-font-sans)",
          fontSize: "0.9375rem",
          color: "var(--hamilton-text-secondary)",
          lineHeight: 1.6,
        }}
      >
        Add institutions to your watchlist to begin monitoring fee movements
        and competitive shifts.
      </p>
    </div>
  );
}
```
[VERIFIED: follows existing SignalCard visual pattern from SignalFeed.tsx]

---

## Environment Availability

Step 2.6: SKIPPED — this phase is code-only changes within an existing running application. No external tools, CLIs, or new services introduced.

However, one runtime prerequisite exists:

| Dependency | Required By | Available | Notes |
|------------|------------|-----------|-------|
| `hamilton_signals` table | MON-01 | ✓ (created by ensureHamiltonProTables) | Table exists but may be empty |
| `hamilton_watchlists` table | MON-02, D-10 | ✓ (created by ensureHamiltonProTables) | Table exists |
| `hamilton_priority_alerts` table | fetchTopAlert() | ✓ | Table exists |
| `saved_peer_sets` table | D-11 | ✓ (ensureSavedPeerSetsTable called inside getSavedPeerSets) | Created on-demand |
| `ANTHROPIC_API_KEY` env var | MON-03 | ✓ (required for any existing Hamilton usage) | Must be set in .env |

[VERIFIED: ensureHamiltonProTables in pro-tables.ts creates all 6 tables; getSavedPeerSets calls ensureSavedPeerSetsTable before querying]

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MON-01 | fetchMonitorPageData returns empty arrays when hamilton_signals is empty | manual-only (requires live DB) | Manual: clear DB, load /pro/monitor, verify empty state renders | N/A |
| MON-02 | addToWatchlist/removeFromWatchlist mutate DB correctly | manual-only (server action, requires DB) | Manual: use Watch input, verify row appears/disappears | N/A |
| MON-03 | FloatingChatOverlay receives streaming text (not empty string) | manual-only (requires live API key) | Manual: open overlay, send message, verify text streams in | N/A |

**Note:** All three requirements involve live DB and external API — they cannot be unit tested in isolation without mocking the postgres client and Anthropic API. Manual smoke testing is the appropriate verification method for this phase. Existing vitest suite (60 tests in `src/lib/*.test.ts`) is unaffected — run it before committing to confirm no regressions.

### Wave 0 Gaps
None — existing test infrastructure covers all non-integration concerns. No new test files needed for this phase.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `getCurrentUser()` in every server action and API route |
| V4 Access Control | yes | All watchlist actions are scoped by `userId` parameter — no cross-user access possible |
| V5 Input Validation | yes | `addToWatchlist` already checks `!institutionId.trim()` — sufficient for text IDs |

No new security surface introduced. Watchlist server actions are already scoped to `userId` passed from `getCurrentUser()` in the page.

---

## Open Questions

1. **FEE_MOVEMENTS hardcoded data in WatchlistPanel**
   - What we know: `WatchlistPanel.tsx` has a static `FEE_MOVEMENTS` array (Custodial Premium, Management Alpha, Advisory Spread) with fabricated percentages.
   - What's unclear: Whether this section should be replaced with real data, hidden, or left as a placeholder for Phase 50+.
   - Recommendation: Treat it as out of scope for Phase 49 (the decisions only mention watchlist integrity, not fee movements). Add a `// TODO Phase 50: wire to real fee movement data` comment.

2. **Pinned Institutions on Monitor vs. Analyze screen only**
   - What we know: In the current `HamiltonLeftRail`, the CONTEXT section (which contains Pinned Institutions and Peer Sets) only renders on the Analyze screen (`{isAnalyzeScreen && (...)}` at line 326). The WORKSPACE section renders on all non-Simulate screens.
   - What's unclear: Per D-10, Pinned Institutions should be visible in the left rail — but the current conditional only shows it on Analyze. Should it also appear on Monitor, Home, Reports?
   - Recommendation: Confirm with user. If yes, the `isAnalyzeScreen` condition must be broadened or removed. If it should stay Analyze-only, update D-10 language accordingly.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `toUIMessageStreamResponse()` in ai SDK v6 emits UIMessage protocol incompatible with `/^0:"(.*)"$/` regex | Critical Finding section | If v6 still emits `0:"text"` format, the hand-rolled parser works and Option A refactor is unnecessary |
| A2 | `WatchlistPanel`'s `FEE_MOVEMENTS` section is out of scope for Phase 49 | Open Questions | If user expects Fee Movements to be real data, planner must add a task |
| A3 | Left rail Pinned Institutions should appear on all screens, not just Analyze | Open Questions | If Analyze-only is correct, the `isAnalyzeScreen` conditional in HamiltonLeftRail stays and scope narrows |

**A1 is the highest-risk assumption.** Recommend verifying with a quick browser test before planning: open Monitor, trigger FloatingChatOverlay, send a message, inspect Network tab to see raw SSE stream format. If chunks look like `0:{"type":"text","value":"..."}` then A1 is confirmed and Option A is required.

---

## Sources

### Primary (HIGH confidence)
- `src/app/pro/(hamilton)/monitor/page.tsx` — confirmed seedMonitorData call at line 21
- `src/app/pro/(hamilton)/monitor/actions.ts` — confirmed addToWatchlist / removeFromWatchlist implementations
- `src/lib/hamilton/monitor-data.ts` — confirmed all 4 sub-queries work against empty tables (try/catch + empty return)
- `src/lib/hamilton/seed-monitor-data.ts` — confirmed idempotent seeder with exact seed records
- `src/components/hamilton/layout/HamiltonLeftRail.tsx` — confirmed hardcoded PINNED_INSTITUTIONS and PEER_SETS constants; confirmed isAnalyzeScreen conditional
- `src/components/hamilton/monitor/FloatingChatOverlay.tsx` — confirmed hand-rolled SSE parser targeting `0:"text"` format
- `src/app/api/research/hamilton/route.ts` — confirmed `toUIMessageStreamResponse()` return at line 214
- `src/components/hamilton/monitor/WatchlistPanel.tsx` — confirmed FEE_MOVEMENTS hardcoded; confirmed client mutations via useTransition
- `src/components/hamilton/layout/HamiltonShell.tsx` — confirmed prop threading from layout to left rail
- `src/app/pro/(hamilton)/layout.tsx` — confirmed existing saved_analyses and recentScenarios fetch pattern
- `src/lib/crawler-db/saved-peers.ts` — confirmed getSavedPeerSets(userId: string) signature
- `src/lib/hamilton/pro-tables.ts` — confirmed schema for all 6 hamilton_* tables
- `package.json` — confirmed ai@^6.0.116, @ai-sdk/react@^3.0.118

### Secondary (MEDIUM confidence)
- MILESTONE_8_HANDOFF.md — Screen 2 Monitor requirements align with CONTEXT.md decisions

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all dependencies verified from package.json and codebase
- Architecture: HIGH — all files read directly; data flow traced end-to-end
- SSE format compatibility: MEDIUM — based on Vercel AI SDK version number and known protocol changes; should be browser-verified before implementation
- Pitfalls: HIGH — all sourced from direct code reading, not assumptions

**Research date:** 2026-04-09
**Valid until:** 2026-05-09 (stable stack, no fast-moving dependencies in scope)

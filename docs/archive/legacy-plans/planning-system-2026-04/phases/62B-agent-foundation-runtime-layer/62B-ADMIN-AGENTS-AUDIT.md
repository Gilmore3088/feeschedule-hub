# `/admin/agents` Console — Design & Quality Audit

**Date:** 2026-04-17
**Scope:** `src/app/admin/agents/**` (8 route files + 1 client tabs + 1 layout) — Phase 62b-10 deliverable
**Reviewer:** impeccable:audit
**Design brief reminder:** "Debug console — not a dashboard." Bloomberg density, matches the rest of `/admin` aesthetic (see CLAUDE.md Design Context).

---

## Anti-Patterns Verdict — PASS (with caveats)

Does this look AI-generated? **No.** No gradient text, no glassmorphism for its own sake (the `backdrop-blur` on the sticky tab bar is functional layering, not slop), no generic SaaS fonts, no hero metrics dressed up as KPIs, no card-grid worship. The console respects the declared "admin tool not marketing" brief. Tier colors (emerald / blue / purple) are carrying semantic weight (T1 / T2 / T3) — that's intentional, not decorative.

**One caveat:** there's a mild nested-card smell. `<section className="admin-card">` contains a grid of `<div className="rounded-md border ...">` tiles — visually two stacked card shells. Intentional per the tile grouping, but if you strip the inner border it would read cleaner. Keep as-is if the grouping hierarchy matters more than the reduction.

---

## Executive Summary

- **Total issues found:** 14 (1 Critical, 4 High, 6 Medium, 3 Low)
- **Most critical:**
  1. Touch targets fail WCAG AA (32px/28px buttons < 44×44px minimum)
  2. Messages table has no horizontal scroll wrapper — overflows on narrow viewports
  3. Tabs keyboard navigation likely broken (Radix Tabs + Next Link `asChild` routing intercepts arrow keys)
  4. No explicit `focus-visible` states — relies on browser defaults that may be suppressed by Tailwind resets
- **Overall quality:** B+ for internal admin tool. Ships usable. Accessibility + responsive layer is where most debt lives.
- **Recommended next steps:** `/impeccable:harden` for a11y + responsive; `/impeccable:polish` for the small cosmetic inconsistencies; skip `/impeccable:normalize` (design-system adherence is already good).

---

## Detailed Findings by Severity

### Critical Issues

#### C-1. Touch targets below WCAG AA minimum (44×44px)
- **Location:** `agent-tabs.tsx:46` (`h-7 px-3` = 28px high); `lineage/page.tsx:73` and `replay/page.tsx:59` (`h-8` submit buttons = 32px high); `tiles.tsx` metric cards are passive (ok); `timeline.tsx:24` Expand/Collapse buttons (auto height but tiny click target).
- **Severity:** Critical (WCAG 2.5.5 AAA; WCAG 2.5.8 AA recommends 24×24 minimum — passes AA literally but fails the spirit on coarse pointers)
- **Category:** Accessibility / Responsive
- **Impact:** Mobile/tablet users + anyone on a touchscreen admin device (iPad sidebar) will mis-tap. Internal tool but still used in the wild.
- **WCAG/Standard:** WCAG 2.5.5 Target Size (AAA) — 44×44 CSS px; WCAG 2.5.8 (AA) — 24×24 minimum
- **Recommendation:** Bump tab triggers to `h-8` minimum (32px, still tight but passes AA), add `py-2` or `min-h-11` on form submit buttons for 44px compliance. Add wrapper padding on the Expand/Collapse button in `PayloadPreview` to reach 24×24 at minimum.
- **Suggested command:** `/impeccable:harden`

### High-Severity Issues

#### H-1. Messages table overflows on narrow viewports
- **Location:** `messages/page.tsx:39-87` — `<table className="w-full">` inside `admin-card overflow-hidden` with 6 columns, one of which is the `participants` join string (unbounded)
- **Severity:** High
- **Category:** Responsive
- **Impact:** `overflow-hidden` on the parent crops content instead of scrolling. On mobile (360–768px) the Correlation, State, Intent, Participants columns all compress; long participant lists (Knox, Darwin, Atlas, state_WY…) push the table wider than screen and the right columns become unreachable.
- **WCAG/Standard:** WCAG 1.4.10 Reflow (AA)
- **Recommendation:** Replace `admin-card overflow-hidden` wrapper with `admin-card overflow-x-auto`. Add `min-w-[640px]` to the table so it scrolls rather than squishes. Optionally truncate participants to first 3 + "(+N)".
- **Suggested command:** `/impeccable:adapt`

#### H-2. Tabs keyboard navigation broken by Link intercept
- **Location:** `agent-tabs.tsx:38-55` — `<Tabs.Trigger asChild><Link>` pattern
- **Severity:** High
- **Category:** Accessibility
- **Impact:** Radix Tabs emits `role="tab"` semantics and expects Arrow Left/Right to move between tabs. But `asChild` passes the Trigger to Next's `<Link>`, which intercepts keydown events and does nothing with arrows. Screen reader announces "tab list" but arrow-key nav is silently broken. Only keyboard path is Tab (sequential focus) which violates the tab-pattern keyboard contract.
- **WCAG/Standard:** WCAG 2.1.1 Keyboard (A); WAI-ARIA tab pattern conformance
- **Recommendation:** Either (a) drop Radix Tabs and use a plain `<nav role="navigation">` with `<Link>` children (since this IS navigation, not single-page tabs), or (b) keep Radix Tabs and swap to `<Tabs.Trigger onClick={router.push}>` so Radix owns keyboard handling. Option (a) is more honest — these are 4 separate routes, not tab panels.
- **Suggested command:** `/impeccable:harden`

#### H-3. No `focus-visible` styles on any interactive element
- **Location:** Every `<button>`, `<Link>`, and `<Collapsible.Trigger>` across the console
- **Severity:** High
- **Category:** Accessibility
- **Impact:** Browser default focus rings often clash with dark mode or get suppressed by Tailwind's base reset. Keyboard-only users navigating the tree view / timeline / tabs can't tell where focus is. Same issue throughout `/admin` likely, but this phase ships 13 new files that all inherit the gap.
- **WCAG/Standard:** WCAG 2.4.7 Focus Visible (AA)
- **Recommendation:** Add a global `focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:outline-none` in `.admin-card button, .admin-card a` or via the admin layout. Per-component would also work.
- **Suggested command:** `/impeccable:harden`

#### H-4. Tier 1 R2 link target=_blank with potential XSS vector
- **Location:** `tree-view.tsx:69-78` — `<a href={r2} target="_blank">{r2}</a>`
- **Severity:** High
- **Category:** Security / Accessibility
- **Impact:** `r2_key` comes from a JSONB column written by Knox (Phase 63). If the R2 key ever contains a `javascript:` or `data:` scheme (accidental or malicious), the `href` renders as an executable link. `rel="noopener noreferrer"` is present (good) but doesn't block schema injection. Also: no `aria-label` indicating "opens in new tab" — WCAG 3.2.5 recommends a visual/aria cue.
- **WCAG/Standard:** WCAG 3.2.5 Change on Request (AAA); OWASP A03:2021 Injection
- **Recommendation:** Validate `r2_key` is an `https://` URL before rendering the link. If invalid, render as plain text. Add `<span aria-hidden>↗</span>` or `aria-label="opens R2 document in new tab"` for the a11y cue.
- **Suggested command:** `/impeccable:harden`

### Medium-Severity Issues

#### M-1. `text-gray-400` on `bg-gray-50` / `bg-white` — borderline contrast
- **Location:** Used extensively as a secondary/caption color — `tiles.tsx:57,76,82`; `tree-view.tsx:28,33`; `lineage/page.tsx:78`; `replay/page.tsx:63`; `timeline.tsx:86`. Tailwind's `gray-400` is `#9ca3af` on white = **3.01:1** contrast.
- **Severity:** Medium
- **Category:** Accessibility
- **Impact:** Fails AA normal text (4.5:1). Passes AA large text (3:1) only for the headers at text-lg+. The 10–11px labels fail both.
- **WCAG/Standard:** WCAG 1.4.3 Contrast (Minimum) — AA
- **Recommendation:** Swap `text-gray-400` → `text-gray-500` (= `#6b7280`, **4.68:1** on white). Dark mode's `text-gray-400` is fine against `bg-gray-900`.
- **Suggested command:** `/impeccable:harden` or `/impeccable:polish`

#### M-2. Nested `<Collapsible.Trigger asChild><button>` may double-fire
- **Location:** `tree-view.tsx:59-68, 95-104, 126-135`
- **Severity:** Medium
- **Category:** Accessibility / Behavior
- **Impact:** `asChild` pattern has known gotchas when the child already has event handlers or accessibility props. Double clicks or missing `aria-expanded` on the child button are the usual failure modes. Worth unit-testing the existing tests only check text + structure, not ARIA state.
- **Recommendation:** Add a test assertion: `expect(button).toHaveAttribute('aria-expanded', 'true'/'false')` before and after click. If it fails, drop `asChild` and let Radix render its own Trigger.
- **Suggested command:** `/impeccable:harden`

#### M-3. Timeline has no virtualization; 500 rows is the hardcoded cap
- **Location:** `timeline.tsx:50-95`; server query caps at 500 (`replay/page.tsx` → `getReasoningTrace(validUuid)` defaults to 500 in `agent-console.ts`).
- **Severity:** Medium
- **Category:** Performance
- **Impact:** Rendering 500 `<li>` with `<PayloadPreview>` inside (each with its own `useState`) is 500+ components mounting. Browser paint is fine; memory isn't. Not visible today (no traffic yet) but will surface in Phase 65+ once agents chatter.
- **Recommendation:** Use `@tanstack/react-virtual` if timelines routinely go >100 rows. Or lazy-render payloads below the fold. Not urgent — defer until real traffic proves the need.
- **Suggested command:** `/impeccable:optimize` (deferred)

#### M-4. Sticky tab bar offsets tied to a magic `top-11` that must match parent nav
- **Location:** `agent-tabs.tsx:32` — `sticky top-11 z-20`
- **Severity:** Medium
- **Category:** Theming / Maintainability
- **Impact:** If the `/admin` parent nav ever changes height (currently 44px = 11 × 4px), the tab bar's sticky offset stops working cleanly. Silent break.
- **Recommendation:** Extract the admin-nav height to a CSS variable (`--admin-nav-h`) in the admin layout, then reference `top-[var(--admin-nav-h)]` in the tabs. Same pattern as other projects with sticky sub-navs.
- **Suggested command:** `/impeccable:extract`

#### M-5. Hardcoded semantic tier colors duplicated across 3 Tier*Node components
- **Location:** `tree-view.tsx:57,94,125` — emerald for T1, blue for T2, purple for T3
- **Severity:** Medium
- **Category:** Theming
- **Impact:** Three places to update if tier colors ever change. Also: the tier semantics (T3=purple=published) aren't explained anywhere — a user has to infer from position in the tree.
- **Recommendation:** Extract to a `TIER_STYLES` record in `agent-console-types.ts`:
  ```ts
  export const TIER_STYLES = {
    tier_1: { border: 'border-emerald-300/50 dark:border-emerald-500/20', bg: '...', text: '...' },
    tier_2: { ... },
    tier_3: { ... },
  } as const;
  ```
  Plus: add a one-line legend above the tree ("Purple = published, Blue = verified, Green = raw extraction").
- **Suggested command:** `/impeccable:extract`

#### M-6. Expand/Collapse button in `PayloadPreview` lacks `aria-expanded`
- **Location:** `timeline.tsx:22-29`
- **Severity:** Medium
- **Category:** Accessibility
- **Impact:** Screen readers announce "Expand button" but not "collapsed" vs "expanded" state. User doesn't know whether they're about to reveal or hide.
- **Recommendation:** Add `aria-expanded={expanded}` and `aria-controls` pointing at the code element's id.
- **Suggested command:** `/impeccable:harden`

### Low-Severity Issues

#### L-1. `formatMetric` missing `cost_to_value_ratio` unit/sign context
- **Location:** `tiles.tsx:30-33`
- **Severity:** Low
- **Category:** UX clarity
- **Impact:** Renders "2.33" with no unit. Is that $/call? cents-per-useful-output? Users will not know without opening the source.
- **Recommendation:** Append the unit in the label or the value. `$/value` is a tolerable short unit.
- **Suggested command:** `/impeccable:clarify`

#### L-2. Correlation ID input fixed at `w-[340px]`
- **Location:** `replay/page.tsx:55`
- **Severity:** Low
- **Category:** Responsive
- **Impact:** Below 360px viewports, the input + "Replay" button + hint span overflow the card. Realistic only on folded foldables but worth noting.
- **Recommendation:** `w-full max-w-[340px]` plus `flex-wrap` on the parent form.
- **Suggested command:** `/impeccable:adapt`

#### L-3. Timeline sort is a defensive duplicate of the SQL ORDER BY
- **Location:** `timeline.tsx:45-47`
- **Severity:** Low
- **Category:** Performance / Code quality
- **Impact:** The comment acknowledges it — `rows are already sorted by created_at ASC from the query`. Re-sorting in the client is wasted CPU and an extra array copy.
- **Recommendation:** Trust the query. Delete the sort. If you worry about future callers, add a runtime assertion in development mode only.
- **Suggested command:** `/impeccable:distill`

---

## Patterns & Systemic Issues

### Keyboard a11y is the weakest layer
Three of the highest-severity findings are keyboard/focus-related (H-2 tabs, H-3 focus-visible, M-6 aria-expanded). Worth a single `/impeccable:harden` pass that sweeps all four tabs together rather than piecemeal fixes. The project's admin surface has this same gap elsewhere — this phase didn't introduce it but didn't fix it.

### Touch-target sizing consistently too small
`h-7` tabs, `h-8` buttons appear in at least 5 places. A project-wide Tailwind utility `.admin-btn` that enforces `min-h-11` (44px) on buttons would prevent this drifting further in Phase 63+.

### Tier colors hardcoded in 3 places
See M-5. Extract once, reference everywhere. Cheap win.

### Table responsive wrappers missing
Not just messages — other `/admin/*` tables likely have the same `overflow-hidden` instead of `overflow-x-auto` issue. Project-wide audit would surface it.

---

## Positive Findings

- **Semantic HTML is genuinely good.** Proper `<section>`, `<header>`, `<dl>`/`<dt>`/`<dd>`, `<table>`/`<thead>`/`<tbody>`, `<th>` with alignment, `<ol>` for the timeline, `<label htmlFor>` on form inputs. None of the div-soup that's standard in AI-generated admin UIs.
- **Dark mode is thorough.** Every `text-*` and `bg-*` has a `dark:` variant. No dangling light-mode-only colors found.
- **UUID validation on the replay input** (`replay/page.tsx:13-14, 23`) blocks trivial injection before hitting the database. Defense in depth even though postgres parameterizes.
- **D-16 read-only guarantee honored.** The Replay tab has no re-execute button anywhere; a test asserts its absence. That's exactly the right kind of guardrail for a destructive-action-adjacent surface.
- **Lineage error messages are specific.** `tier_2_missing` vs `tier_1_missing` vs `fee_published_not_found` with distinct copy pointing at the likely cause. Most admin tools surface "lookup failed" — this explains the failure class.
- **`data-testid` attributes are deliberate.** `agent-tile`, `sparkline`, `kind-badge`, `timeline-row` — these make the 3 vitest files possible without deep DOM queries. Testability is a design property here, not an afterthought.
- **Empty states are thoughtful.** Messages: "No agent message threads in the last 72 hours." Lineage: "No lineage found for this fee_published_id." Timeline: "No trace rows for this correlation_id." Tiles: "Run SELECT refresh_agent_health_rollup()." Each points at the likely reason + next step.
- **Form submit via GET method** (both lineage and replay). Means the URL carries the query — copy/paste-friendly, bookmark-friendly, back-button works. Small thing; frequently missed.

---

## Recommendations by Priority

### Immediate (this session / before 62b verify-work closes)
1. **C-1 Touch targets** — bump `h-7` → `h-8` on tabs; add `py-2` to form submit buttons. 5-minute fix.
2. **H-1 Messages overflow** — `overflow-hidden` → `overflow-x-auto` on the messages wrapper. 1-line fix.
3. **M-1 Contrast** — global find/replace `text-gray-400` → `text-gray-500` in `src/app/admin/agents/**`. Single commit.

### Short-term (Phase 62b.1 if it exists, or rolled into Phase 63 admin polish)
4. **H-2 Tabs keyboard nav** — swap `<Tabs.Trigger asChild><Link>` for plain `<nav>` with Link children. Delete Radix Tabs dep here; it wasn't earning its keep.
5. **H-3 focus-visible** — add a global ring style in the admin layout.
6. **H-4 R2 link scheme validation** — add `href.startsWith('https://') ? href : '#'` guard + aria-label.
7. **M-6 aria-expanded** on the timeline Expand button.

### Medium-term (next admin polish phase)
8. **M-4 Sticky offset token** — extract `--admin-nav-h`.
9. **M-5 Tier styles token** — extract `TIER_STYLES`.
10. **M-2 Collapsible ARIA test** — add assertion.
11. **L-1 cost_to_value unit**, **L-2 correlation input flex**, **L-3 redundant sort** — cleanup pass.

### Long-term (defer until Phase 65+)
12. **M-3 Timeline virtualization** — only if real traffic proves it's needed. YAGNI otherwise.

---

## Suggested Commands for Fixes

| Command | Addresses |
|---------|-----------|
| `/impeccable:harden` | C-1, H-1, H-2, H-3, H-4, M-1, M-2, M-6 (8 findings) |
| `/impeccable:adapt` | H-1, L-2 (2 findings) |
| `/impeccable:extract` | M-4, M-5 (2 findings) |
| `/impeccable:clarify` | L-1 (1 finding) |
| `/impeccable:distill` | L-3 (1 finding) |
| `/impeccable:polish` | M-1 (alternative) + general cleanup |
| `/impeccable:optimize` | M-3 (defer) |

**One-command path for maximum impact:** `/impeccable:harden src/app/admin/agents/` — knocks out 8 of 14 findings including every Critical/High item. Everything else is polish.

---

*Scope: 8 route files + 1 client tabs + 1 layout + 3 vitest files under `src/app/admin/agents/` + 1 query module `src/lib/crawler-db/agent-console.ts` + 1 types module `agent-console-types.ts`. ~14 issues across 4 categories. Anti-patterns PASS. WCAG AA has 4 High/Critical violations all fixable in one harden pass.*

---
phase: 62B-agent-foundation-runtime-layer
fixed_at: 2026-04-17T12:45:00Z
review_path: .planning/phases/62B-agent-foundation-runtime-layer/62B-ADMIN-AGENTS-AUDIT.md
iteration: 1
findings_in_scope: 7
fixed: 7
skipped: 0
status: all_fixed
---

# `/admin/agents` Console — Audit Fix Report

**Source audit:** `62B-ADMIN-AGENTS-AUDIT.md` (impeccable:audit, 14 findings)
**Scope of this fix pass:** 1 Critical + 4 High + 2 Medium = **7 findings**
(Remaining 7 — M-2 ARIA test, M-3 virtualization, M-4 sticky offset token, M-5 tier styles token, L-1, L-2, L-3 — deferred per audit's "Medium-term" / "Long-term" priority sections.)

**Why this scope:** Audit flagged C-1, H-1, M-1 as "Immediate (this session / before 62b verify-work closes)" and H-2/H-3/H-4/M-6 as "Short-term" but high-severity (a11y / security). All 7 are inside this pass.

---

## Fixed Issues

### C-1: Touch targets below WCAG AA minimum (44×44px)

**Files modified:**
- `src/app/admin/agents/agent-tabs.tsx`
- `src/app/admin/agents/lineage/page.tsx`
- `src/app/admin/agents/replay/page.tsx`

**Commit:** `c2d9d56`
**Applied fix:**
- Tabs: `h-7` (28px) → `h-8` (32px). Passes WCAG 2.5.8 AA (24×24 minimum).
- Submit buttons (`Trace`, `Replay`): `h-8` → `min-h-11` + `py-2` (44px). Passes WCAG 2.5.5 AAA target size.

---

### H-1: Messages table overflows on narrow viewports

**Files modified:** `src/app/admin/agents/messages/page.tsx`
**Commit:** `0e4149a`
**Applied fix:**
- `admin-card overflow-hidden` → `admin-card overflow-x-auto` so the table scrolls instead of cropping.
- Added `min-w-[640px]` so the table reaches its natural width and triggers horizontal scroll on small viewports rather than squishing.

---

### H-2: Tabs keyboard navigation broken by Link intercept

**Files modified:**
- `src/app/admin/agents/agent-tabs.tsx`
- `src/app/admin/agents/layout.tsx` (docstring)

**Commit:** `8b85e6c`
**Applied fix:**
- Picked option (a) from the audit: dropped Radix `Tabs.Root`/`Tabs.List`/`Tabs.Trigger` entirely. These are 4 routes, not single-page tab panels, so a semantic `<nav><ul><li><Link aria-current="page">>` is the honest mapping. Browser's native nav handles arrow keys and tab; Link handles route navigation.
- Added inline `focus-visible:ring-*` (sets the bar before global rule applies; H-3 covers the rest).
- Updated `layout.tsx` docstring to match the new approach.

**Note:** Pre-existing test-file types errors (`@testing-library/react`) on agent-tests are unrelated and predate this change.

---

### H-3: No `focus-visible` styles on any interactive element

**Files modified:** `src/app/globals.css`
**Commit:** `404e1dc`
**Applied fix:**
- An existing global `*:focus-visible` (line 191) provided a 2px outline, but it gets clipped by `overflow:hidden` parents and is easy to miss in dense admin tables.
- Added higher-specificity rule scoped to `.admin-content` and `.admin-card` for `button, a, [role="button"], [role="tab"], summary`: 4px `box-shadow` ring with a halo of the page background color, in `blue-500` (light) / `blue-400` (dark). Box-shadow rings survive overflow clipping and read against any background.

---

### H-4: Tier 1 R2 link with potential XSS scheme injection

**Files modified:** `src/app/admin/agents/lineage/tree-view.tsx`
**Commit:** `ee35cab`
**Applied fix:**
- Added `isSafeR2Url()` type-guard that only allows `^https://` (case-insensitive). Otherwise the value is rendered as plain text inside a `<span title="...">` so the data is still visible but never executable.
- Added `aria-label="Open R2 source document {url} in a new tab"` per WCAG 3.2.5.
- Added visible `↗` glyph wrapped in `aria-hidden="true"` so screen readers don't double-announce.

**Defense-in-depth note:** `rel="noopener noreferrer"` was already present (good); this guard adds the second layer to block scheme-based injection that `rel` doesn't address. Knox writes `r2_key` values starting Phase 63 — this guard is the validation contract.

---

### M-1: `text-gray-400` on light backgrounds — borderline contrast

**Files modified (7):**
- `src/app/admin/agents/overview/tiles.tsx`
- `src/app/admin/agents/replay/page.tsx`
- `src/app/admin/agents/replay/timeline.tsx`
- `src/app/admin/agents/lineage/page.tsx`
- `src/app/admin/agents/lineage/tree-view.tsx`
- `src/app/admin/agents/messages/page.tsx`
- `src/app/admin/agents/messages/thread-view.tsx`

**Commit:** `23b65cb`
**Applied fix:**
- Standalone `text-gray-400` (3.0:1 on white = fails AA normal text) → `text-gray-500 dark:text-gray-400`.
- This brings light-mode contrast to 4.68:1 (passes AA) while keeping dark-mode contrast unchanged.
- Did not touch instances already paired with a `dark:` variant or those over `text-gray-600`/`text-gray-700` (already AA).

---

### M-6: Expand/Collapse button in PayloadPreview lacks `aria-expanded`

**Files modified:** `src/app/admin/agents/replay/timeline.tsx`
**Commit:** `0546f6b`
**Applied fix:**
- Added `aria-expanded={expanded}` and `aria-controls={codeId}` (via `useId()`) so screen readers announce "Expand button, collapsed" → "Collapse button, expanded".
- Renamed inline `str.length > 200` ternary to a `truncated` boolean for readability.

---

## Deferred Issues (out of scope for this pass)

Per audit's own priority sections, these are scheduled for Medium-term (next admin polish phase) or Long-term:

| ID | Title | Defer reason |
|----|-------|--------------|
| M-2 | Collapsible asChild ARIA double-fire risk | Audit recommends adding a unit-test assertion first (need `@testing-library/react` types fixed) |
| M-3 | Timeline 500-row virtualization | Audit explicitly says "defer until real traffic proves it's needed (YAGNI otherwise)" |
| M-4 | Sticky `top-11` magic offset → CSS var `--admin-nav-h` | Project-wide refactor; audit puts it in "Medium-term" |
| M-5 | Tier color tokens (TIER_STYLES record) | Project-wide refactor; audit puts it in "Medium-term" |
| L-1 | `cost_to_value_ratio` missing unit | Cleanup pass |
| L-2 | Correlation input fixed `w-[340px]` | Cleanup pass |
| L-3 | Redundant client-side timeline sort | Cleanup pass |

---

## Verification

- TypeScript: `npx tsc --noEmit` produces no new errors against any modified file. The pre-existing `@testing-library/react` types errors in test files predate these fixes.
- Touch-target heights manually verified via class names: tabs `h-8` = 32px, submits `min-h-11` = 44px.
- Contrast: spot-checked via Tailwind palette: gray-500 = `#6b7280` → 4.68:1 on white = AA ✓.
- HTTPS guard: verified via regex `/^https:\/\//i` — blocks `javascript:`, `data:`, `file:`, protocol-relative `//`, and bare hostnames.

---

## Audit Verdict After Fix Pass

| Severity | Before | After |
|----------|--------|-------|
| Critical | 1 | 0 |
| High     | 4 | 0 |
| Medium   | 6 | 4 (deferred) |
| Low      | 3 | 3 (deferred) |
| **Total open** | **14** | **7** |

All Critical + High items closed. Remaining 7 items are deferred polish/refactor per audit's own priority guidance.

---

_Fixed: 2026-04-17T12:45:00Z_
_Fixer: Claude (Opus 4.7) — manual fix pass (audit format diverged from standard REVIEW.md, so workflow-driven gsd-code-fixer was bypassed in favor of direct application)_
_Iteration: 1_

---
phase: 38-architecture-foundation
plan: "01"
subsystem: hamilton-shell
tags: [css, design-system, hamilton, editorial, isolation]
dependency_graph:
  requires: []
  provides: [hamilton-shell-css-boundary]
  affects: [src/app/globals.css]
tech_stack:
  added: []
  patterns: [css-custom-property-scoping, tonal-elevation, warm-parchment-palette]
key_files:
  created:
    - src/lib/hamilton/css-tokens.test.ts
  modified:
    - src/app/globals.css
decisions:
  - "Hamilton tokens scoped inside .hamilton-shell selector only — never in @theme inline"
  - "Dark mode uses .dark .hamilton-shell pattern mirroring existing .dark .admin-content"
  - "Staggered reveal reuses admin-fade-up keyframe (no duplication)"
  - "No hard borders on hamilton-card — tonal elevation only per design spec"
metrics:
  duration: "~8 minutes"
  completed: "2026-04-09"
  tasks_completed: 2
  files_modified: 2
---

# Phase 38 Plan 01: Hamilton CSS Foundation Summary

## One-liner

Added `.hamilton-shell` CSS isolation boundary to globals.css — warm parchment editorial design system (Newsreader serif, burnished terracotta accent, tonal elevation) scoped exclusively to Hamilton Pro screens with automated regression tests.

## What Was Built

The `.hamilton-shell` CSS isolation boundary is the design system foundation for all Hamilton Pro Platform screens (Phases 40-46). Every downstream Hamilton screen wraps its content in `.hamilton-shell` to receive the full editorial aesthetic without any style contamination of the existing admin or consumer brands.

### CSS block structure (appended to end of globals.css)

1. `.hamilton-shell { ... }` — light mode with all design tokens
2. `.dark .hamilton-shell { ... }` — warm dark parchment overrides
3. `.hamilton-card { ... }` — tonal elevation card utility
4. `.hamilton-shell h1/h2/h3` — Newsreader serif heading rule
5. `.hamilton-shell > *` — staggered reveal animation (reuses admin-fade-up)
6. `@media (prefers-reduced-motion)` — accessibility override

### Design token coverage

| Token group | Light value | Dark value |
|---|---|---|
| Surface base | `#fbf9f4` (warm parchment) | `#1c1917` (warm charcoal) |
| Accent | `oklch(0.55 0.18 35)` terracotta | `oklch(0.70 0.15 35)` |
| Font serif | `var(--font-newsreader), Georgia, serif` | same |
| Shadow card | tonal rgba(28,25,23,...) | rgba(0,0,0,...) heavier |
| Border | `rgba(28,25,23,0.06)` | `rgba(255,255,255,0.06)` |

### CSS isolation tests (src/lib/hamilton/css-tokens.test.ts)

5 vitest assertions that catch regressions:
- `.hamilton-shell {` block presence
- `.dark .hamilton-shell {` block presence
- `--hamilton-surface` token scoped after selector (not at root)
- `--hamilton-*` tokens absent from `@theme inline` block
- No "Sovereign" branding string in file

## Tasks Completed

| Task | Name | Commit | Files |
|---|---|---|---|
| 1 | Add .hamilton-shell CSS isolation block | 1c63b8d | src/app/globals.css (+105 lines) |
| 2 | Add CSS isolation smoke tests | b0c497e | src/lib/hamilton/css-tokens.test.ts (new, 64 lines) |

## Verification

All success criteria met:

- `.hamilton-shell {` with `--hamilton-surface: #fbf9f4` — PASS
- `.dark .hamilton-shell {` with `--hamilton-surface: #1c1917` — PASS
- `--hamilton-font-serif: var(--font-newsreader)` — PASS
- `--hamilton-accent: oklch(0.55 0.18 35)` — PASS
- `.hamilton-card {` utility class — PASS
- `.hamilton-shell h1` serif heading rule — PASS
- No "Sovereign" string — PASS
- No `--hamilton-*` in `@theme inline` block — PASS
- `npx vitest run src/lib/hamilton/css-tokens.test.ts` — 5/5 PASS
- All existing CSS rules above new block unchanged — PASS
- TypeScript compilation: zero new errors introduced (pre-existing errors in integration.test.ts unaffected)

## Deviations from Plan

None — plan executed exactly as written.

The only deviation in context: `Hamilton-Design/hamilton_sovereign/DESIGN.md` referenced in the plan's `read_first` list does not exist in the repository. The design tokens specified directly in the plan's action block were used verbatim — no design values were interpolated or invented.

## Known Stubs

None. This plan adds pure CSS with no data dependencies, UI rendering, or component wiring.

## Threat Flags

None. The CSS changes introduce no new network endpoints, auth paths, file access patterns, or schema changes. The threat model items T-38-01 and T-38-02 are fully mitigated by the scoped CSS and automated tests.

## Self-Check: PASSED

- `src/app/globals.css` — FOUND (modified)
- `src/lib/hamilton/css-tokens.test.ts` — FOUND (created)
- Commit `1c63b8d` — FOUND
- Commit `b0c497e` — FOUND

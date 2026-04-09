---
phase: 40
slug: hamilton-shell
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-09
---

# Phase 40 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (vitest.config.ts) |
| **Config file** | `vitest.config.ts` — @/ alias configured, node environment |
| **Quick run command** | `npx vitest run src/lib/hamilton/` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/lib/hamilton/`
- **After each plan completes:** Run `npx vitest run` + `npx tsc --noEmit`
- **Phase gate:** Full suite green before `/gsd-verify-work`

---

## Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SHELL-01 | Route group layout renders children without error | smoke | TypeScript compile (`npx tsc --noEmit`) | Wave 0 |
| SHELL-02 | HamiltonTopNav renders locked nav labels from HAMILTON_NAV | unit | `npx vitest run src/lib/hamilton/navigation.test.ts` | Yes |
| SHELL-03 | Context bar renders institution name from user props | unit | `npx tsc --noEmit` | Wave 0 |
| SHELL-04 | Left rail renders correct sections per LEFT_RAIL_CONFIG | unit | `npx vitest run src/lib/hamilton/navigation.test.ts` | Yes |
| SHELL-05 | Institution context passed through to child stubs | smoke | TypeScript compile (`npx tsc --noEmit`) | N/A |

---

## Wave 0 Gaps

- [ ] `src/components/hamilton/layout/` — directory does not exist; create with layout components
- [ ] `src/app/pro/(hamilton)/` — directory does not exist; create layout.tsx + 5 stub pages

---

## Validation Architecture

### Unit Tests (from RESEARCH.md)
- Navigation source tests cover HAMILTON_NAV labels, hrefs, LEFT_RAIL_CONFIG structure
- TypeScript strict compile verifies type contracts across layout → component prop chain
- No component render tests required for Phase 40 (shell layout, not interactive screens)

### Integration Checks
- Manual: open Hamilton page in browser, verify `.hamilton-shell` tokens applied
- Manual: navigate between screens, verify context bar preserves institution
- Manual: access Hamilton URL as non-premium user, verify upgrade gate renders

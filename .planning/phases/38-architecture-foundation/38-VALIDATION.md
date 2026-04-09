---
phase: 38
slug: architecture-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-08
---

# Phase 38 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.3 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run src/lib/hamilton/` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/lib/hamilton/`
- **After each plan completes:** Run `npx vitest run` + `npx tsc --noEmit`

---

## Validation Architecture

### Unit Tests (from RESEARCH.md)
- TypeScript DTO conformance: `satisfies` assertions for valid responses, `@ts-expect-error` for invalid
- MODE_BEHAVIOR config: assert canRecommend/canExport/canSimulate per mode
- Navigation source: assert array length, href uniqueness, label format
- Screen ownership: `@ts-expect-error` confirms Analyze type lacks recommendation fields

### CSS Isolation Tests
- Manual inspection: open admin page and Hamilton page in same browser session, verify no bleed
- Grep verification: `.hamilton-shell` scoping class contains all editorial tokens

### Type Checking
- `npx tsc --noEmit` must pass with zero errors after all changes

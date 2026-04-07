---
phase: 26
slug: national-data-admin-portal
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-07
---

# Phase 26 -- Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.3 |
| **Quick run** | `npx vitest run src/app/admin/national/` |
| **Full suite** | `npx vitest run` |
| **Build check** | `npx next build` (TypeScript + route validation) |
| **Estimated runtime** | ~20 seconds |

---

## Sampling Rate

- **After every task commit:** TypeScript compilation check
- **After every plan wave:** `npx vitest run` + build check
- **Before verification:** Full build green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 26-01-01 | 01 | 1 | ADMIN-01 | build | `npx tsc --noEmit` | pending |
| 26-01-02 | 01 | 1 | ADMIN-02 | build | same | pending |
| 26-01-03 | 01 | 1 | ADMIN-03 | build | same | pending |
| 26-01-04 | 01 | 1 | ADMIN-04 | build | same | pending |

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visual layout correctness | ADMIN-01-04 | UI rendering requires browser | Navigate to /admin/national, verify tabs and data display |
| Chart rendering | ADMIN-02-04 | Recharts renders in browser only | Verify line charts render with correct data |

---

## Validation Sign-Off

- [ ] All tasks have automated verify
- [ ] Build check passes (TypeScript + Next.js)
- [ ] `nyquist_compliant: true` set

**Approval:** pending

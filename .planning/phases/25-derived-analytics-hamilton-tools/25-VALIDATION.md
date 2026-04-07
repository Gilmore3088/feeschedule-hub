---
phase: 25
slug: derived-analytics-hamilton-tools
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-07
---

# Phase 25 -- Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.3 |
| **Config file** | `vitest.config.ts` |
| **Quick run** | `npx vitest run src/lib/crawler-db/derived.test.ts` |
| **Full suite** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick command for modified file
- **After every plan wave:** Run `npx vitest run src/lib/`
- **Before verification:** Full suite green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 25-01-01 | 01 | 1 | DERIVE-01 | unit | `npx vitest run src/lib/crawler-db/derived.test.ts` | Wave 0 | pending |
| 25-01-02 | 01 | 1 | DERIVE-02 | unit | same | Wave 0 | pending |
| 25-01-03 | 01 | 1 | DERIVE-03 | unit | same | Wave 0 | pending |
| 25-02-01 | 02 | 1 | ADMIN-05 | unit | `npx vitest run src/lib/research/` | Extend | pending |

---

## Wave 0 Requirements

- [ ] `src/lib/crawler-db/derived.test.ts` -- vitest tests for DERIVE-01/02/03
- [ ] `overdraft_revenue` column added to `institution_financials` schema

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| FDIC RIAD4070 ingestion | DERIVE-02 | Requires FDIC API + network | Run FDIC ingestion, check `overdraft_revenue` column has data |
| Hamilton tool integration | ADMIN-05 | Requires Anthropic API | Call Hamilton with a national analysis question, verify tool use |

---

## Validation Sign-Off

- [ ] All tasks have automated verify
- [ ] Sampling continuity maintained
- [ ] Wave 0 covers MISSING references
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set

**Approval:** pending

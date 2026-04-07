---
phase: 23
slug: call-report-fred-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-07
---

# Phase 23 -- Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.3 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run src/lib/crawler-db/call-reports.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/lib/crawler-db/call-reports.test.ts`
- **After every plan wave:** Run `npx vitest run src/lib/`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 23-01-01 | 01 | 1 | CALL-01 | -- | N/A | unit | `npx vitest run src/lib/crawler-db/call-reports.test.ts` | Extend existing | pending |
| 23-01-02 | 01 | 1 | CALL-02 | -- | N/A | unit | same | Extend existing | pending |
| 23-01-03 | 01 | 1 | CALL-03 | -- | N/A | unit | same | Wave 0 | pending |
| 23-01-04 | 01 | 1 | CALL-04 | -- | N/A | unit | same | Extend existing | pending |
| 23-01-05 | 01 | 1 | CALL-05 | -- | N/A | unit | same | Wave 0 | pending |
| 23-01-06 | 01 | 1 | CALL-06 | -- | N/A | unit | same | Wave 0 | pending |
| 23-01-07 | 01 | 1 | CALL-03+06 | -- | N/A | reconciliation | same | Wave 0 | pending |
| 23-02-01 | 02 | 1 | FRED-01 | -- | N/A | unit | `npx vitest run src/lib/crawler-db/` | Existing | pending |
| 23-02-02 | 02 | 1 | FRED-02 | -- | N/A | unit | same | Wave 0 | pending |
| 23-02-03 | 02 | 1 | FRED-03 | -- | N/A | unit | same | Wave 0 | pending |
| 23-02-04 | 02 | 1 | FRED-04 | -- | N/A | unit | same | Wave 0 | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] New test cases in `src/lib/crawler-db/call-reports.test.ts` for `getRevenueByCharter`, `getRevenueByTier`, `getFeeIncomeRatio`
- [ ] New test file `src/lib/crawler-db/fed.test.ts` for `getNationalEconomicSummary`, `getDistrictUnemployment`
- [ ] Reconciliation assertions (charter splits = national total, tier splits = national total)

*Existing infrastructure covers CALL-01, CALL-02, CALL-04, FRED-01.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| UMCSENT ingestion | FRED-02 | Requires FRED API key and network | Run `python -m fee_crawler ingest-fred --series UMCSENT` and verify rows in DB |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

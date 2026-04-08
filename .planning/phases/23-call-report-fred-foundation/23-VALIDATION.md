---
phase: 23
slug: call-report-fred-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-07
---

# Phase 23 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (TypeScript) + pytest (Python) |
| **Config file** | `vitest.config.ts` / `fee_crawler/tests/` |
| **Quick run command** | `npx vitest run src/lib/crawler-db/call-reports.test.ts src/lib/crawler-db/financial.test.ts` |
| **Full suite command** | `npx vitest run && python -m pytest fee_crawler/tests/ -x` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick run command
- **After every plan wave:** Run full suite command
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 23-01-01 | 01 | 0 | CALL-01 | unit | `npx vitest run src/lib/crawler-db/call-reports.test.ts` | ✅ | ⬜ pending |
| 23-01-02 | 01 | 0 | CALL-06 | unit | `npx vitest run src/lib/crawler-db/call-reports.test.ts` | ✅ | ⬜ pending |
| 23-01-03 | 01 | 0 | FRED-01 | unit | `npx vitest run src/lib/crawler-db/financial.test.ts` | ❌ W0 | ⬜ pending |
| 23-01-04 | 01 | 0 | FRED-04 | unit | `npx vitest run src/lib/crawler-db/financial.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/crawler-db/financial.test.ts` — stubs for FRED-01 through FRED-04
- [ ] Extend `src/lib/crawler-db/call-reports.test.ts` — stubs for CALL-06 (asset tier segmentation)
- [ ] Python migration test stub for ingestion layer scaling fix verification

*Existing `call-reports.test.ts` covers CALL-01 through CALL-05 structure.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Spot-check 5-10 banks against FFIEC CDR | CALL-01 | Requires comparing against external source | Query JPMorgan, Wells Fargo, BofA service_charge_income and compare to published filings |
| CFPB API ingestion produces correct data | D-07 | External API response format | Run ingestion for 1 state, verify complaint counts match CFPB website |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

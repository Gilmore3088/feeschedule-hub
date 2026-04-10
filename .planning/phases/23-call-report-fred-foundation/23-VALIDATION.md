---
phase: 23
slug: call-report-fred-foundation
status: draft
<<<<<<< HEAD
nyquist_compliant: true
wave_0_complete: true
=======
nyquist_compliant: false
wave_0_complete: false
>>>>>>> worktree-agent-ad5f480e
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
<<<<<<< HEAD
| **Quick run command** | `npx vitest run src/lib/crawler-db/call-reports.test.ts src/lib/crawler-db/fed.test.ts src/lib/crawler-db/complaints.test.ts` |
=======
| **Quick run command** | `npx vitest run src/lib/crawler-db/call-reports.test.ts src/lib/crawler-db/financial.test.ts` |
>>>>>>> worktree-agent-ad5f480e
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
<<<<<<< HEAD
| 23-01-01 | 01 | 1 | CALL-01 | unit | `npx vitest run src/lib/crawler-db/call-reports.test.ts` | yes | pending |
| 23-01-02 | 01 | 1 | CALL-01 | unit | `npx vitest run src/lib/crawler-db/call-reports.test.ts` | yes | pending |
| 23-01-03 | 01 | 1 | CALL-01 | pytest | `python -m pytest fee_crawler/tests/test_call_report_scaling.py -v` | no (created by task) | pending |
| 23-02-01 | 02 | 1 | FRED-02,FRED-04 | unit | `grep "UMCSENT" fee_crawler/commands/ingest_fred.py` | yes | pending |
| 23-02-02 | 02 | 1 | FRED-01,FRED-03,FRED-04 | unit | `npx vitest run src/lib/crawler-db/fed.test.ts` | no (created by task) | pending |
| 23-03-01 | 03 | 2 | CALL-06 | unit | `npx tsc --noEmit src/lib/fed-districts.ts` | yes | pending |
| 23-03-2a | 03 | 2 | CALL-06 | unit | `npx vitest run src/lib/crawler-db/call-reports.test.ts` | yes | pending |
| 23-03-2b | 03 | 2 | CALL-06 | tsc | `npx tsc --noEmit` | yes | pending |
| 23-04-01 | 04 | 1 | D-07 | grep | `grep -c "psycopg2" fee_crawler/commands/ingest_cfpb.py` | yes | pending |
| 23-04-02 | 04 | 1 | D-07 | unit | `npx vitest run src/lib/crawler-db/complaints.test.ts` | no (created by task) | pending |
| 23-05-01 | 05 | 2 | D-08,D-09 | unit | `npx vitest run src/lib/crawler-db/call-reports.test.ts` | yes | pending |
| 23-05-02 | 05 | 2 | D-08,D-09,D-10 | tsc | `npx tsc --noEmit` | yes | pending |

*Status: pending / green / red / flaky*
=======
| 23-01-01 | 01 | 0 | CALL-01 | unit | `npx vitest run src/lib/crawler-db/call-reports.test.ts` | ✅ | ⬜ pending |
| 23-01-02 | 01 | 0 | CALL-06 | unit | `npx vitest run src/lib/crawler-db/call-reports.test.ts` | ✅ | ⬜ pending |
| 23-01-03 | 01 | 0 | FRED-01 | unit | `npx vitest run src/lib/crawler-db/financial.test.ts` | ❌ W0 | ⬜ pending |
| 23-01-04 | 01 | 0 | FRED-04 | unit | `npx vitest run src/lib/crawler-db/financial.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
>>>>>>> worktree-agent-ad5f480e

---

## Wave 0 Requirements

<<<<<<< HEAD
- [x] `src/lib/crawler-db/call-reports.test.ts` — exists, covers CALL-01 through CALL-05 structure
- [ ] `src/lib/crawler-db/fed.test.ts` — created by Plan 23-02 Task 2 (stubs for FRED-01 through FRED-04)
- [ ] `src/lib/crawler-db/complaints.test.ts` — created by Plan 23-04 Task 2
- [ ] `fee_crawler/tests/test_call_report_scaling.py` — created by Plan 23-01 Task 3

*Existing `call-reports.test.ts` covers CALL-01 through CALL-05 structure. New test files are created by their respective plan tasks.*
=======
- [ ] `src/lib/crawler-db/financial.test.ts` — stubs for FRED-01 through FRED-04
- [ ] Extend `src/lib/crawler-db/call-reports.test.ts` — stubs for CALL-06 (asset tier segmentation)
- [ ] Python migration test stub for ingestion layer scaling fix verification

*Existing `call-reports.test.ts` covers CALL-01 through CALL-05 structure.*
>>>>>>> worktree-agent-ad5f480e

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Spot-check 5-10 banks against FFIEC CDR | CALL-01 | Requires comparing against external source | Query JPMorgan, Wells Fargo, BofA service_charge_income and compare to published filings |
| CFPB API ingestion produces correct data | D-07 | External API response format | Run ingestion for 1 state, verify complaint counts match CFPB website |
<<<<<<< HEAD
| Institution page renders financial context | D-08 | Visual verification | Visit /institution/[id] for a bank with financials, verify Financial Context section |
=======
>>>>>>> worktree-agent-ad5f480e

---

## Validation Sign-Off

<<<<<<< HEAD
- [x] All tasks have automated verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter
=======
- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter
>>>>>>> worktree-agent-ad5f480e

**Approval:** pending

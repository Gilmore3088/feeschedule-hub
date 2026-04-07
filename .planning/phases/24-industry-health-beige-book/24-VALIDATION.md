---
phase: 24
slug: industry-health-beige-book
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-07
---

# Phase 24 -- Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **TS Framework** | vitest 4.1.3 |
| **Python Framework** | pytest |
| **Quick TS run** | `npx vitest run src/lib/crawler-db/health.test.ts` |
| **Full TS suite** | `npx vitest run` |
| **Quick Python run** | `python -m pytest fee_crawler/tests/test_ingest_beige_book.py -x` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick TS or Python command as appropriate
- **After every plan wave:** Run `npx vitest run src/lib/` + `python -m pytest fee_crawler/tests/`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 24-01-01 | 01 | 1 | HEALTH-01 | unit | `npx vitest run src/lib/crawler-db/health.test.ts` | Wave 0 | pending |
| 24-01-02 | 01 | 1 | HEALTH-02 | unit | same | Wave 0 | pending |
| 24-01-03 | 01 | 1 | HEALTH-03 | unit | same | Wave 0 | pending |
| 24-01-04 | 01 | 1 | HEALTH-04 | unit | same | Wave 0 | pending |
| 24-02-01 | 02 | 1 | BEIGE-01 | unit | `npx vitest run src/lib/crawler-db/fed.test.ts` | Extend | pending |
| 24-02-02 | 02 | 1 | BEIGE-02 | unit | same | Extend | pending |
| 24-02-03 | 02 | 1 | BEIGE-03 | unit | same | Extend | pending |
| 24-02-04 | 02 | 1 | BEIGE-01/02/03 | unit (mock) | `python -m pytest fee_crawler/tests/test_ingest_beige_book.py -x` | Wave 0 | pending |

---

## Wave 0 Requirements

- [ ] `src/lib/crawler-db/health.test.ts` -- vitest tests for HEALTH-01 through HEALTH-04
- [ ] `fee_crawler/tests/test_ingest_beige_book.py` -- pytest tests with mocked Anthropic client
- [ ] `export` keyword on `deriveTrend` in `fed.ts`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| LLM summary quality | BEIGE-01 | Requires Anthropic API key + subjective quality | Run `python -m fee_crawler ingest-beige-book` and review summaries |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity maintained
- [ ] Wave 0 covers all MISSING references
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

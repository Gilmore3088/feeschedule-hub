---
phase: 56
slug: auto-classification-pipeline
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-10
---

# Phase 56 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 7.x (Python) |
| **Config file** | `fee_crawler/tests/` directory |
| **Quick run command** | `python -m pytest fee_crawler/tests/ -x -q` |
| **Full suite command** | `python -m pytest fee_crawler/tests/ -v` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `python -m pytest fee_crawler/tests/ -x -q`
- **After every plan wave:** Run `python -m pytest fee_crawler/tests/ -v`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 56-01-01 | 01 | 1 | CLS-01 | — | classify_fee() called before INSERT | unit | `python -m pytest fee_crawler/tests/test_classify_fee.py -v` | ✅ | ⬜ pending |
| 56-01-02 | 01 | 1 | CLS-02 | — | classification_cache prevents repeat LLM calls | unit | `python -m pytest fee_crawler/tests/test_classify_nulls.py -v` | ❌ W0 | ⬜ pending |
| 56-01-03 | 01 | 1 | CLS-03 | — | Roomba flags outliers post-crawl | unit | `python -m pytest fee_crawler/tests/test_roomba_canonical.py -v` | ✅ | ⬜ pending |
| 56-02-01 | 02 | 2 | CLS-02 | — | LLM batch classifies NULL fees | integration | `python -m pytest fee_crawler/tests/test_classify_nulls.py -v` | ❌ W0 | ⬜ pending |
| 56-03-01 | 03 | 2 | D-08 | — | Snapshot tables populated quarterly | unit | `python -m pytest fee_crawler/tests/test_snapshot.py -v` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `fee_crawler/tests/test_classify_nulls.py` — stubs for CLS-02 (cache hit/miss, confidence gate, batch processing)
- [ ] `fee_crawler/tests/test_snapshot.py` — stubs for D-08 (idempotent snapshot, category + institution level)

*Existing test_classify_fee.py (16 tests) and test_roomba_canonical.py (9 tests) cover CLS-01 and CLS-03 base behavior.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Modal cron triggers post-crawl job | D-04 | Requires Modal runtime | Deploy to Modal staging, trigger crawl, verify classify_nulls runs |
| End-to-end crawl → classify → Roomba chain | D-06 | Full pipeline integration | Run `modal run fee_crawler.modal_app::stub.run_extraction` and verify chain completes |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

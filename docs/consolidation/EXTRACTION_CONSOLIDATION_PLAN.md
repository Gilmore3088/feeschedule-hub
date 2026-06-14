# Follow-up: Extraction-Stack Consolidation toward Magellan Rungs

**Date:** 2026-06-13
**Status:** Deferred follow-up (behavior-affecting — NOT done in the consolidation pass)
**Decision:** Magellan rungs is the intended single production extraction path.

## Why this was deferred

Collapsing the extraction code is **not behavior-preserving** — the three "stacks" use
different extractors that can yield different fees. Doing it blind in a cleanup pass could
silently change production fee data. This document is the safe, incremental plan instead.

## The real layering (corrected from the first-pass audit)

The three are **not** three peers to pick one from. They are layered:

```
commands/crawl.py ─┐
llm_batch_worker  ─┼─► pipeline/extract_*   ◄── FOUNDATION (text + LLM extraction)
magellan/rungs/*  ─┘        (extract_html, extract_pdf, extract_llm, extract_platform)
                                   ▲
agents/extract_{pdf,html,js}.py ───┘  thin LLM wrappers over pipeline/extract_*
```

- **`pipeline/extract_*` is the foundation — KEEP IT.** Magellan rungs themselves import
  `pipeline.extract_llm` (`rungs/pdf_ocr.py`, `rungs/playwright_stealth.py`,
  `rungs/ua_rotation.py`), as do `commands/crawl.py` and `workers/llm_batch_worker.py`.
- **Magellan rungs** (`agents/magellan/rungs/`) are the newest **orchestration** layer on
  top of that foundation — the chosen production path.
- **`agents/extract_{pdf,html,js}.py`** are thin wrappers. Only **three** callers:
  - `fee_crawler/agents/state_agent.py` (imports all three)
  - `fee_crawler/commands/probe_urls.py`
  - `fee_crawler/commands/reextract_incomplete.py`

## Safe migration plan (incremental, tested)

1. **Confirm the live entrypoint.** CLAUDE.md says the Modal cron runs `python -m
   fee_crawler crawl` (→ `commands/crawl.py`). Confirm whether `state_agent.py` /
   `probe_urls.py` / `reextract_incomplete.py` are still scheduled, or already dead.
2. **For each of the 3 `agents/extract_*` callers**, on its own branch:
   - Re-point it at the Magellan rung entrypoint.
   - Add/extend a test asserting extracted-fee parity on a fixture document (the rung must
     produce the same fees as the wrapper for known inputs — this is the behavior gate).
   - Ship only if parity holds.
3. **After all three are migrated**, delete `agents/extract_{pdf,html,js}.py`.
4. **Do NOT touch `pipeline/extract_*`** — it is the shared foundation.

## Orchestrator note (`executor.py` vs `modal_app.py`)

- `pipeline/executor.py` has **no non-test callers** found — likely dead or CLI-only;
  verify before removing.
- `modal_app.py` is referenced by `commands/darwin_drain.py`, `commands/roomba.py`,
  `workers/data_integrity.py`, `workers/report_render.py`, and is the Modal cron entry.
  Treat `modal_app.py` as live until the deploy config says otherwise.

## extract_kreuzberg

`pipeline/extract_kreuzberg.py` has a live caller (`commands/crawl.py`, flag-gated). Keep
until the Kreuzberg experiment is formally concluded.

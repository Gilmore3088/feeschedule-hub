# Phase 56: Auto-Classification Pipeline - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-10
**Phase:** 56-auto-classification-pipeline
**Areas discussed:** LLM fallback queue pattern, Classification cache strategy, Roomba integration timing, INSERT wiring approach, 4-stage review pipeline, QoQ tracking

---

## LLM Fallback Queue Pattern

| Option | Description | Selected |
|--------|-------------|----------|
| Post-crawl batch job | Crawl inserts with NULL, separate Modal job classifies after | ✓ |
| Inline async (fire-and-forget) | Async Haiku call per unmatched fee during extraction | |
| Nightly batch | All unmatched accumulate, classified once daily | |

**User's choice:** Post-crawl batch job
**Notes:** Clean separation — crawl stores raw, classification runs after.

---

## LLM Auto-Approve Threshold

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-approve >= 0.85 | Matches existing extraction auto-stage threshold | |
| Auto-approve >= 0.90 | Higher bar for classification | ✓ |
| Always stage for review | Every LLM result goes to review queue | |
| Auto-approve all | Trust LLM fully | |

**User's choice:** 0.90 confidence threshold
**Notes:** User specified 90% explicitly. Higher bar than extraction (0.85) because wrong category is harder to catch.

---

## Classification Cache Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Postgres table | classification_cache with normalized_name, canonical_fee_key, confidence | ✓ |
| Promote to aliases | Auto-add to FEE_NAME_ALIASES in code | |
| Both: cache + periodic promotion | Postgres cache + monthly alias PR | |

**User's choice:** Postgres table
**Notes:** Simple, queryable, audit trail. Alias promotion deferred.

---

## Roomba Integration Timing

| Option | Description | Selected |
|--------|-------------|----------|
| Post-classification | Final step of post-crawl batch job | ✓ (primary) |
| Separate scheduled job | Independent nightly run | ✓ (secondary) |
| On-demand only | Manual CLI trigger | ✓ (tertiary) |

**User's choice:** All three tiers
**Notes:** "Both Post-classification and separate scheduled jobs. Should also be able to run on-demand, but that's not the primary, even secondary path."

---

## INSERT Wiring Approach

| Option | Description | Selected |
|--------|-------------|----------|
| Python extraction pipeline | classify_fee() before INSERT in extraction worker | ✓ |
| Postgres trigger | DB-level BEFORE INSERT trigger | |
| Post-insert Python hook | INSERT raw, then second pass | |

**User's choice:** Python extraction pipeline

---

## 4-Stage Review Pipeline

| Option | Description | Selected |
|--------|-------------|----------|
| 3-stage gate | Alias + LLM + Roomba | |
| 2-stage gate | Combined classify + Roomba | |
| 4-stage gate | Alias + LLM + Roomba + Human review | ✓ |

**User's choice:** 4-stage gate
**Notes:** User emphasized accuracy above all else. Human review as safety net for anything automated stages can't handle with high confidence.

---

## QoQ Tracking

| Option | Description | Selected |
|--------|-------------|----------|
| Category-level snapshots | Median, P25/P75, counts per category per quarter | ✓ |
| Institution-level snapshots | Every institution's fees per quarter | ✓ |
| Both levels | Full coverage | ✓ |

**User's choice:** Both levels
**Notes:** "Expectation is we're gonna be constantly getting new data every quarter. So we need to track quarter over quarter just like we would call reports."

---

## Claude's Discretion

- Batch size for LLM calls
- Exact Roomba nightly schedule
- Snapshot table schema details

## Deferred Ideas

- Alias promotion pipeline (monthly auto-PR from cache to FEE_NAME_ALIASES)
- Full SQLite elimination from CLI commands
- Data quality dashboard (admin page)

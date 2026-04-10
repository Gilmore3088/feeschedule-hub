# Phase 56: Auto-Classification Pipeline - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Every new fee inserted by the crawler is automatically assigned a canonical_fee_key at INSERT time. Unmatched fees get LLM fallback classification via post-crawl batch job. The canonical taxonomy becomes self-maintaining after this phase ships.

Additionally: establish a 4-stage automated review pipeline and quarter-over-quarter snapshot infrastructure so data quality is continuously monitored and no bad data reaches the published index.

</domain>

<decisions>
## Implementation Decisions

### LLM Fallback Queue Pattern
- **D-01:** Post-crawl batch job pattern. Crawl inserts fees with canonical_fee_key=NULL for unmatched names. A separate Modal job runs after each crawl completes, classifies all NULLs in one Haiku batch call, caches results in Postgres. No inline async, no fire-and-forget.
- **D-02:** Auto-approve threshold is 0.90 confidence (not 0.85). Below 0.90 goes to human review queue. Above 0.90 AND passing NEVER_MERGE guards gets auto-approved.

### Classification Cache Strategy
- **D-03:** Postgres `classification_cache` table: (normalized_name TEXT PRIMARY KEY, canonical_fee_key TEXT, confidence FLOAT, model TEXT, created_at TIMESTAMPTZ). One row per unique fee name. Queryable, survives restarts, doubles as audit trail. Same fee name string never triggers a second LLM call.

### Roomba Integration Timing
- **D-04:** Three-tier Roomba execution:
  - **Primary:** Runs as final step of post-crawl batch job (crawl -> classify -> Roomba). Catches bad classifications immediately.
  - **Secondary:** Scheduled nightly job (separate from crawl) for catching drift and cross-crawl outliers.
  - **Tertiary:** CLI on-demand via `python -m fee_crawler roomba`. Not the primary or secondary path.

### INSERT Wiring Approach
- **D-05:** Call `classify_fee()` in the Python extraction pipeline right before INSERT. Alias matches get canonical_fee_key immediately. Unmatched get NULL for the post-crawl batch job. No Postgres triggers. No post-insert second pass.

### 4-Stage Automated Review Pipeline
- **D-06:** Every fee passes through 4 gates before reaching the published index:
  1. **Stage 1: Alias classification** — `classify_fee()` deterministic alias + regex match. Instant. Covers 90%+ of known fee names.
  2. **Stage 2: LLM fallback** — Post-crawl batch job sends unmatched names to Claude Haiku. Results cached in `classification_cache`. 0.90 confidence gate for auto-approve.
  3. **Stage 3: Roomba statistical validation** — Flags fees deviating 3+ standard deviations from category median. Flags known regulatory violations (NEVER_MERGE). Runs post-classification and nightly.
  4. **Stage 4: Human review queue** — Anything flagged by Roomba or below 0.90 LLM confidence goes to the admin review queue. Only human-approved fees in this bucket reach the index.
- **D-07:** Target: 90%+ of fees classified correctly through automation (Stages 1-3) without human intervention. The 4th stage is the safety net, not the primary path.

### Quarter-over-Quarter Data Tracking
- **D-08:** Snapshot at BOTH category and institution level each quarter:
  - **Category snapshots:** `fee_index_snapshots` table — each category's median, P25/P75, institution count, fee count, snapshot_date. Enables delta detection ("NSF median rose 8% QoQ").
  - **Institution snapshots:** `institution_fee_snapshots` table — each institution's fees per category per quarter. Enables per-bank trend tracking.
- **D-09:** Accuracy is the most important thing. No fabricated data. No inferred fees. Every published number traces to a pipeline-verified extraction with a confidence score and review status.

### Claude's Discretion
- Batch size for LLM classification calls (how many fee names per Haiku request)
- Exact Roomba nightly schedule (fits within existing 2-4am ET crawl window or after)
- Schema details for snapshot tables (indexes, partitioning)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Fee Classification
- `fee_crawler/fee_analysis.py` — CANONICAL_KEY_MAP (181 entries), FEE_NAME_ALIASES (969 entries), classify_fee(), normalize_fee_name(), NEVER_MERGE_PAIRS
- `fee_crawler/fee_analysis.py` lines 1200+ — _REGEX_PATTERNS, _detect_cap_category(), variant detection

### Existing Pipeline
- `fee_crawler/commands/categorize_fees.py` — Current batch categorization (SQLite-based, needs Postgres migration)
- `fee_crawler/commands/backfill_canonical.py` — Backfill pattern for canonical_fee_key + variant_type
- `fee_crawler/commands/roomba.py` — Existing Roomba sweeps (canonical_outliers, canonical_reassignments)

### Tests
- `fee_crawler/tests/test_classify_fee.py` — 16 tests for classify_fee() behavior
- `fee_crawler/tests/test_never_merge.py` — 24 tests for regulatory guard enforcement
- `fee_crawler/tests/test_roomba_canonical.py` — 9 tests for outlier detection and reassignment

### Extraction Pipeline
- `fee_crawler/pipeline/extract_llm.py` — Where fees are extracted (classify_fee() wiring point)
- `fee_crawler/workers/extraction_worker.py` — Modal extraction worker
- `fee_crawler/modal_app.py` — Modal app with cron schedules

### TypeScript Mirror
- `src/lib/fee-taxonomy.ts` — CANONICAL_KEY_MAP mirror (181 entries), must stay synced

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `classify_fee(fee_name)` — Returns (fee_category, canonical_fee_key, variant_type) tuple. Ready to wire at INSERT.
- `normalize_fee_name(fee_name)` — Lowercases, strips punctuation, matches aliases longest-first, then regex patterns, then cap detection.
- `sweep_canonical_outliers()` and `sweep_canonical_reassignments()` — Roomba sweeps already built with pure function helpers for unit testing.
- `backfill_canonical_keys()` — SQL CASE WHEN pattern for bulk classification. Proven on production (149K rows).

### Established Patterns
- Auto-stage threshold: `extraction.confidence_auto_stage_threshold` in config.yaml (currently 0.85). Classification will use 0.90.
- Review status flow: pending -> staged -> approved/rejected. Roomba flags set review_status to 'flagged'.
- Modal cron jobs: 2am discovery, 3am extraction, 4am categorization. Post-crawl classification fits after extraction.

### Integration Points
- `extract_llm.py` — The fee dict is built here before INSERT. Add classify_fee() call to populate canonical_fee_key and variant_type.
- `modal_app.py` — Add post-crawl classification job as a Modal function triggered after extraction completes.
- `roomba.py` — Already has sweep infrastructure. Needs a `run_post_crawl()` entry point that chains classification + outlier detection.

</code_context>

<specifics>
## Specific Ideas

- User emphasized: "accuracy is the most important thing. No bullshit data. We can't make up data."
- Quarter-over-quarter tracking should mirror Call Reports cadence — quarterly snapshots for trend analysis.
- The 90%+ automation target means the human review queue should be small (< 10% of new fees per crawl).
- Data arriving every quarter needs to be tracked like Call Reports — change detection, delta reporting.

</specifics>

<deferred>
## Deferred Ideas

- **Alias promotion pipeline** — Monthly job that promotes high-confidence, high-frequency cached classifications to FEE_NAME_ALIASES via automated PR. Not Phase 56 scope — could be Phase 56.1 or a quick task.
- **Full SQLite elimination** — `categorize_fees.py` and other CLI commands still use the SQLite Database class. Tracked in memory as a separate cleanup task.
- **Data quality dashboard** — Admin page showing classification coverage, cache hit rate, Roomba flag rate, QoQ deltas. Belongs in Phase 57 or later.

</deferred>

---

*Phase: 56-auto-classification-pipeline*
*Context gathered: 2026-04-10*

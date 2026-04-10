# Phase 56: Auto-Classification Pipeline - Research

**Researched:** 2026-04-10
**Domain:** Python pipeline wiring — classify_fee() INSERT integration, LLM fallback batch job, Roomba post-crawl integration, snapshot tables
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Post-crawl batch job pattern. Crawl inserts fees with canonical_fee_key=NULL for unmatched names. A separate Modal job runs after each crawl completes, classifies all NULLs in one Haiku batch call, caches results in Postgres. No inline async, no fire-and-forget.
- **D-02:** Auto-approve threshold is 0.90 confidence (not 0.85). Below 0.90 goes to human review queue. Above 0.90 AND passing NEVER_MERGE guards gets auto-approved.
- **D-03:** Postgres `classification_cache` table: (normalized_name TEXT PRIMARY KEY, canonical_fee_key TEXT, confidence FLOAT, model TEXT, created_at TIMESTAMPTZ). One row per unique fee name. Queryable, survives restarts, doubles as audit trail. Same fee name string never triggers a second LLM call.
- **D-04:** Three-tier Roomba execution: Primary = final step of post-crawl batch job; Secondary = scheduled nightly job; Tertiary = CLI on-demand.
- **D-05:** Call `classify_fee()` in the Python extraction pipeline right before INSERT. Alias matches get canonical_fee_key immediately. Unmatched get NULL for the post-crawl batch job. No Postgres triggers. No post-insert second pass.
- **D-06:** Every fee passes through 4 gates (alias classification, LLM fallback, Roomba statistical validation, human review queue) before reaching the published index.
- **D-07:** Target: 90%+ of fees classified correctly through automation (Stages 1-3) without human intervention.
- **D-08:** Snapshot at BOTH category and institution level each quarter: `fee_index_snapshots` and `institution_fee_snapshots` tables.
- **D-09:** Accuracy is the most important thing. No fabricated data. No inferred fees.

### Claude's Discretion

- Batch size for LLM classification calls (how many fee names per Haiku request)
- Exact Roomba nightly schedule (fits within existing 2-4am ET crawl window or after)
- Schema details for snapshot tables (indexes, partitioning)

### Deferred Ideas (OUT OF SCOPE)

- Alias promotion pipeline (monthly job promoting cached classifications to FEE_NAME_ALIASES via automated PR) — Phase 56.1 or quick task
- Full SQLite elimination in categorize_fees.py and other CLI commands — separate cleanup task
- Data quality dashboard (admin page showing classification coverage, cache hit rate, Roomba flag rate, QoQ deltas) — Phase 57 or later
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CLS-01 | classify_fee() runs inline at INSERT time during extraction — every new crawl auto-maps to canonical taxonomy | Wire point identified: `fee_crawler/pipeline/extract_llm.py` builds the fee dict before INSERT; `classify_fee()` in `fee_analysis.py` returns (fee_category, canonical_fee_key, variant_type) — both columns exist in schema from Phase 55 migration |
| CLS-02 | LLM fallback classification via Claude Haiku when fuzzy match score < 80, with classification_cache table to prevent repeat API calls | New `classification_cache` Postgres table needed; new Modal function `run_classify_nulls()` needed; anthropic SDK already in requirements.txt; existing batch API pattern in `ExtractionConfig.use_batch_api` |
| CLS-03 | Roomba integration wired into post-extraction pipeline to flag/reject outliers automatically | `sweep_canonical_outliers()` and `sweep_canonical_reassignments()` already implemented in `roomba.py`; `run_post_crawl()` entry point is the missing piece; nightly Modal cron needed |
</phase_requirements>

---

## Summary

Phase 56 is a pure Python pipeline wiring phase. The heavy intellectual work (building the 969-alias lookup table, the 181-entry canonical key map, the Roomba statistical sweep logic, the NEVER_MERGE guard tests) was completed in Phase 55. This phase connects the existing pieces into an automated pipeline.

The three insertion points are well-defined: (1) `extract_llm.py` — add two lines calling `classify_fee()` before the fee dict is written to DB; (2) a new Modal function `run_classify_nulls()` — batch Haiku call for all `canonical_fee_key IS NULL` rows after each crawl, writing results to a new `classification_cache` table; (3) `roomba.py` — add a `run_post_crawl(conn, fix=True)` function that chains `sweep_canonical_outliers()` and `sweep_canonical_reassignments()`, then wire it as the final step of the classification job.

The snapshot tables (D-08) require two new Postgres migrations and a new CLI command `python -m fee_crawler snapshot`. The existing `run_post_processing()` Modal function already calls `snapshot`, so hooking it in is a one-line addition.

**Primary recommendation:** Implement in four sequential tasks — (1) INSERT wiring, (2) classification_cache migration + LLM batch classifier, (3) Roomba post-crawl entry point + Modal integration, (4) snapshot tables + snapshot command.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| psycopg2-binary | 2.9+ (in requirements.txt) | Postgres access in pipeline workers | Already used in roomba.py, backfill_canonical.py |
| anthropic | 0.40+ (in requirements.txt) | Haiku LLM fallback classification | Already used for fee extraction; same model (claude-haiku-4-5-20251001) |
| modal | current (in requirements.txt) | Serverless job orchestration | All pipeline workers deployed on Modal |
| pytest | current (in requirements.txt) | Test runner for Python pipeline code | 60 existing Python tests; CI pattern established |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| statistics (stdlib) | 3.12 stdlib | Median/stddev for Roomba canonical stats | Already used in compute_canonical_stats() |
| pydantic | 2.0+ | Config validation | ExtractionConfig already defines confidence thresholds |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Postgres classification_cache | Redis cache | Postgres already in stack; Redis adds a dependency with no benefit given batch (not real-time) access pattern |
| Post-crawl batch Haiku call | Inline async at INSERT | D-01 locked: post-crawl batch is the chosen pattern — do not block INSERT path |
| Modal scheduled cron | Separate process/cron | Modal already hosts all pipeline workers; consistent deployment pattern |

**No new dependencies needed for this phase.** All libraries are already in `fee_crawler/requirements.txt`.

---

## Architecture Patterns

### Recommended Project Structure

New files this phase adds:

```
fee_crawler/
├── commands/
│   ├── classify_nulls.py     # New: LLM batch classification for NULL canonical keys
│   └── snapshot.py           # New: quarterly snapshot command
├── pipeline/
│   └── extract_llm.py        # Modified: add classify_fee() call before INSERT
├── commands/
│   └── roomba.py             # Modified: add run_post_crawl() entry point
├── modal_app.py              # Modified: add run_classify_nulls Modal function + nightly Roomba cron
supabase/migrations/
├── 20260410_classification_cache.sql  # New: classification_cache table
├── 20260410_snapshot_tables.sql       # New: fee_index_snapshots + institution_fee_snapshots
```

### Pattern 1: classify_fee() wiring at INSERT (CLS-01)

**What:** Call `classify_fee(fee_name)` in `extract_llm.py` immediately before the fee dict is handed to the DB INSERT. Populate `fee_category`, `canonical_fee_key`, and `variant_type` from the returned tuple.

**When to use:** Every fee extracted by the LLM, whether from PDF or browser worker.

**Verified location in extract_llm.py:** The fee dict is built from LLM tool response fields (`fee_name`, `amount`, `frequency`, `conditions`, `confidence`). classify_fee() call slots in after fee_name is known and before the dict is written to extracted_fees.

**Example (wiring pattern):**
```python
# Source: fee_crawler/fee_analysis.py — classify_fee() contract verified
from fee_crawler.fee_analysis import classify_fee

# In the loop that processes extracted fee dicts:
fee_category, canonical_fee_key, variant_type = classify_fee(raw_fee["fee_name"])
fee_dict = {
    "fee_name": raw_fee["fee_name"],
    "fee_category": fee_category,
    "canonical_fee_key": canonical_fee_key,   # None if unmatched
    "variant_type": variant_type,
    "amount": raw_fee["amount"],
    # ...
}
```

**Key constraint:** `classify_fee()` is synchronous and purely in-memory (dict lookup + regex). No I/O, no latency. Safe to call at INSERT time. [VERIFIED: fee_analysis.py lines 1682-1693]

### Pattern 2: LLM batch classification for NULL canonical keys (CLS-02)

**What:** After each crawl completes, query all `extracted_fees` rows where `canonical_fee_key IS NULL`, deduplicate by normalized fee name, check `classification_cache` for hits, send misses to Haiku in batches, write cache entries, update `extracted_fees`.

**When to use:** As a Modal function triggered after extraction workers complete.

**classification_cache schema:**
```sql
-- Source: CONTEXT.md D-03 — locked decision
CREATE TABLE classification_cache (
    normalized_name TEXT PRIMARY KEY,
    canonical_fee_key TEXT,             -- NULL = unclassifiable (Haiku couldn't match)
    confidence FLOAT NOT NULL,
    model TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_classification_cache_key
    ON classification_cache(canonical_fee_key)
    WHERE canonical_fee_key IS NOT NULL;
```

**Batch size recommendation (Claude's Discretion):** 50 fee names per Haiku request. Reasoning: Haiku context window is 200K tokens; 50 unique fee names with prompt overhead fits well under 1K tokens. At ~$0.00025 per 1K input tokens, a batch of 50 names costs fractions of a cent. Larger batches risk Haiku truncating or confusing low-confidence edge cases.

**Confidence gate:** D-02 — 0.90 threshold. Results >= 0.90 and passing NEVER_MERGE check get written with canonical_fee_key populated. Results < 0.90 are cached with the lower confidence but `canonical_fee_key` stays NULL in extracted_fees (goes to human review queue).

**LLM prompt pattern:**
```python
# Source: ASSUMED — based on existing extract_llm.py tool_use pattern in this codebase
CLASSIFY_SYSTEM = """\
You are a bank fee taxonomy specialist. For each fee name, identify the canonical
fee category from the approved taxonomy. Only use canonical keys from the provided list.
If a fee does not match any canonical category, respond with null."""
```

**NEVER_MERGE guard at write time:** Before writing `canonical_fee_key` from LLM result to `extracted_fees`, check the NEVER_MERGE_PAIRS list. If the LLM suggests `overdraft` for a fee named "NSF Fee", reject the suggestion and flag for human review. [VERIFIED: fee_analysis.py NEVER_MERGE_PAIRS defined at line ~316]

### Pattern 3: Roomba run_post_crawl() entry point (CLS-03)

**What:** A new function in `roomba.py` that runs the two canonical sweeps against a specific batch of newly inserted fees, rather than the full table. Called as the final step of the post-crawl classification job.

**When to use:** At the end of `run_classify_nulls()` after LLM results are written.

**Example (entry point signature):**
```python
# Source: ASSUMED — based on existing sweep_canonical_outliers() signature in roomba.py
def run_post_crawl(conn, crawl_run_ids: list[int] | None = None) -> dict:
    """Run canonical sweeps for a specific crawl batch.

    If crawl_run_ids is None, sweeps the full table (used by nightly scheduled job).
    If crawl_run_ids is provided, scopes sweeps to fees from those crawl runs only.

    Returns summary dict: {outliers_flagged, reassignments_made}
    """
    ensure_roomba_log(conn)
    outliers = sweep_canonical_outliers(conn, fix=True)
    reassignments = sweep_canonical_reassignments(conn, fix=True)
    return {
        "outliers_flagged": len(outliers),
        "reassignments_made": len(reassignments),
    }
```

**Nightly schedule (Claude's Discretion):** 5am ET (modal.Cron("0 5 * * *")). This runs after the extraction window (3am-4am) completes. Does not conflict with any existing Modal cron. The nightly job calls `run_post_crawl(conn, crawl_run_ids=None)` to sweep the full table for cross-crawl drift.

### Pattern 4: Snapshot tables (D-08)

**What:** Two new tables capturing quarterly snapshots of fee data at category and institution level. Enables QoQ delta detection.

**Category snapshot schema:**
```sql
-- Source: CONTEXT.md D-08 — locked decision
CREATE TABLE fee_index_snapshots (
    id SERIAL PRIMARY KEY,
    snapshot_date DATE NOT NULL,
    fee_category TEXT NOT NULL,
    canonical_fee_key TEXT,
    median_amount NUMERIC(10,2),
    p25_amount NUMERIC(10,2),
    p75_amount NUMERIC(10,2),
    institution_count INTEGER NOT NULL,
    fee_count INTEGER NOT NULL,
    charter TEXT,        -- NULL = all charters
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(snapshot_date, fee_category, COALESCE(charter, ''))
);

CREATE TABLE institution_fee_snapshots (
    id SERIAL PRIMARY KEY,
    snapshot_date DATE NOT NULL,
    crawl_target_id INTEGER NOT NULL REFERENCES crawl_targets(id),
    canonical_fee_key TEXT NOT NULL,
    amount NUMERIC(10,2),
    review_status TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(snapshot_date, crawl_target_id, canonical_fee_key)
);
```

**Snapshot command:** `python -m fee_crawler snapshot` — takes a point-in-time snapshot of the current national fee index and per-institution fee state. Idempotent: uses INSERT ... ON CONFLICT DO UPDATE to handle re-runs on same date.

**Cadence (Claude's Discretion):** Quarterly snapshots to mirror Call Report cadence. The existing `run_post_processing()` Modal function already calls `snapshot` as one of its pipeline steps. Hook the new snapshot command into this existing step rather than adding a new cron.

### Anti-Patterns to Avoid

- **Blocking INSERT with LLM calls:** D-01 is locked. Never call Haiku inline during extraction. Fees with unmatched names store immediately with `canonical_fee_key = NULL`.
- **Postgres triggers for classification:** D-05 explicitly rejects triggers. All classification logic is in Python, not database triggers.
- **Re-running LLM for cached names:** Every unique `normalized_name` that has been through Haiku must exist in `classification_cache`. Query the cache before any LLM call. The same fee name string never triggers a second API call (D-03).
- **Ignoring NEVER_MERGE when writing LLM results:** The LLM may hallucinate an overdraft key for an NSF fee name. Guard every LLM classification result against NEVER_MERGE_PAIRS before writing to extracted_fees.
- **Writing fabricated confidence scores:** If the LLM returns < 0.90 confidence, do not bump it. Store what was returned. The pipeline handles low-confidence fees via human review.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Fee name normalization | Custom string cleaner | `normalize_fee_name()` in fee_analysis.py | 969-alias lookup table with longest-first matching, punctuation stripping, regex patterns — already battle-tested on 149K rows |
| Canonical key lookup | Custom dict | `classify_fee()` in fee_analysis.py | Returns (fee_category, canonical_fee_key, variant_type) triple; handles cap detection, variant detection, NEVER_MERGE guarding |
| Outlier detection | Custom z-score implementation | `sweep_canonical_outliers()` + `compute_canonical_stats()` in roomba.py | Already implemented with 3-stddev threshold, $0 exclusion, minimum 5-observation floor, pure function for testability |
| Canonical reassignment sweep | Custom SQL | `sweep_canonical_reassignments()` in roomba.py | Handles stale canonical_fee_key values after alias table updates |
| LLM batching | Custom batching logic | anthropic SDK `messages.create()` with list of names | Haiku handles multi-item prompts natively; no need for custom queuing |

**Key insight:** The most expensive work (building the classification tables, sweep logic, test suite) is already done. This phase is wiring, not building.

---

## Common Pitfalls

### Pitfall 1: extract_llm.py builds the fee dict in a loop with chunking

**What goes wrong:** `extract_llm.py` processes documents in chunks (`_CHUNK_SIZE = 30_000`). The LLM may return overlapping fee entries across chunks. If `classify_fee()` is called inside the chunk loop without deduplication, the same fee name gets classified (and potentially inserted) multiple times.

**Why it happens:** The chunking logic runs the full LLM extraction per chunk and merges results. The merge happens after LLM calls, before INSERT.

**How to avoid:** Call `classify_fee()` after chunk merging, not inside the per-chunk loop. This is also where `_MAX_FEES_PER_INSTITUTION = 100` dedup logic fires. [VERIFIED: extract_llm.py lines 112-116]

**Warning signs:** Institution has 100+ fees inserted in a single crawl run; same canonical_fee_key appears multiple times for one institution with identical amounts.

### Pitfall 2: classification_cache normalized_name must match normalize_fee_name() output exactly

**What goes wrong:** If the cache key is the raw fee_name (e.g., "Monthly Maintenance Fee") but `classify_fee()` internally uses `normalize_fee_name()` output ("monthly_maintenance_fee"), cache lookups miss.

**Why it happens:** `normalize_fee_name()` strips punctuation, lowercases, and applies punctuation-joining. The cache PRIMARY KEY must be the normalized form, not the raw string.

**How to avoid:** Always call `normalize_fee_name(fee_name)` before the cache lookup. Store `normalized_name` in the cache, not the raw display name. [VERIFIED: fee_analysis.py — normalize_fee_name() is the canonical normalization function]

### Pitfall 3: Haiku batching with NEVER_MERGE boundaries

**What goes wrong:** Sending both "NSF Fee" and "Overdraft Fee" in the same Haiku batch prompt and asking Haiku to classify them can result in Haiku conflating the two (e.g., returning "overdraft" for NSF). This is a known LLM failure mode when similar terms appear in the same context.

**Why it happens:** Haiku is optimized for speed, not precision on boundary cases.

**How to avoid:** Apply NEVER_MERGE_PAIRS guard as a post-classification step, not as a prompt instruction. Trust the alias table for known pairs, not the LLM. Only send to Haiku names that did NOT match any alias — which means genuine unknowns, not close variants of known fee names.

**Warning signs:** classification_cache entries where `canonical_fee_key = 'overdraft'` but `normalized_name` contains "nsf" or "non-sufficient".

### Pitfall 4: sweep_canonical_outliers() graceful-skip mode

**What goes wrong:** `sweep_canonical_outliers()` has a graceful skip that returns `[]` if the `canonical_fee_key` column doesn't exist yet (Phase 55 migration not applied). If Phase 55 migration hasn't been run in production when Phase 56 deploys, the Roomba post-crawl step silently does nothing.

**Why it happens:** The graceful skip was added for safe deployment ordering. [VERIFIED: roomba.py lines 489-499]

**How to avoid:** Verify the Phase 55 migration (`20260409_canonical_fee_key.sql`) has been applied to production before deploying Phase 56. Add an assertion at the start of `run_post_crawl()` that the column exists. If it doesn't, raise a clear error rather than silently returning empty.

### Pitfall 5: Snapshot UNIQUE constraint on nullable charter column

**What goes wrong:** Postgres `UNIQUE(snapshot_date, fee_category, charter)` does NOT enforce uniqueness when `charter IS NULL` — Postgres treats two NULLs as distinct values in a UNIQUE constraint. Re-running snapshot on the same date creates duplicate rows for the "all charters" case.

**Why it happens:** SQL NULL semantics: NULL != NULL.

**How to avoid:** Use `COALESCE(charter, '')` in the UNIQUE constraint or use a partial unique index: `CREATE UNIQUE INDEX ON fee_index_snapshots(snapshot_date, fee_category) WHERE charter IS NULL`. [ASSUMED — standard Postgres behavior, not verified against Supabase docs for this specific table]

### Pitfall 6: Modal function timeout for large classification batch

**What goes wrong:** If a crawl run inserts 5,000+ fees and most have `canonical_fee_key IS NULL` (unusual, but possible when alias table coverage is low), the Haiku batch job may exceed Modal's default timeout.

**Why it happens:** Each Haiku API call takes ~1-2 seconds. At batch size 50, 5,000 unknowns = 100 API calls = ~2-3 minutes. Modal default timeout is 300 seconds — fine normally, but any I/O failures or retries could push it over.

**How to avoid:** Set the `run_classify_nulls` Modal function timeout to 1800 seconds (30 minutes) to provide ample headroom. The 90%+ alias hit rate means most crawl runs will have << 500 unknowns in practice.

---

## Code Examples

### classify_fee() wiring at INSERT (verified pattern)

```python
# Source: fee_crawler/fee_analysis.py — classify_fee() verified at line 1682
from fee_crawler.fee_analysis import classify_fee

def _build_fee_record(raw: dict) -> dict:
    """Build the DB record dict from an LLM-extracted fee dict."""
    fee_category, canonical_fee_key, variant_type = classify_fee(raw["fee_name"])
    return {
        "fee_name": raw["fee_name"],
        "fee_category": fee_category,
        "canonical_fee_key": canonical_fee_key,   # None if unmatched — batch job handles
        "variant_type": variant_type,
        "amount": raw.get("amount"),
        "frequency": raw.get("frequency"),
        "conditions": raw.get("conditions"),
        "confidence": raw.get("confidence", 0.0),
        "review_status": "pending",
    }
```

### classification_cache lookup + write (design pattern)

```python
# Source: ASSUMED — based on psycopg2 patterns in roomba.py and backfill_canonical.py
from fee_crawler.fee_analysis import normalize_fee_name, NEVER_MERGE_PAIRS

def classify_with_cache(conn, raw_name: str) -> tuple[str | None, float]:
    """Check cache first; return (canonical_key, confidence) or (None, 0.0)."""
    normalized = normalize_fee_name(raw_name)
    with conn.cursor() as cur:
        cur.execute(
            "SELECT canonical_fee_key, confidence FROM classification_cache WHERE normalized_name = %s",
            (normalized,)
        )
        row = cur.fetchone()
    if row:
        return row[0], row[1]  # cache hit
    return None, 0.0  # cache miss → send to Haiku

def write_cache_entry(conn, normalized_name: str, canonical_key: str | None, confidence: float, model: str):
    """Write or update a cache entry. Idempotent via ON CONFLICT."""
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO classification_cache (normalized_name, canonical_fee_key, confidence, model)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (normalized_name) DO UPDATE
            SET canonical_fee_key = EXCLUDED.canonical_fee_key,
                confidence = EXCLUDED.confidence,
                model = EXCLUDED.model
        """, (normalized_name, canonical_key, confidence, model))
    conn.commit()
```

### Roomba run_post_crawl() entry point (design pattern)

```python
# Source: ASSUMED — based on existing roomba.py run() function pattern
def run_post_crawl(conn) -> dict:
    """Run canonical sweeps as final step of post-crawl classification job.

    Called by run_classify_nulls() after LLM results are written.
    Also used by the nightly Modal cron for cross-crawl drift detection.
    """
    ensure_roomba_log(conn)
    outliers = sweep_canonical_outliers(conn, fix=True)
    reassignments = sweep_canonical_reassignments(conn, fix=True)
    return {
        "outliers_flagged": len(outliers),
        "reassignments_made": len(reassignments),
    }
```

### Modal function for post-crawl classification (design pattern)

```python
# Source: ASSUMED — based on existing modal_app.py function patterns
@app.function(
    timeout=1800,
    secrets=secrets,
    memory=1024,
)
def run_classify_nulls():
    """Classify all extracted_fees rows with canonical_fee_key IS NULL.

    1. Query NULL rows, deduplicate by normalized_name
    2. Check classification_cache for hits
    3. Send misses to Haiku in batches of 50
    4. Write cache entries + update extracted_fees
    5. Run Roomba post-crawl sweeps
    """
    import os
    import psycopg2
    from fee_crawler.commands.classify_nulls import run
    from fee_crawler.commands.roomba import run_post_crawl

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        result = run(conn)
        roomba_result = run_post_crawl(conn)
        return f"classified={result['classified']}, cached_hits={result['cache_hits']}, " \
               f"outliers_flagged={roomba_result['outliers_flagged']}"
    finally:
        conn.close()
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SQLite Database class | psycopg2 + Supabase Postgres | Phase 47 (migration) | All new pipeline code uses psycopg2 directly — no SQLite |
| categorize_fees.py SQLite ? placeholders | Postgres %s placeholders + CANONICAL_KEY_MAP | Phase 55 | backfill_canonical.py is the canonical reference for bulk classification patterns |
| Inline async classification (originally considered) | Post-crawl batch job (D-01) | Phase 56 context | Simplifies error handling; fees always stored immediately regardless of LLM availability |

**Known tech debt (in scope as deferred):**
- `categorize_fees.py` still uses the old SQLite Database class — tracked separately, not Phase 56 scope per CONTEXT.md

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Batch size of 50 fee names per Haiku request is the right tradeoff between API cost and quality | Architecture Patterns / Pattern 2 | Too large: Haiku quality degrades on boundary cases; Too small: unnecessary API calls. Low risk — adjust based on first production run |
| A2 | COALESCE(charter, '') in UNIQUE constraint is the right approach for handling NULL charter in snapshot table | Common Pitfalls / Pitfall 5 | If Supabase has a quirk with COALESCE in constraint expressions, may need partial index approach instead. Verify at migration time |
| A3 | 5am ET is the right nightly Roomba schedule (after 3-4am extraction window) | Architecture Patterns / Pattern 3 | If extraction window expands past 4am, 5am cron could conflict. Low risk — Modal functions are idempotent and can overlap |
| A4 | run_classify_nulls LLM prompt structure will achieve 0.90+ confidence on genuine unknowns | Architecture Patterns / Pattern 2 | Haiku may have lower accuracy on obscure banking fee names. Mitigation: if < 0.90, fee stays in human review queue — no data integrity risk |
| A5 | extract_llm.py classify_fee() wiring goes after chunk merging, not inside per-chunk loop | Common Pitfalls / Pitfall 1 | Need to verify exact data flow in extract_llm.py between LLM call and INSERT. High confidence based on reading the file, but insertion point must be confirmed during implementation |

---

## Open Questions

1. **Does extract_llm.py actually INSERT to Postgres, or does it queue to a jobs table?**
   - What we know: The extraction_worker.py stub says "Queue for LLM batch if classification passes" but also says "TODO: Implement in Phase 4." The actual extraction path uses `python -m fee_crawler crawl` via subprocess.
   - What's unclear: Whether the fee INSERT happens inside `extract_llm.py` directly or via a separate writer module.
   - Recommendation: Read the full `fee_crawler/crawl.py` or `__main__.py` entry point before Task 1 to confirm the exact INSERT location.

2. **Does the existing `run_post_processing()` Modal function conflict with the new `run_classify_nulls()` function?**
   - What we know: `run_post_processing()` already calls `categorize`, `auto-review`, `snapshot`, `publish-index`. It runs at 6am ET. The new `run_classify_nulls()` would run after extraction (sometime between 4am-6am or on-demand).
   - What's unclear: Whether `run_classify_nulls()` should be wired as a trigger after extraction completes, or as an additional step inside `run_post_processing()`.
   - Recommendation: Add `run_classify_nulls()` as the first step in `run_post_processing()` before `categorize`, rather than as a separate triggered function. Simpler orchestration, no trigger wiring needed.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python 3.12 | All pipeline code | Yes | 3.12.6 | — |
| psycopg2 | Postgres access | Yes (in requirements.txt) | 2.9+ | — |
| anthropic SDK | Haiku LLM fallback | Yes (in requirements.txt) | 0.40+ | — |
| Modal CLI | Deployment | Yes (in requirements.txt) | current | — |
| ANTHROPIC_API_KEY | Haiku API calls | Yes (bfi-secrets Modal secret) | — | — |
| DATABASE_URL | Postgres connection | Yes (bfi-secrets Modal secret) | — | — |
| canonical_fee_key column (Phase 55 migration) | CLS-01, CLS-02, CLS-03 | Needs verification | — | Phase 55 must deploy first |

**Missing dependencies with no fallback:**
- Phase 55 migration (`20260409_canonical_fee_key.sql`) must be applied to production before Phase 56 code ships. If canonical_fee_key column doesn't exist, `sweep_canonical_outliers()` silently skips (graceful mode) but extract_llm.py INSERT would fail on the new column.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest (Python), vitest (TypeScript) |
| Config file | `fee_crawler/pytest.ini` or inferred from pyproject.toml |
| Quick run command | `python -m pytest fee_crawler/tests/test_classify_fee.py fee_crawler/tests/test_never_merge.py fee_crawler/tests/test_roomba_canonical.py -x` |
| Full suite command | `python -m pytest fee_crawler/tests/ -x` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CLS-01 | classify_fee() wiring: every inserted fee has canonical_fee_key populated (or NULL for unknowns) | unit | `python -m pytest fee_crawler/tests/test_classify_fee.py -x` | Yes |
| CLS-01 | NEVER_MERGE guards fire correctly at INSERT | unit | `python -m pytest fee_crawler/tests/test_never_merge.py -x` | Yes |
| CLS-02 | classification_cache: same normalized_name returns cached result, no second LLM call | unit | `python -m pytest fee_crawler/tests/test_classify_nulls.py -x` | No — Wave 0 gap |
| CLS-02 | LLM fallback result below 0.90 confidence does not update canonical_fee_key in extracted_fees | unit | `python -m pytest fee_crawler/tests/test_classify_nulls.py -x` | No — Wave 0 gap |
| CLS-03 | Roomba post-crawl flags statistical outliers in newly classified batch | unit | `python -m pytest fee_crawler/tests/test_roomba_canonical.py -x` | Yes |
| CLS-03 | run_post_crawl() returns dict with outliers_flagged and reassignments_made | unit | `python -m pytest fee_crawler/tests/test_roomba_canonical.py -x` | Partial — smoke test only |

### Sampling Rate

- **Per task commit:** `python -m pytest fee_crawler/tests/test_classify_fee.py fee_crawler/tests/test_never_merge.py fee_crawler/tests/test_roomba_canonical.py -x`
- **Per wave merge:** `python -m pytest fee_crawler/tests/ -x`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `fee_crawler/tests/test_classify_nulls.py` — covers CLS-02: classification_cache hit/miss behavior, confidence threshold gate, NEVER_MERGE guard at write time
- [ ] `fee_crawler/tests/test_snapshot.py` — covers D-08: snapshot command creates rows, idempotent on re-run same date

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Pipeline workers use Modal secrets, not user auth |
| V3 Session Management | No | Batch jobs, no sessions |
| V4 Access Control | No | Internal pipeline only |
| V5 Input Validation | Yes | Fee names from LLM output must be normalized before Postgres INSERT — `normalize_fee_name()` strips special chars; `psycopg2` parameterized queries prevent injection |
| V6 Cryptography | No | No secrets stored in code; ANTHROPIC_API_KEY via Modal secrets |

### Known Threat Patterns for Python pipeline + Anthropic API

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Prompt injection via fee name containing instructions | Tampering | XML delimiter wrapping already used in extract_llm.py; normalize_fee_name() strips most injection vectors before Haiku sees the name |
| LLM hallucination producing invalid canonical_fee_key | Tampering / Information Disclosure | Validate LLM output against CANONICAL_KEY_MAP before writing; any key not in the map is rejected regardless of confidence |
| API key exposure in logs | Information Disclosure | anthropic SDK reads from ANTHROPIC_API_KEY env var; never log the key; Modal secrets inject at runtime |

---

## Sources

### Primary (HIGH confidence)

- `fee_crawler/fee_analysis.py` — classify_fee(), normalize_fee_name(), CANONICAL_KEY_MAP (181 entries), FEE_NAME_ALIASES (969 entries), NEVER_MERGE_PAIRS — read directly
- `fee_crawler/commands/roomba.py` — sweep_canonical_outliers(), sweep_canonical_reassignments(), compute_canonical_stats(), detect_canonical_outliers(), run() — read directly
- `fee_crawler/commands/backfill_canonical.py` — bulk classification SQL pattern, snapshot comparison logic — read directly
- `fee_crawler/pipeline/extract_llm.py` — fee dict structure, chunk size constants, LLM tool_use pattern — read directly
- `fee_crawler/modal_app.py` — existing cron schedule, run_post_processing() function — read directly
- `supabase/migrations/20260409_canonical_fee_key.sql` — confirms canonical_fee_key and variant_type columns exist post-Phase 55 — read directly
- `fee_crawler/config.py` — ExtractionConfig.confidence_approve_threshold = 0.90, model = claude-haiku-4-5-20251001 — read directly
- `fee_crawler/tests/test_classify_fee.py` — 16 existing tests — read directly
- `fee_crawler/tests/test_never_merge.py` — 24 existing tests — read directly
- `fee_crawler/tests/test_roomba_canonical.py` — 9 existing tests — read directly
- `.planning/phases/56-auto-classification-pipeline/56-CONTEXT.md` — all locked decisions — read directly

### Secondary (MEDIUM confidence)

- CONTEXT.md D-01 through D-09 decisions — confirmed from project discussion log

### Tertiary (LOW confidence)

- Batch size recommendation (50 names per Haiku request) — ASSUMED based on token budget reasoning
- 5am ET nightly Roomba schedule — ASSUMED based on existing 2-4am crawl window
- COALESCE approach for snapshot UNIQUE constraint — ASSUMED based on standard Postgres behavior

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all dependencies verified in requirements.txt and existing code
- Architecture: HIGH — wiring points verified in source files; patterns follow established codebase conventions
- LLM batch patterns: MEDIUM — prompt design is assumed, will need iteration on first run
- Snapshot schema: MEDIUM — schema locked in CONTEXT.md, UNIQUE constraint detail is assumed

**Research date:** 2026-04-10
**Valid until:** 2026-05-10 (stable domain — no external dependencies that change rapidly)

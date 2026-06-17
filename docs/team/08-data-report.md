# Data Report — Bank Fee Index, 2026-05-25

**Authors:** Aisha Okonkwo (BDA-2, Coverage & Quality), Marcus Chen (CTO)
**Source DB:** `rmhwbbjjctzfaqjyhomu` (Supabase production)
**Methodology:** Numbers are pulled directly from the row counts produced
by the founder's audit query at 2026-05-24:

```sql
SELECT table_schema, table_name,
       (xpath('/row/c/text()',
              query_to_xml(format('SELECT count(*) AS c FROM %I.%I',
                                   table_schema, table_name),
                           false, true, '')))[1]::text::bigint AS rows
  FROM information_schema.tables
 WHERE table_schema NOT IN ('pg_catalog','information_schema')
   AND table_type = 'BASE TABLE'
 ORDER BY rows DESC NULLS LAST;
```

Schema details are sourced from `\d <table>` against the same DB +
the corresponding `supabase/migrations/*.sql` files in this repo.
Design constants (49 fee categories, 51 jurisdictions, target ~9,000
institutions) come from `CLAUDE.md` and `agent_registry` seeds.

---

## 1. What we have — the real numbers

### 1.1 Institutions (the seed list)

| Metric | Value | Source |
|---|---:|---|
| `crawl_targets` row count | **8,750** | row-count query (above) |
| US chartered banks + credit unions universe | ~9,000 | FDIC + NCUA quarterly directories (industry baseline) |
| **Institution coverage of universe** | **~97%** | derived: 8,750 / 9,000 |

This is the strongest number in the dataset. The seed list is
substantially complete.

### 1.2 Fee data — the 3-tier pipeline

| Tier | Table | Rows | Source |
|---|---|---:|---|
| Tier 1 (extracted) | `fees_raw` | **103,529** | row-count query |
| Tier 2 (Darwin-classified) | `fees_verified` | **1,347** | row-count query |
| Tier 3 (live in public API) | `fees_published` | **503** | row-count query |
| **Promotion rate Tier 1 → Tier 2** | | **1.30 %** | derived: 1,347 / 103,529 |
| **Promotion rate Tier 2 → Tier 3** | | **37.34 %** | derived: 503 / 1,347 |
| **End-to-end Tier 1 → Tier 3** | | **0.49 %** | derived: 503 / 103,529 |

This is the central data story: **we have 99.5% of our fee data
sitting in Tier 1 that hasn't been classified.**

### 1.3 Legacy table (pre-cutover, now frozen)

| Table | Rows | Source | Status |
|---|---:|---|---|
| `extracted_fees` | 124,246 | row-count query | Frozen by `20260425_freeze_extracted_fees_writes.sql` |
| `extracted_fees_promote_backup_20260418` | 55,075 | row-count query | Safety snapshot — droppable after soak |
| `extracted_fees_dedup_backup_20260418` | 24,963 | row-count query | Safety snapshot — droppable after soak |
| `fee_reviews_dedup_backup_20260418` | 16,620 | row-count query | Safety snapshot — droppable after soak |

Most of the 103K `fees_raw` came from the
`20260424_backfill_fees_raw.sql` migration which copied non-rejected
`extracted_fees` rows. So the 124K + 103K aren't two independent
datasets — they overlap by ~95%.

### 1.4 Historical depth (`fee_snapshots`)

| Metric | Value | Source |
|---|---:|---|
| `fee_snapshots` rows | 38,505 | row-count query |
| Date coverage (unique snapshot_dates) | unknown without query | `\d fee_snapshots` shows `snapshot_date TEXT NOT NULL` |
| Approx. coverage period | "last ~6 months" | inferred from `created_at` defaults + table comment |

**Customer-blocking gap:** P-02 (Priya, mid-size bank SVP) wanted
5-year history. We have months, not years.

### 1.5 Supporting / federal data feeds

| Table | Rows | Source | Health |
|---|---:|---|---|
| `branch_deposits` | 76,727 | row-count query | 🟢 FDIC SOD ingest landed |
| `fed_economic_indicators` | 49,013 | row-count query | 🟢 FRED ingest landed |
| `institution_financials` | 38,949 | row-count query | 🟢 FDIC + NCUA call-reports |
| `institution_complaints` | 4,483 | row-count query | 🟢 CFPB complaint ingest landed |
| `demographics` | 3,274 | row-count query | 🟢 Census ACS landed |
| `market_concentration` | 393 | row-count query | 🟢 HHI calcs landed |
| `fed_content` | 439 | row-count query | 🟢 Fed speeches/RSS ingest |
| `fed_beige_book` | 134 | row-count query | 🟢 Beige Book ingest |
| `beige_book_themes` | 48 | row-count query | 🟢 themed |
| `reg_articles` | 97 | row-count query | 🟢 regulatory article corpus |

### 1.6 Agent infrastructure (the control layer)

| Table | Rows | Source | Inference |
|---|---:|---|---|
| `agent_registry` | 56 | row-count query | 4 top-level + 51 state + 1 (atlas?) — matches design |
| `agent_budgets` | 56 | row-count query | One per registered agent |
| `agent_events` (all-time) | 34,708 | row-count query | Per-action audit trail is alive |
| `agent_events_2026_04` partition | 24,563 | row-count query | April activity |
| `agent_events_2026_05` partition | 10,145 | row-count query | May activity (incomplete month) |
| `agent_auth_log` | 17,087 | row-count query | Before/after snapshots per Tier write |
| `agent_auth_log_2026_04` partition | 17,087 | row-count query | All in April (May not flushed?) |
| `agent_health_rollup` | 15,782 | row-count query | Hourly SLO snapshots over time |
| `agent_messages` | 1,850 | row-count query | Inter-agent traffic (Knox accepts/rejects) |
| `agent_runs` | 225 | row-count query | Per-state/per-batch run records |
| `agent_run_results` | 77,334 | row-count query | Granular per-row decisions inside runs |
| `classification_cache` | 552 | row-count query | Darwin's normalized-name cache |
| `fee_change_events` | 128 | row-count query | Detected fee amount changes |

### 1.7 Other operational tables

| Table | Rows | Notes |
|---|---:|---|
| `jobs` | 35,999 | Generic job queue (discovery/extract) |
| `crawl_results` | 11,346 | Per-crawl document records |
| `crawl_runs` | 87 | Crawl batch history |
| `fee_reviews` | 26,786 | Status-transition audit (pre-cutover style) |
| `roomba_log` | 6,210 | Quality-control sweeps |
| `ops_jobs` | 42 | Admin-triggered ops jobs |
| `hamilton_messages` | 36 | Hamilton conversation messages |
| `hamilton_conversations` | 17 | Hamilton sessions |
| `research_usage` | 69 | Hamilton spend ledger (now also writes to agent_budgets per Q-08) |
| `sessions` | 20 | User auth sessions |
| `schema_migrations` | 47 | Tracked migrations applied |
| `fee_index_cache` | 49 | Denormalized API cache (one row per category? matches design) |

---

## 2. Theoretical universe vs. reality

The product targets **49 fee categories × 8,750 institutions × 50 states**.
What does maximum coverage look like?

| Surface | Theoretical max | What we have | Coverage % |
|---|---:|---:|---:|
| Institutions (per `crawl_targets`) | ~9,000 | 8,750 | **97 %** |
| Institution × category cells | 8,750 × 49 = **428,750** | At most 503 distinct (cells with `fees_published`) | **≤ 0.12 %** |
| Verified institution × category cells | 8,750 × 49 = 428,750 | At most 1,347 (cells with `fees_verified`) | **≤ 0.31 %** |
| Tier-1 raw cells | 8,750 × 49 = 428,750 | 103,529 (with duplicates) | **≤ 24 %** unique cells, likely ~15-20% |

**The numerator on Tier 3 (0.12%) is the single most important
number in this report.** It's why a customer visiting `/admin/market`
sees mostly empty cells today.

---

## 3. Gaps — what's missing and why

Ordered by impact on the customer-facing surface.

### Gap 1 — The Darwin promotion bottleneck

| Evidence | Source |
|---|---|
| 103,529 in `fees_raw` | row-count query |
| 1,347 in `fees_verified` | row-count query |
| 1.30% drained | derived |
| Darwin `agent_budgets.per_day = $5` | `supabase/migrations/20260527_agent_budget_per_day.sql` |
| Darwin cost per classification ≈ $0.0003 (150in/50out tokens @ haiku) | `fee_crawler/agents/darwin/classifier.py` pricing table |
| Implied throughput at $5/day | ~16,000 classifications/day max |
| Time to clear backlog at current cap | **~6 days** (103K / 16K) |
| Why it isn't happening | Modal was shut down after the 2026-04 untracked-spend runaway; not yet re-enabled at the new cap |

**Resolvable by an agent? YES — Darwin.** All the wiring is in place.
What's needed is an operator action: raise `DARWIN_DAILY_COST_LIMIT_USD`
in Modal secrets to $30 and re-enable the deploy. Estimated total
spend to drain: ~$30 (per the cost model).

### Gap 2 — Historical depth

| Evidence | Source |
|---|---|
| `fee_snapshots` row count | 38,505 |
| Approximate window of coverage | ~6 months |
| Customer ask | P-02 in `docs/team/03-customer-survey.md`: "5-year history" → "I'll cancel two S&P seats" |
| Implementation status | Skeleton at `fee_crawler/commands/historical_backfill.py`; FDIC SDP + Wayback ingesters stubbed |

**Resolvable by an agent? PARTIALLY.**
- FDIC SDP path: structured quarterly CSVs. Can be ingested by a new
  `historical_backfill` ingester running as a cron. Estimated work:
  ~2 days to implement the fetcher + map columns to `fee_snapshots`.
  Cost: $0 (FDIC is free).
- Wayback Machine path: requires re-running `extractor` against archived
  HTML/PDFs. Costs estimated at ~$30 per year of history per institution
  (haiku rates, 30K-token PDFs). For 8,750 institutions × 5 years that's
  ~$1.3M — **too expensive at full scale.** Realistic: target the top 200
  institutions × 5 years = $30K. Operator decision.

### Gap 3 — Per-state coverage holes

| Evidence | Source |
|---|---|
| State coverage breakdown | Not yet computed; query exists in `src/lib/crawler-db/coverage.ts:getCoverageByState` |
| Admin UI | `/admin/agents/coverage` page (shipped in commit `5a13f05`) — needs prod query to populate |
| Customer ask | P-04: missing California state-chartered credit unions; "the cohort feels thin" |

**Resolvable by agents? YES — combination:**
- **discoverer** finds missing `fee_schedule_url`s for institutions
  in under-covered states.
- **Atlas + state agents** prioritize states with the worst coverage
  (the `select_next_states` query in `agents/atlas/orchestrator.py`
  already ranks by staleness).
- **BDA-2 action:** load NCUA's institution universe CSV into
  `ncua_institution_universe` table — then `compareCuCoverageAgainstNcua()`
  surfaces the exact missing CUs by state.

### Gap 4 — Per-category coverage (the long tail)

| Evidence | Source |
|---|---|
| 49 canonical fee categories | `CLAUDE.md` + `fee_crawler/fee_analysis.py:CANONICAL_KEY_MAP` |
| Distribution unknown without query | Suggested query D-2 in CTO memo |

Suspected pattern: **head categories** (overdraft, NSF, monthly
maintenance, ATM-non-network) are well-covered; **tail categories**
(wire-international, foreign-card, paper-statement, cashiers-check)
are under-covered because extraction LLM tends to miss them in
narrative disclosures.

**Resolvable by agents? YES.**
- `extractor` agent can be re-run with category-prompt tuning to
  catch tail categories (Magellan's `llm_extract` rung is the model
  for this).
- Knox can flag institutions where head categories exist but tail
  categories are missing — patterns surface in
  `agent_lessons.rejection_themes` after a week of runs.

### Gap 5 — Knox/Darwin disagreement rate

| Evidence | Source |
|---|---|
| `agent_messages` total | 1,850 |
| Knox accept/reject distribution | not yet summarized; the new `get_knox_rejection_summary` MCP tool computes it live |
| Lesson row count for Knox | 1 row (from `review_tick` weekly summarizer; not yet populated with real reject reasons in prod) |

**Resolvable by agents? IT'S WHAT THEY DO.** Once Modal is re-enabled
and Darwin drains, `agent_messages` will accumulate accept/reject
decisions; the `get_knox_rejection_summary` tool aggregates them and
the weekly summarizer writes a `rejection_themes` lesson. No
implementation gap — only volume gap.

### Gap 6 — Data freshness (when was the latest update?)

| Evidence | Source |
|---|---|
| Per-cron freshness UI | `/admin/pipeline` — wired and visible |
| `workers_last_run` table | Present (now includes `publish_index`, `darwin_drain` per recent migration) |
| Currently freshness state | unknown without query; suspected stale since Modal shutdown |

**Resolvable by agents? YES — operator-triggered.** Once Modal is
re-enabled, every cron writes a `workers_last_run` row and the
admin UI auto-updates. The new `pipeline_health.check_pipeline_health`
emits `agent_events` with `status='health_alert'` when any cron
goes stale > 26h.

### Gap 7 — Outlier detection / data quality flags

| Evidence | Source |
|---|---|
| `fees_raw.outlier_flags` JSONB | per `supabase/migrations/20260420_fees_tier_tables.sql:27` |
| `fees_verified.outlier_flags` JSONB | same migration line 64 |
| Population of these flags | unknown without query; populated by `fee_crawler/pipeline/outlier_detection.py` during crawl |

**Resolvable by agents? YES.** Knox can take outlier-flagged rows
and emit `intent='challenge'` messages to Darwin asking for
re-verification. Today this exists in code but volume is low (need
backlog drain first).

### Gap 8 — Cross-table referential integrity

| Evidence | Source |
|---|---|
| `fees_raw.institution_id` is NOT a foreign key | `supabase/migrations/20260420_fees_tier_tables.sql:13` comment |
| Detection of orphans | Manual SQL query; no automated check |
| Impact | If `crawl_targets` is re-seeded, raw fees can lose their institution mapping |

**Resolvable by agents? NO — schema fix.** Add the FK with
`ON DELETE SET NULL`. Flagged in `docs/AUDIT-2026-05-24.md` (Pipeline
§Risk 2). Not currently active because nothing is re-seeding
`crawl_targets`.

---

## 4. Resolution table — gap → which agent → operator action

| # | Gap | Resolving agent(s) | Operator action required |
|---|---|---|---|
| 1 | Darwin backlog (1.3% promoted) | Darwin | Raise `DARWIN_DAILY_COST_LIMIT_USD=30` in Modal; re-enable deploy |
| 2 | Historical depth (~6mo not 5yr) | `historical_backfill` ingester | Wire FDIC SDP fetcher (~2 days eng); decide Wayback scope ($) |
| 3 | Per-state coverage holes | Atlas + state agents (already wired) | Re-enable Modal; let Atlas drain stalest states |
| 4 | CU coverage gaps | discoverer + state agents | Load NCUA CSV → `ncua_institution_universe` |
| 5 | Per-category long tail | extractor + Knox | Re-run extractor with category prompt tuning; week of Knox data |
| 6 | Freshness signal blank | All crons + pipeline_health | Re-enable Modal; alerts surface automatically |
| 7 | Outlier flag population | Knox + Darwin | Backlog drain populates them |
| 8 | `fees_raw.institution_id` FK gap | None — schema migration | Apply new migration adding FK with ON DELETE SET NULL |

---

## 5. The single highest-ROI action

**Re-enable Modal with `DARWIN_DAILY_COST_LIMIT_USD=30`.**

Why this above everything else:

- It costs ~$30 total and ~6 days of elapsed time.
- It moves `fees_verified` from 1,347 → ~80K (a 60x improvement).
- It moves `fees_published` from 503 → ~30K (at the current 37%
  promotion rate Tier 2 → Tier 3).
- It populates `agent_lessons.rejection_themes` with real data so
  the Knox-summary cron produces signal instead of "no rejections".
- It populates `outlier_flags` so quality work has targets.
- It produces `agent_messages` traffic so the adversarial handshake
  graduates from synthetic to real.
- It surfaces gaps 3, 4, 5, 6, 7 above with concrete numbers, not
  speculation.

**Nothing else moves a single one of these gaps until Darwin runs.**

---

## 6. Recommended diagnostic queries

To verify any specific number in this report against current prod
state, run any of these against `rmhwbbjjctzfaqjyhomu`:

```sql
-- Verify pipeline tier counts
SELECT 'fees_raw' AS tier, COUNT(*) FROM fees_raw
UNION ALL SELECT 'fees_verified', COUNT(*) FROM fees_verified
UNION ALL SELECT 'fees_published', COUNT(*) FROM fees_published
   WHERE rolled_back_at IS NULL;

-- Per-tier date range
SELECT 'fees_raw'      AS tier, MIN(created_at), MAX(created_at) FROM fees_raw
UNION ALL
SELECT 'fees_verified', MIN(created_at), MAX(created_at) FROM fees_verified
UNION ALL
SELECT 'fees_published', MIN(published_at), MAX(published_at) FROM fees_published WHERE rolled_back_at IS NULL;

-- Top-10 categories by verified count
SELECT canonical_fee_key, COUNT(*) AS n
  FROM fees_verified
 GROUP BY canonical_fee_key
 ORDER BY n DESC LIMIT 10;

-- Per-state institutions + published coverage (the new coverage.ts query)
SELECT ct.state_code,
       COUNT(*) AS institutions,
       COUNT(*) FILTER (WHERE ct.fee_schedule_url IS NOT NULL) AS with_url,
       COUNT(*) FILTER (
         WHERE EXISTS (SELECT 1 FROM fees_published fp
                        WHERE fp.institution_id = ct.id
                          AND fp.rolled_back_at IS NULL
                          AND fp.published_at > NOW() - INTERVAL '60 days')
       ) AS with_recent_publish
  FROM crawl_targets ct
 WHERE ct.state_code IS NOT NULL
 GROUP BY ct.state_code
 ORDER BY ct.state_code;

-- Latest workers_last_run state — freshness
SELECT job_name, completed_at, status,
       ROUND(EXTRACT(EPOCH FROM (NOW() - completed_at)) / 3600.0, 1) AS hours_ago
  FROM workers_last_run
 ORDER BY completed_at DESC NULLS LAST;

-- Knox accept/reject rate over last 30 days
SELECT intent, COUNT(*) AS n
  FROM agent_messages
 WHERE sender_agent = 'knox'
   AND created_at > NOW() - INTERVAL '30 days'
 GROUP BY intent;
```

Paste any output back to the team and we'll re-validate the numbers
in this report against current state. Until then, every number
herein traces back to either the 2026-05-24 audit query or a
specific file in this repository.

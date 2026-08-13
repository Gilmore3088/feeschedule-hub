---
title: Synthesis — Pipeline and Hamilton Audit
date: 2026-04-16
inputs:
  - 01-fee-pipeline.md
  - 02-hamilton-layer.md
  - 03-data-integrity.md
  - 04-orchestration.md
status: complete
---

# Synthesis — Pipeline and Hamilton Audit

## One-sentence finding

**The system is a well-engineered set of stages that doesn't function as a pipeline** — most stages work in isolation, but the connective tissue (lineage preservation, feedback loops, orchestration of the compounding features) is broken or missing, which is why data quality degrades silently and the "automated, orchestrated, compounding" vision is not yet operational.

---

## Visual system map — current state

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           COLLECTION PIPELINE                                │
│                                                                              │
│   [Seed]──────►[Discover]──────►[Fetch]──────►[Extract]──────►[Categorize]──►[Validate] │
│      │             │              │ ❶           │ ❷             │ ❸         │
│      ↓             ↓              ↓             ↓               ↓           │
│   FDIC+NCUA    discovery_     crawl_results  extracted_fees   fee_category  │
│   → crawl_     cache          + R2 doc       (no doc_url      (silent       │
│     targets    (URL)          ❹              column!)         errors ~5-10%)│
│                                                                              │
│                                                                              │
│   ┌──Wave Orchestrator (coded ✓)──NOT SCHEDULED ✗──────────────────┐        │
│   │  Iterative deepening / pass N learns from pass N-1              │        │
│   │  Cross-state pattern promotion → knowledge/national.md (manual) │        │
│   └─────────────────────────────────────────────────────────────────┘        │
│                                                                              │
│   Modal cron (runs nightly):  discover 02:00 │ pdf 03:00 │ browser 04:00    │
│                                post-process 06:00 │ ingest 10:00             │
│   ⚠ Wave orchestrator is NOT in any cron slot — 5/5 full with commodity jobs│
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼  (unidirectional — no feedback)
┌─────────────────────────────────────────────────────────────────────────────┐
│                       HAMILTON INTELLIGENCE LAYER                            │
│                                                                              │
│   Queries WHERE fee_category = ... (NOT canonical_fee_key!) ❺               │
│   No quality filter — rows with NULL document_url contribute equally to     │
│   medians as rows with verified source ❻                                    │
│                                                                              │
│   [Assemblers]   [Research Agents]   [Pro Screens]   [Reports (PDF)]        │
│        │                │                 │                 │                │
│        └────────────────┴─────────────────┴─────────────────┘                │
│                         │                                                    │
│                         ▼                                                    │
│                hamilton_* tables (7 tables, RLS disabled ⚠)                 │
│                external_intelligence                                         │
│                                                                              │
│   No feedback loop — Hamilton cannot flag bad data back to crawler ❼        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Eight lesions (❶–❽) the audit surfaced

| # | Lesion | Severity | Agent doc |
|---|---|---|---|
| **❶** | Fetch writes `document_url` to `crawl_results` but extract links via `crawl_result_id` — no materialized column on `extracted_fees`. Queries assuming `extracted_fees.document_url` see NULL on 80.4% of rows | Critical | 01 §3 + 03 §2 |
| **❷** | Extract has no silent-failure surfacing — 0-fee retries logged but not routed to triage | High | 01 §3 |
| **❸** | Categorize silently filters unmatched fee names. No audit. ~5-10% miscategorized. | Critical | 01 §5 + 02 §"Where Pipeline Gaps Bite" |
| **❹** | R2 documents stored but `crawl_results.document_path` NULL in prod (sibling column to `document_url`). Even when R2 doc exists, retrieval requires cross-joining `crawl_targets`. | Critical | 03 §"R2 Document Storage" |
| **❺** | Hamilton queries `fee_category`, ignores `canonical_fee_key` entirely — Phase 55 foundation is unused by downstream consumers | High | 02 §"Pipeline Gaps" |
| **❻** | Reports include un-sourced fees in medians with no visibility flag. "Median from verified sources" not distinguishable from "median including orphans." | High | 02 §"Pipeline Gaps" |
| **❼** | No feedback loops — no signal from Hamilton/reports/admin review back to the crawler. Compounding is one-way and manual. | Critical | 02 + 04 |
| **❽** | Wave orchestrator and knowledge compounding are coded but not scheduled. 5 Modal cron slots full with commodity extraction jobs. | Critical | 04 §"Scheduled Workers" |

---

## Five cross-cutting themes

### Theme 1 — Lineage crisis (the 80% number)

**What's broken:** 82,805 of 103,052 active fees cannot be traced back to a source document. The `document_url` field on `crawl_results` is NULL for this majority; R2 `document_path` is also NULL on 100% of the sample inspected. When asked "where did this $2,500 investment management fee come from?", the system cannot answer.

**Root cause (synthesized from 01 and 03):** This is not a single bug but a schema + population pattern problem:
- `extracted_fees` has `crawl_result_id` as an FK — correct
- But writing `extracted_fees` does not materialize the source URL onto the fee row
- `crawl_results.document_url` and `document_path` are populated only on successful crawls (best-effort); failed/unchanged/retry paths leave them NULL
- Historical data from SQLite → Postgres migration may have lost the join

**Why it's the critical crisis:** Without source traceback, the system cannot self-correct. Smart Roomba is impossible. Audit/compliance is impossible. Re-extraction with a better model is impossible. This single gap gates multiple downstream improvements.

### Theme 2 — Hamilton is blind to data quality

**What's happening:** Hamilton reports and Pro screens consume `extracted_fees` with a single filter (`review_status != 'rejected'`). They do NOT check:
- Whether the fee has a source URL
- Whether the extraction confidence was high
- Whether the fee_category matches what the fee_name suggests
- Whether `canonical_fee_key` is populated (Phase 55's output)

**Concrete effect:** A $2,500 "Investment Management" fee miscategorized as `monthly_maintenance` appears in the national monthly maintenance median. The B2B subscriber (paying $2,500/month for peer benchmarking) sees a polluted number with no warning.

**Compounding risk:** Hamilton's authority is built on perceived data integrity. Every report that ships with bad data erodes the premium positioning.

### Theme 3 — No feedback loops anywhere

**One-way pipeline:** Data flows crawler → DB → Hamilton. Nothing flows back. Specifically:

- Admin review actions (analyst approves/rejects a fee) don't teach the crawler which URLs or patterns produce bad extractions
- Hamilton reports that notice statistical oddities (e.g., `queryOutliers()`) don't trigger re-review or re-extraction
- Roomba findings (1,327 canonical outliers, 10,465 amount-band flags in today's dry-run) don't create tickets or route to the URL-finder
- Low-confidence extractions stay `staged` indefinitely rather than trigger an automatic recovery path
- Stale/dead URLs discovered during crawl don't trigger re-discovery

**Why "compounding" doesn't happen today:** The compounding hooks exist (knowledge files, Roomba log, classification cache, wave orchestrator) but they aren't wired to react to signals from elsewhere in the system.

### Theme 4 — Orchestration is half-built

**What Phases 19–22 shipped:**
- Wave orchestrator with iterative deepening (tier1 → tier2 → tier3 escalation)
- Knowledge automation (cross-state pattern detection, promotion to national knowledge)
- Wave reporting (before/after metrics)

**What's running in prod:**
- Five nightly Modal cron jobs (discover/pdf/browser/post-process/ingest)
- None of them invoke the wave orchestrator
- Knowledge promotion requires manual CLI invocation
- `run_monthly_pulse()` exists as a manual-only function because Modal free tier caps at 5 cron slots

**Net effect:** The ambitious orchestration layer the team built to address coverage gaps is architecturally present but operationally inert. The pipeline runs on its simpler commodity-extraction predecessor.

### Theme 5 — Audit trails are sparse and fragmented

**What exists:** `roomba_log` (outlier fixes), `fee_reviews` (manual actions), `fee_snapshots` + `coverage_snapshots` (time-series), `classification_cache` (LLM-as-classifier results).

**What's missing:**
- **LLM extraction raw:** Prompt + response from Claude Haiku at extraction time is not persisted. Cannot re-run with a different model, cannot audit "what text was the model looking at when it extracted this fee."
- **R2 document versions:** Single key per target; if a bank re-publishes the schedule, the old version is lost.
- **Crawl-level fee diff history:** `fee_change_events` table may exist but is not a first-class audit trail — the user's core peer-price-movement value prop depends on reliable change detection.
- **Cross-table correlation:** `roomba_log` and `fee_reviews` are separate audit streams with no unified change history for a given fee.

---

## What "automated, orchestrated, compounding" actually requires

The operator's framing maps to three distinct architectural upgrades:

### Automated → remove manual triggers from the happy path

Concretely:
- Wave orchestrator becomes a scheduled worker, not a CLI command
- Knowledge promotion (`promote_cross_state_patterns`) runs after every wave, not on demand
- Smart Roomba runs after every crawl, flags/routes work automatically
- Backfill and migration applications get a CI/CD pattern (migrations not sitting unapplied for a week)

### Orchestrated → stages route work to each other

Concretely:
- Dead URL discovered in crawl → automatically requeued to discovery with `--force`
- Low-confidence extraction → automatically retried with a more specific prompt AND queued for manual review
- Roomba-flagged orphan fee → automatically routed to re-extraction if source exists, URL rediscovery if not
- Admin rejection of a fee → pattern logged back to extraction knowledge
- Hamilton outlier signal → automatically triggers re-review of the underlying fees

### Compounding → every cycle provably improves the next

Concretely:
- Each wave's learnings (new URL patterns, new fee aliases, new failure modes) must flow into the next wave's starting knowledge
- Successful extractions on tricky sites become reusable selectors stored in `crawl_targets.crawl_strategy`
- Admin review decisions teach the classifier (classification_cache feedback)
- Revenue correlation findings (published fees vs Call Report service charge income) trigger targeted re-crawls of institutions with implied-but-missing fees

---

## Prioritized gap list (rank-ordered by downstream impact)

| Rank | Gap | Impact | Effort | Fix scope |
|---|---|---|---|---|
| **1** | Source lineage crisis (80.4% NULL document_url, 100% NULL document_path) | Blocks smart Roomba, audit/compliance, re-extraction, lineage-aware medians | Medium | Schema + fetch-stage fix + backfill + pipeline discipline |
| **2** | Categorization silent errors (~5-10% of active fees) | Pollutes every downstream median, benchmark, report | Medium-High | Retraining classifier, categorization QA pass, feedback loop from review |
| **3** | Wave orchestrator + knowledge compounding not scheduled | The flagship orchestration capability is operationally inert | Low-Medium | Modal cron slot expansion OR reorganization; wire knowledge promotion into cron |
| **4** | No feedback loops (admin review, Hamilton signals, Roomba findings) | Prevents "compounding" fundamentally | High | Event/queue system; signal→route→remediation pipeline |
| **5** | Hamilton ignores `canonical_fee_key`, ignores source traceback | Phase 55 foundation unused; reports lack sourcing transparency | Low | Refactor Hamilton queries to use canonical + add source metrics |
| **6** | Missing raw LLM data and R2 versioning | Prevents re-extraction, version audit, change detection | Medium | Add `llm_extractions` table; add R2 versioning convention |
| **7** | Modal 5-cron-slot limit blocks adding wave + smart Roomba | Operational ceiling | Low | Upgrade Modal tier or consolidate jobs |
| **8** | Roomba is a gate, not a router; can't route orphans downstream | Can't convert findings into action | Medium | Rewrite Roomba as event emitter + worker router |
| **9** | RLS disabled on 7 Hamilton tables (anon key exposure) | Security leak | Low | Enable RLS + no-policy default |
| **10** | SQLite ↔ Postgres drift; legacy code paths still exist | Technical debt accumulation | Medium | Complete the cutover per `project_kill_sqlite.md` |

---

## Proposed Phase 62 — the first concrete slice

**Milestone:** v10.0 — Pipeline Integrity and Compounding Foundation (new milestone)

**Phase 62: Source Lineage Restoration**

Goal: every row in `extracted_fees` can be traced back to a source document in R2 (or a recorded reason why not), and a test prevents future orphaning.

Success criteria:
1. `extracted_fees` gains `source_url` and `source_r2_key` columns (or a materialized view — TBD in planning)
2. Backfill populates these for 95%+ of existing active fees
3. A Postgres trigger or extract-stage assertion ensures new fees cannot be inserted without source linkage
4. A CI test asserts NULL rates stay under threshold
5. Dashboard surface shows "% fees with verified source" as a first-class data quality metric

**Why Phase 62 first:** Theme 1 gates smart Roomba, audit trails, and quality-aware Hamilton. Unblocking it unlocks Phases 63 (smart Roomba), 64 (categorization QA via feedback), and more.

## Phase 63+ sketch (what follows Phase 62)

- **Phase 63: Categorization QA + Feedback Loop** — retrain classifier against human-verified corpus, add admin-review-feeds-classifier loop, enable Hamilton to flag and re-trigger
- **Phase 64: Smart Roomba** — transform from gate to event-driven router; orphan routing, re-extraction triggers, re-discovery triggers
- **Phase 65: Schedule the Wave Orchestrator** — wire the existing wave system into Modal cron; consolidate or upgrade cron slots; connect knowledge promotion
- **Phase 66: Hamilton Quality-Awareness** — refactor all Hamilton queries to use `canonical_fee_key`, surface data-quality badges on reports, add feedback hooks
- **Phase 67: Raw LLM Persistence + R2 Versioning** — enable re-extraction workflows and change detection
- **Phase 68: RLS Policies** — close the Hamilton-table security leak

All seven phases together implement the "automated, orchestrated, compounding" end-state.

---

## What to do next

This audit is research, not code. The operator's options now:

1. **Review the four mapper docs** (01–04) and this synthesis — confirm the diagnosis matches their mental model
2. **Plan Phase 62 formally** via `/gsd-plan-phase 62` when ready — would pull source lineage restoration into a concrete plan with task breakdown
3. **Kick off a new milestone v10** via `/gsd-new-milestone` if the scope above resonates
4. **Prioritize differently** — if Hamilton-ignores-canonical (theme 5) is more urgent than source lineage (theme 1), reorder

Phase 55 can be marked complete on ROADMAP.md at operator's discretion — SC1-SC4 are fully satisfied; SC5 is infrastructure-complete (Roomba runs and produces findings) but the findings are currently unapplied pending the Phase 62+ remediation work above.

---

## Artifacts produced by this audit

```
.planning/audits/2026-04-16-pipeline-audit/
├── OVERVIEW.md              — why this audit
├── 01-fee-pipeline.md       — collection side (seed through validate)
├── 02-hamilton-layer.md     — intelligence side
├── 03-data-integrity.md     — data, storage, audit trails
├── 04-orchestration.md      — automation and compounding mechanics
└── SYNTHESIS.md             — this document
```

Total: ~2,700 lines of current-state documentation. All findings cite file:line. No code changes in this audit.

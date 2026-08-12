# Unified Agentic Data Pipeline — Audit & Target-State Blueprint

**Date:** 2026-04-19
**Author:** James Gilmore (with Claude)
**Status:** Draft — pending user review
**Scope:** Audit current data pipeline (legacy + agentic + admin + cost + standardization) and sketch the single replacement system. This document is the parent; each target-state primitive becomes a separate Phase B sub-spec.

**Reading note.** Sections 2.2 (what-writes-what table), 2.4 (admin entry-point inventory), and 3 (full gap ledger) ship as *column contracts* in this spec and get populated with evidence during audit execution (the plan produced by the `writing-plans` skill, next). That deferral is intentional — committing to the table schema and ranking rule up front lets the populate step be mechanical rather than interpretive.

---

## 1. Goals

Two success criteria, ranked:

**B — Full autonomy.** The system self-dispatches, self-corrects, self-reports. No human clicks "run" on anything routine. Humans govern the *system* (taxonomy, prompts, budgets, anomaly thresholds) — not individual data points.

**D — Data trustworthiness.** Every published fee and every downstream Hamilton report traces to verified, standardized data. No unverified path reaches the index. No taxonomy drift. No schema fragmentation.

Explicit non-goal: incremental improvement of the existing pipeline. The intent is a single replacement system; legacy artifacts either become callable units inside the new system or are deleted.

**Human-in-the-loop boundary:** Tiered + anomaly-only. Routine fees auto-publish through Darwin → Knox. Only anomalies (Knox-flagged, pricing-move-threshold breaches, taxonomy-edge cases, statistical outliers) queue for human review. Humans approve no routine fees; humans do approve system governance (taxonomy, prompts, alarm thresholds, budgets).

---

## 2. Current-state map

### 2.1 Architecture diagram

See `.superpowers/brainstorm/41571-1776621838/content/current-state-map.html` for the rendered diagram; authoritative version will be regenerated into `docs/superpowers/specs/diagrams/` when the audit is executed.

Top-level shape today:
- **Entry points:** FDIC / NCUA / Fed / BLS / CFPB ingests + web crawl + manual seed — each with its own adapter logic and ID conventions.
- **Legacy CLI layer:** 45+ Python commands in `fee_crawler/commands/` (crawl, recrawl, reextract, categorize_fees, classify_nulls, backfill_canonical, merge_fees, roomba, publish_fees, publish_index, revalidate_urls, google_discover, rediscover_failed, auto_review, snapshot_fees, rollback_publish, run_pipeline, analyze, enrich, + 25 more). No shared state, no cost cap, no standardized retry, many write directly to `extracted_fees`.
- **Agentic layer:** Magellan (URL rescue, 5-rung ladder), Darwin (classifier, auto-promote ≥0.90), Knox (adversarial review), Hamilton (TS-side research). Atlas is scoped but not wired. `agent_base` / `agent_tools` / `agent_messaging` / `agent_mcp` infrastructure partially built under Phase 62a/62b.
- **Scheduled runners:** Modal crons at 02:00 / 03:00 / 04:00 / 05:00 / 06:00 / 10:00 UTC; Vercel ISR; GitHub Actions. Each cron has its own window and error handling.
- **Data store:** Postgres (Supabase) — `institutions`, `extracted_fees`, `fees_verified`, `crawl_targets`, `crawl_runs`, `agent_events`, `workers_last_run`, `canonical_fee_key_map`, `fee_change_events`, `institution_dossiers`, Hamilton's private tables (`hamilton_saved_analyses`, `hamilton_reports`, `hamilton_signals`, etc.).
- **Admin portal:** 22 routes under `/admin/*`. No single cockpit; ops work hops between `/pipeline`, `/agents`, `/darwin`, `/coverage`, `/quality`, `/data-quality`, `/ops`, `/fees`. Read-only views (`/index`, `/market`, `/peers`, `/districts`, `/national`) are fine as-is.

### 2.2 "What-writes-what" table (to be enumerated during audit execution)

For each table: writer processes, write frequency, write contract (direct SQL vs. through agent gate). The purpose of this table is to expose (a) collisions (multiple writers, inconsistent contracts) and (b) orphan tables (nobody writes, nobody reads). Populated during audit execution, not in this spec.

### 2.3 Cron inventory (current health, 2026-04-19 snapshot)

| Schedule | Job | Source | Today's status | Marker health |
|---|---|---|---|---|
| 02:00 UTC | `run_discovery` | Modal | **HUNG** (18 stuck rows since 2026-03-17) | `crawl_runs` leak, no `workers_last_run` |
| 03:00 UTC | `run_pdf_extraction` | Modal | **HUNG** | Same leak pattern |
| 04:00 UTC | `run_browser_extraction` | Modal | **FAILED** (07:00 marker written) | `workers_last_run` status=failed |
| 05:00 UTC | `magellan_rescue` / `darwin_drain` / `knox_review` | Modal | ✓ OK | All three markers present |
| 06:00 UTC | `daily_pipeline` | Modal | **SILENT MISS** (no marker, no error trail) | 10-min window no catch-up |
| 10:00 UTC | `ingest_data` | Modal | ✓ OK | Marker present |
| nightly | E2E Pipeline Tests | GH Actions | ✗ failed pre-fix; unblocked by 2026-04-19 CI patch | — |
| on push | Unit Tests / tests | GH Actions | ✓ Unit green; `tests` still has 38 Phase 62 failures (separate todo) | — |

Filed todos for the three current-state failures: `2026-04-19-daily-pipeline-no-catch-up-when-window-missed.md`, `2026-04-19-modal-scrape-crons-leak-running-rows-on-crash.md`, `2026-04-19-phase-62-test-suite-has-38-failures.md`.

### 2.4 Admin entry-point inventory (to be enumerated during audit execution)

Per route: data source, write capability, operator purpose, target-state disposition (keep / consolidate / kill).

---

## 3. Gap ledger

Ranked list of every gap between today and the target state. Ordered by leverage score: `impact_autonomy + impact_trust − fix_size_weight`, ties broken by blocking status. Populated during audit execution. Expected to have 20–30 rows.

Column contract:

| Column | Definition |
|---|---|
| # | Rank (1 = highest leverage). |
| Gap | Short name. |
| Category | Orchestration · Data trust · Cost · Admin UX · Reliability · Identity. |
| Impact on autonomy (B) | 1–5. Does this require human intervention today? |
| Impact on trust (D) | 1–5. Can bad data reach the index because of this? |
| Evidence | File paths, commit hashes, row counts, incident dates. No hand-waving. |
| Fix size | XS · S · M · L. |
| Blocks | Other gaps that depend on this being fixed first. |
| Phase B sub-spec | Which of B1–B7 this feeds into (or "tactical — no sub-spec"). |

**Representative gaps already identified** (not exhaustive; full list generated during audit execution):

- Legacy CLI writes to `extracted_fees` bypass Darwin/Knox — breaks data trust at the root. Evidence: ~45 commands in `fee_crawler/commands/`. Size: L. Feeds B5.
- Institution identity fragmented across FDIC / NCUA / Call Reports / CFPB with no translator service. Evidence: `UNCONFIRMED-*` hack in orchestrator prompts; Phase 62 ID-type test failures. Size: L. Feeds B1.
- Python↔TS taxonomy drift is a recurring failure mode (handled on 2026-04-19; prior instance in `feedback_html_prototypes_are_source.md`). Evidence: today's commit `3b75a53`. Size: M. Feeds B3.
- `daily_pipeline` silent miss with no catch-up path. Evidence: 0 rows in `workers_last_run` for 2026-04-19. Size: S. Tactical — no sub-spec.
- 18 leaked `crawl_runs` since 2026-03-17 (no try/finally in Modal scrape functions). Evidence: cleaned today. Size: S. Tactical or folds into B6.
- Admin cockpit doesn't exist; 22 routes with no anomaly queue. Evidence: no `/admin/cockpit`; review UX scattered. Size: L. Feeds B7.
- Hamilton's $50/day cost breaker is isolated; no cross-system cost rollup. Evidence: `src/lib/hamilton/`; no unified budget table. Size: M. Feeds B2.
- 38 Phase 62 integration tests failing (jsonb codec, reserved-word SQL, NOT NULL fixtures, ID-type drift, missing Knox override migration). Evidence: todo filed. Size: M. Tactical cleanup; partial inputs to B1 (ID types) and B4 (tool contract).

---

## 4. Target-state blueprint — seven primitives

See `.superpowers/brainstorm/41571-1776621838/content/target-state.html` for the rendered diagram.

### 4.1 Atlas — the orchestrator

Single brain. Subscribes to a priority queue driven by the institution-first Tier 1 / Tier 2 rule (`feedback_scan_priority_order.md`). Dispatches the agent fleet in waves with a concurrency cap. Writes every decision to `agent_events` as an auditable trail. **Nothing else triggers agents** — no Modal time-crons running agent logic, no CLI invocations of agent code, no direct SQL writes that bypass Atlas. Retry + catch-up are built into the dispatcher, not per-agent.

### 4.2 Agent fleet with one tool contract

Magellan, Darwin, Knox, Hamilton (+ future agents) all speak the same protocol: `{input payload} → {handoff JSON with status, confidence, cost_usd, artifacts, next_action_hint}`. The contract already half-exists in Phase 62a/b `agent_base` / `agent_tools`. Every agent subclasses one base, every agent's cost gets rolled up, every agent is stoppable from one place. **The 45 legacy CLI commands either become agent capabilities or die.** `crawl` and `recrawl` fold into Magellan's contract. `categorize_fees` / `classify_nulls` / `backfill_canonical` fold into Darwin. `auto_review` / `roomba` fold into Knox. `publish_fees` / `publish_index` become the post-Knox write path, not standalone scripts.

### 4.3 One data path, one gate

All fee data flows: entry → `fees_staged` (raw) → Darwin (classify) → `fees_classified` (canonical_key set) → **Knox gate** → `fees_verified` (published). Nothing writes to `fees_verified` except through Knox. Nothing bypasses Darwin. Legacy "write direct to `extracted_fees`" is deleted. Tiered + anomaly-only human approval forks off Knox: anomalies route to `anomaly_queue`; routine publishes automatically.

### 4.4 Unified budget ledger

One table (`agent_budget_ledger` or similar) captures every token-consuming call with `{agent, cost_usd_cents, tokens_in, tokens_out, ts, call_id}`. Hard per-agent daily caps, a hard system-wide daily cap, and a hard monthly envelope — all enforced **at the tool-call boundary**, not after the fact. Trajectory alarms fire at 70% burn. Hamilton's $50/day pattern generalizes; `report-limits.ts` folds in.

### 4.5 Single admin cockpit

One page (`/admin/cockpit`) replaces the ops slice of today's 22 routes. Four panels:
- **(a) Agent fleet status:** live queue depth per agent, last success/failure, kill switch per agent. Replaces `/admin/agents`, `/darwin`, `/coverage`, `/pipeline`.
- **(b) Anomaly review queue:** Knox-flagged pricing moves, outlier fees, taxonomy edge cases. Only surface where a human works individual fees. Replaces scattered review UX in `/fees`, `/ops`, `/quality`.
- **(c) Budget dashboard:** per-agent spend today, trajectory vs. cap, monthly envelope burn. New surface.
- **(d) Coverage SLA:** Tier 1 drain progress, Tier 2 refresh cadence, fresh/stale/empty by institution class. Subsumes `/coverage` and parts of `/data-quality`.

Read-only views (`/index`, `/market`, `/peers`, `/districts`, `/national`, `/methodology`) stay as-is — they're the product surface, not the ops surface.

### 4.6 Governance as config, not code

Taxonomy (canonical keys, families, tiers), agent prompts, budgets, alarm thresholds, anomaly rules all live in one typed config source — generated to both Python and TS at build time via `scripts/codegen.sh` (pattern already exists for `agent-tool-types`). Kills the Python↔TS drift class of bug by making it impossible to land a change in one language without the other. A human changing governance means editing config + opening a PR, not touching production code.

### 4.7 Canonical identity + schema translator

One identity service maps every external ID — FDIC `cert_id`, NCUA `charter_number`, Federal Reserve `rssd_id`, ABA routing, OCC charter, CFPB ID — to a single primary `institution_id`. Merger/acquisition history preserved (old IDs keep resolving). Every entry adapter **must** go through the translator before writing — no adapter touches `institutions` directly with its native ID.

Schema translator sits alongside: one normalized entity shape (`name`, `address`, `asset_total_thousands`, `charter_type`, `regulator`, `fed_district`, etc.) with explicit per-source mapping rules. Call Report "thousands" scaling, NCUA state codes, FDIC field renames — handled once, in one place, with drift tests.

**Every downstream table FKs to `institution_id`, nothing else.** Eliminates the `UNCONFIRMED-*` prefix hack and the 12 ID-type mismatches in the Phase 62 test suite.

---

## 5. Transition path

Seven Phase B sub-specs, in dependency order. Each will get its own brainstorm → spec → plan → implementation cycle.

**Size legend** (rough sketch-level estimates; each sub-spec refines its own): **XS** = hours · **S** = 1–3 days · **M** = about one week · **L** = more than one week, typically two-to-four.

| # | Sub-spec | Primitive | Kills on completion | Rough size |
|---|---|---|---|---|
| **B1** | Canonical identity + schema translator | ⟨7⟩ | `UNCONFIRMED-*` hack, per-ingest ID logic, Phase 62 ID-type test failures | L |
| **B2** | Unified budget ledger + enforcement | ⟨4⟩ | Hamilton's isolated $50 breaker, Phase 62b budget stubs, scattered cost code | M |
| **B3** | Governance-as-config + codegen | ⟨6⟩ | Python↔TS taxonomy drift class, hand-edited duplicate constants | M |
| **B4** | Agent tool contract standardization | ⟨2⟩ | `agent_base` half-built state; routes 45 legacy CLIs for replacement | L |
| **B5** | One data path + Knox gate + anomaly queue | ⟨3⟩ | Direct writes to `extracted_fees`, ad-hoc review UX in `/admin/fees` | L |
| **B6** | Atlas orchestrator + priority queue | ⟨1⟩ | 5 Modal time-crons, `run_pipeline` command, silent-miss bug, `crawl_runs` leak | L |
| **B7** | Admin cockpit (4-panel) | ⟨5⟩ | Ops slice of 22 routes: `/pipeline`, `/agents`, `/darwin`, `/coverage`, `/quality`, `/data-quality`, `/ops` | M |

**Order rationale:**
- **B1 first** because every table FKs to `institution_id`. No other primitive can land cleanly while identity is fragmented.
- **B2 before B4** so the agent tool contract has cost enforcement built in, not bolted on after.
- **B3 before B4–B5** so the governance config source exists before agents start consuming it at scale.
- **B4 before B5** because the data path's Knox gate is an agent call — it needs the tool contract stable first.
- **B5 before B6** because Atlas orchestrates writes through the data path; if the data path doesn't exist, Atlas has nothing to route.
- **B6 before B7** because the cockpit's four panels are all observability surfaces over Atlas + budget + data path + identity. Ship the system, then the cockpit over it.

**Tactical cleanups** (not sub-specs — land inline during the B-series):
- Close 3 open todos from today: `daily_pipeline` catch-up, `crawl_runs` reaper, Phase 62 test suite (38 failures). These should be completed by the end of B2 at the latest so the B-series isn't blocked on red CI.

---

## 6. Out of scope for this audit

- Hamilton's internal research logic (separate subsystem; treated as a consumer of the unified data layer, not part of it).
- Consumer-facing product surfaces (`/`, marketing pages, SEO — unchanged).
- Billing, Stripe, access control (separate concerns).
- Specific table schemas, ORM choices, queue implementation — those are Phase B design decisions inside each sub-spec.

---

## 7. Next action

Invoke `writing-plans` skill to produce the execution plan for this audit. The execution plan's job is to turn Sections 2.2, 2.4, and 3 from "column contracts" into populated tables — the deep-dive analysis that makes the audit actionable. Once populated, each Phase B sub-spec can be spawned with a clear dependency graph and evidence trail.

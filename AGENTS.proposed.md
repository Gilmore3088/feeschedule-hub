# Fee Insight Agent Operating Guide

Fee Insight is the company and site. **Bank Fee Index** is the product — the dataset and index. **Hamilton** is the Pro workspace. Never name the site as the product; `scripts/ci-guards.sh brand-kill` enforces this.

This repository runs one agentic system for fee data acquisition, verification, publication, and analysis. Keep agent work tied to the TypeScript/Vercel runtime and the semantic Postgres tables. Do not reintroduce retired crawler workers, Modal paths, Supabase Edge Function product endpoints, or ad hoc scripts as runtime surfaces.

**Read this first.** The system exists to raise *report-viable coverage* — institutions holding enough published, source-verified fee data to generate a saleable Competitive Fee Position report. Work that does not raise that number or protect trust in what is already published is not the priority, however well built.

---

## 0. Vocabulary — read before writing any code

**"Tier" is already taken.** In this codebase tier means the *fee data promotion level*: tier 1 `raw_fee_observations` → tier 2 `verified_fee_observations` → tier 3 `published_fee_records`, promoted through `promote_to_tier2` and `promote_to_tier3`, which are Darwin-gated at the database level.

The escalation ladder described in this document is therefore called a **pass**, never a tier. Pass 1, pass 2, pass 3 describe how hard a lane is trying on a given institution. Using "tier" for escalation will collide with the promotion functions and corrupt reasoning about both.

| Term | Means |
|---|---|
| **Tier 1/2/3** | Fee data promotion level — raw, verified, published |
| **Pass 1/2/3** | Acquisition effort level — standard, targeted recovery, expensive |
| **Lane** | A state's work queue — one row in `agent_state_lanes` |
| **Cycle** | One quarterly sweep of a lane through passes 1 → 3 |

---

## 1. Objectives

**Primary metric — report-viable coverage.** Already defined in `Reports/studio/coverage.sql`: an institution is viable when it has at least 12 of the 15 featured `canonical_fee_key` values published in `published_fee_catalog`. That query is the scoreboard; it should move into the runtime as a view rather than living only in the studio folder.

Reported per state lane, per fed district, and in aggregate. Any change to discovery, extraction, or verification should be able to state its expected effect on this number.

**Secondary metrics.**

- Per-category published coverage across the 15 featured keys — the aggregate hides which categories systematically fail, and that is the actionable part
- Cost per newly viable institution, by pass
- Raw → verified promotion rate (Darwin's yield)
- Median published document age
- Review queue depth: `backlog_manual_review`, `backlog_ocr`

**Non-goals.**

- Breadth ahead of viability. An institution with four published fees is not a quarter of a report; it is zero reports.
- Running lanes on a cadence faster than fee schedules change.
- New Hamilton Pro surfaces while viable coverage is the binding constraint.

---

## 2. Current Runtime

- Next.js 16 / React 19 / TypeScript is the application and agent control plane.
- Agent runs start in `agent_runs`, advance through `agent_run_steps`, and write `agent_run_events`. The execution envelope is `src/lib/agents/run-store.ts`.
- The active worker contract is `EXECUTION_BACKEND=agentic_v1`.
- Scheduled advancement is `/api/admin/agents/tick`, scheduled every five minutes in `vercel.json`. Manual advancement is `/api/admin/agents/runs/[id]/execute`.
- State lanes are scheduled by `src/lib/agents/state-lane-scheduler.ts` against `agent_state_lanes`, with lease tokens and `next_run_after` gating.
- Per-institution acquisition memory lives in `institution_source_profiles` (`canonical_source_url`, `source_kind`, `read_strategy`, `consecutive_failures`), with change history in `institution_source_corrections`.
- Provider access flows through `src/lib/ai-provider.ts`; usage and failure metering is `src/lib/ai-provider-usage.ts`. Direct Anthropic imports are blocked by `provider-kill`.
- Postgres access is `src/lib/data-store`. Source documents archive to R2, referenced by `document_r2_key` on the fee tiers.
- `src/lib/automation-control.ts` is the global stop. When automation is stopped, agents may queue, inspect, or mark manual validation, but must not call provider automation.

**Execution rules.**

- No step may exceed 60 seconds of wall time. A step that cannot finish in that budget must decompose, or submit async work and return, leaving a later tick to collect the result.
- Every step must be independently re-runnable for a single institution without re-running prior steps.
- Every step claims its work under a lease. `agent_state_lanes.lease_token` / `lease_expires_at` already does this for lanes; institution-level claiming must follow the same pattern with `FOR UPDATE SKIP LOCKED`.
- Every step writes an outcome. Success advances; failure records a `failure_reason` from the closed vocabulary in section 4 and increments `consecutive_failures`. No silent failures, no rows left in flight without a lease expiry.
- Nothing is overwritten. A new schedule creates a new `source_documents` row; superseded rows stay. `published_fee_record_rollback_log` and `rolled_back_at` preserve publication history.
- Every agent action creates or updates a visible run, step, or event.

---

## 3. Lanes and Cycles

The lane is the unit of work. Agents have roles; lanes have scope, cadence, and a finish line.

**One pipeline, fifty scopes.** A state is not an agent. It is `agent_state_lanes.state_code` — a filter and a schedule, sharing one set of agents and one set of learned patterns. A discovery pattern learned in Ohio must pay off in Kentucky.

**Cadence.** Consumer fee schedules change roughly one to two times a year. `freshness_target_hours` should reflect that: a full acquisition cycle runs quarterly. Cheap change detection — comparing `last_content_hash` on a known `canonical_source_url` — may run far more often, because it costs almost nothing and catches movement between cycles. Do not conflate the two. Re-running full acquisition daily spends provider budget for no yield and, worse, means a lane never *finishes* — there is no completion event, no snapshot, and no way to say a state is done.

**Cycle lifecycle.**

1. Cycle opens at pass 1 with the lane's full institution set.
2. Pass 1 runs to exhaustion. Every institution ends published, terminal, or carrying a `failure_reason`.
3. Pass 2 opens enrolling **only** institutions carrying a pass-1 failure reason. Pass 2 is a router keyed on that reason (section 4) — not a generically harder retry.
4. Pass 3 opens enrolling only pass-2 failures, and additionally waits on spend release. It should touch a single-digit percentage of the lane.
5. Cycle closes when every institution is published, terminal, or deferred. Closing writes a coverage snapshot.

**Rules.**

- A cycle closes with a number. A cycle that cannot report viable coverage, cost, and unresolved count is not closed.
- Pass N+1 may not open until pass N is exhausted for that lane. This is what keeps expensive methods off easy problems.
- Atlas owns cycle lifecycle. Individual agents never open or close cycles.
- Cost ceilings are enforced per lane per pass through `ai_api_usage_events`, not by convention. Hitting the ceiling pauses the pass and raises an operator decision; it never silently continues.

**Terminal states are findings, not failures.** `NO_PUBLIC_SCHEDULE` — the institution genuinely does not publish a consumer fee schedule — removes it from the coverage denominator and is itself publishable intelligence.

---

## 4. Failure Vocabulary and Pass Routing

`institution_sources.failure_reason` exists and is written by Magellan discovery, Magellan fetch, and Rosetta read. It is currently assembled by string interpolation (`magellan_${result.outcome}`), which makes it unroutable. **Constrain it to a closed vocabulary and route pass 2 off it.**

Every value maps to exactly one recovery method, and the method comes from the `read_strategy` enum that already exists on `institution_source_profiles`.

| `failure_reason` | Pass 2 method | Pass 3 method |
|---|---|---|
| `no_website` | Regulator website field refresh | Manual research queue |
| `no_candidate_docs` | Deeper crawl + site search + `site:` query | Browser render, then outreach |
| `doc_ambiguous` | Larger model with more page context | Human selection queue |
| `pdf_no_text_layer` | `read_strategy = 'ocr'` | Vision model on page images |
| `js_rendered_only` | `read_strategy = 'browser_render'` | Hosted browser session |
| `behind_login` | Wayback / cached copy | Direct outreach to institution |
| `schedule_is_html_page` | `read_strategy = 'html_dom'` | Table-structure model |
| `schedule_stale` | Archive lookup for the current edition | Direct outreach |
| `extraction_empty` | Re-extract with revised prompt version | Larger model, full document |
| `fetch_blocked` | Backoff and retry with varied headers | Hosted browser session |
| `no_public_schedule` | *(terminal)* | *(terminal)* |

**Rules.**

- Adding a `failure_reason` value requires adding its routing in the same change. A reason with no method is a dead end that silently strands institutions.
- Track clearance rate per reason-to-method pair. A pass-2 method clearing under 30% of its routed reason is the wrong method — edit the table, not the prompt.
- `consecutive_failures` drives backoff within a pass; the pass number drives method selection. They are different signals and must not be conflated.

---

## 5. Agent Roster

Roles are stable across every cycle. The pass changes the *method* an agent uses, never its responsibility. Lane step keys are defined in `STATE_LANE_STEPS`.

### Atlas — orchestration

Steps: `enhance`

- Refreshes state source memory and lane health; syncs `institution_source_profiles` and lane backlog counters.
- Owns cycle lifecycle: open, advance pass, close, snapshot coverage.
- Enforces the pass gate — does not open pass N+1 until pass N is exhausted for the lane.
- Enforces cost ceilings per lane and per pass.
- Creates visible runs and makes automation posture visible before an action can spend provider money.
- Does not extract, classify, or publish fee data directly.

### Magellan — source discovery and fetching

Steps: `discover`, `fetch`, `public-discovery`

- Reads `institution_sources` and `institution_source_profiles`; writes `source_documents` and `source_collection_runs`.
- Selects its discovery method from the pass routing table, not from a fixed strategy. Prefers `canonical_source_url` when the profile holds one and its hash is unchanged.
- Archives every fetched document to R2 and records `document_r2_key`. A citation that depends on the institution's URL still resolving is not a citation.
- Records a `failure_reason` from the closed vocabulary on every miss. A miss without a routable reason is a bug — pass 2 has nothing to act on.
- Rotates batches with lease and backoff behavior; must not repeatedly select the same failed institutions within a pass.
- Must not call provider extraction directly. When automation is stopped, mark accepted sources queued or manual-validation-ready.

### Rosetta — source text normalization

Steps: `read`

- Reads `source_documents`, writes `agent_source_texts`.
- Deterministic HTML/text/PDF parsing first, following `institution_source_profiles.read_strategy`.
- Routes scanned or image-only PDFs to `needs_ocr` with `failure_reason = 'pdf_no_text_layer'` rather than pretending text is available. OCR is a pass-2 method, not a pass-1 fallback.
- Preserves page and character offsets so downstream lineage can point at an exact span.

### Knox — raw fee extraction

Steps: `extract`

- Reads `agent_source_texts`, writes `raw_fee_observations`.
- Extracts only source-grounded rows with lineage back to `source_document_id`, text, page, and span.
- Records model and prompt version on every row, so a prompt change is attributable and re-runnable without re-fetching.
- Sends ambiguous rows, policy conflicts, and outliers to review rather than publishing them.
- Prefers batch submission over per-document synchronous calls wherever latency permits. Batch versus synchronous is the difference between a viable and a non-viable national cost model.
- `extracted_fees` is a temporary staged review bridge for ready-review only. Never a product read.

### Darwin — verification, classification, and reconciliation

Steps: `classify`, `public-cluster`

- Reads `raw_fee_observations`; promotes through `promote_to_tier2` into `verified_fee_observations`. The database enforces that only Darwin may promote and that `canonical_fee_key` is present at tier 2.
- Checks canonical fee hints, amount reasonableness, duplicates, source lineage, and rejection policy; writes `outlier_flags`.
- **Reconciles across the institution's full evidence history, not one row in isolation.** When two passes or two cycles disagree, effective date and lineage quality decide, and the reasoning is recorded.
- Maps raw labels to `canonical_fee_key` through the label map first, calling a provider only for labels the map does not cover — and writing every decision back so the next occurrence is free. Hit rate should climb past 90% by the third cycle.
- Escalates genuinely novel labels to human review rather than guessing. The canonical key set is human-owned; that queue is the moat.
- Challenges suspicious rows rather than flooding review with every row.

### Hamilton — publication and analysis

Steps: `publish`, `public-diagnose`

- Promotes eligible verified rows through `promote_to_tier3` into `published_fee_records`; product, report, research, and analytics reads use `published_fee_catalog` only.
- Compares new live rows against prior live rows for the same institution and `canonical_fee_key`, emitting movement signals when amounts change.
- Separates verified from provisional evidence and excludes provisional rows from benchmark scoring unless explicitly labeled.
- Serves public, Pro, and internal surfaces through the shared request contract; selected-institution context comes from `src/lib/hamilton/institution-briefing.ts`.
- Full surface rules — request contract, Monitor signals, saved artifacts, workspace authority, route policy — live in `docs/HAMILTON.md`.

**Hamilton development gate.** New Pro surfaces should not be built while report-viable coverage is the binding constraint. Build the surface when there is data to put in it.

---

## 6. Oversight Model

Four gate types. Only one of them stops anything. Humans work a queue; they are never the reason work is waiting.

| Type | Behavior | Applies to |
|---|---|---|
| **Auto-pass** | Runs, publishes, notifies nobody | Known canonical key, document within window, amount in range, lineage complete |
| **Sampled audit** | Completes without waiting; a share lands in review afterward | 5% of published records, 100% of an institution's first publish, every row Darwin overrode on a conflict |
| **Blocking** | Cannot proceed unratified; batched so a person answers a list once | Pass 3 spend release, a new `canonical_fee_key` entering the taxonomy, first public publish for a new state |
| **Circuit breaker** | Trips automatically on threshold breach and raises an operator decision | `automation_control` global stop, lane cost ceiling, verified-yield floor, anomaly rate above baseline |

A failed audit does not just fix the row. It opens a defect against the step that produced it.

---

## 7. Data Boundaries

Current semantic tables and read models:

- Institutions and sources: `institution_sources`, `institution_source_profiles`, `institution_source_corrections`, `source_documents`, `source_collection_runs`, `agent_source_texts`
- Lanes: `agent_state_lanes`
- Fee tiers: `raw_fee_observations`, `verified_fee_observations`, `published_fee_records`, `published_fee_catalog`, `published_fee_record_rollback_log`
- Promotion functions: `promote_to_tier2`, `promote_to_tier3` — Darwin-gated, do not bypass
- Public intake: `community_fee_submissions`
- Institution authority: `institution_claims`, `institution_claim_events`, `institution_workspace_memberships`, `institution_workspace_invitations`
- Agent ledger: `agent_runs`, `agent_run_steps`, `agent_run_events`
- Provider safety: `automation_control`, `ai_api_usage_events`
- Hamilton Pro persistence: `hamilton_saved_analyses`, `hamilton_scenarios`, `hamilton_reports`, `hamilton_watchlists`, `hamilton_workspace_contexts`, `hamilton_signals`, `hamilton_priority_alerts`, `hamilton_refresh_jobs`, `hamilton_conversations`, `hamilton_messages`

**Proposed and not yet applied** — design intent only, added through the migration workflow, never assumed to exist:

- `agent_state_lanes.current_pass`, `pass_opened_at`, `cycle_period`
- `institution_source_profiles.pass_attempts`, `last_pass`
- `institution_sources.failure_reason` CHECK constraint against the section 4 vocabulary
- `fee_label_map` — raw label → `canonical_fee_key`, with decided_by and confidence
- `institution_evidence_events` — institution-keyed, append-only, cross-run
- `lane_coverage_snapshots` — viable count, per-category counts, cost, captured_at
- `provider_batch_jobs` — submit / poll / ingest for the Anthropic Batch API

Do not use retired runtime contracts: `fee_crawler`, `ops_jobs`, Modal worker IDs, `modal_call_id`, `spawnJob`, old crawler table aliases, or request-time DDL. Do not read `extracted_fees` for any product, report, research, market, peer, state, or analytics path.

---

## 8. Product Rules

- Public pages are evidence and report-card surfaces. Provisional evidence may show only when labeled with confidence and source context.
- Empty profiles create source-submission and validation paths, not fake confidence or generic AI answers.
- An institution that publishes no consumer fee schedule is a finding. Display it as one.
- Public claim CTAs route through login into Hamilton Settings with `instId`. Pro users submit authenticated claims into `institution_claims`; source evidence routes through structured source intake.
- Accepted claims create active `institution_workspace_memberships` before Account or Pro pages show workspace authority. Claim acceptance never publishes fee rows.
- Reports for thin evidence produce a diligence and readiness path, not a generic consulting brief.
- Account and Pro navigation reinforce Hamilton as the canonical workspace.

---

## 9. Verification Gates

Narrow tests for touched code; broad checks when the blast radius crosses routes or shared data:

- `npm run guard:legacy`
- `npm run test:agentic`
- `npx tsc --noEmit`
- `npm run lint`
- Focused route and browser checks for public institution, submit-source, admin quality, and Hamilton Pro flows

CI guards that must stay green: `brand-kill`, `provider-kill`, `source-read-model-kill`, `agent-source-contract-kill`, `fee-tier-contract-kill`.

Database work verifies against the current schema and adds migrations only through the project migration workflow. Never edit production-applied migrations in place.

**Additional gates for acquisition and verification work:**

- Report-viable coverage for the touched lane must not regress.
- Every new or changed step must be re-runnable in isolation for one institution.
- Every failure path must produce a `failure_reason` from the section 4 vocabulary, and adding a value requires adding its routing in the same change.
- Provider-calling changes state expected cost per institution and run against a ten-institution sample with hand-verification before lane-wide execution.

---

## 10. Next Work

In order. Each is independently shippable and none requires the next.

1. **Lane cadence.** `freshness_target_hours` currently defaults to 24. Move full acquisition to quarterly and split cheap hash-based change detection onto its own frequent schedule. Stops the spend leak and gives lanes a finish line.
2. **Constrain `failure_reason`** to the section 4 vocabulary, backfill existing interpolated values, and add the CHECK constraint.
3. **Add the pass counter** — `agent_state_lanes.current_pass`, `institution_source_profiles.pass_attempts` — and route `read_strategy` selection off it using the section 4 table.
4. **Promote `Reports/studio/coverage.sql` into a runtime view** and surface viable coverage per lane on `/admin/states`.

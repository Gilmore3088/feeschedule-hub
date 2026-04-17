# Phase 62b: Agent Foundation — Runtime Layer - Context

**Gathered:** 2026-04-16
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers the **framework code** that every v10.0 agent inherits — not the agents themselves. Specifically:

1. **`AgentBase`** (Python, subclass pattern) — 5-step loop (LOG / REVIEW / DISSECT / UNDERSTAND / IMPROVE) with automatic `agent_events` logging via the Phase 62a gateway, automatic `with_agent_context()` entry for parent/correlation propagation, and adversarial-gate plumbing on IMPROVE
2. **Inter-agent messaging runtime** — `agent_messages` schema finalized + populated semantics, per-recipient LISTEN/NOTIFY wiring, intent enum (`challenge|prove|accept|reject|escalate`), state machine transitions, escalation-to-digest rules
3. **Observability surface** — `lineage_graph()` SQL function, read-only `/admin/agents` console (Overview tiles + Lineage tree + Messages inbox + Replay view), `v_agent_reasoning_trace` view, five health metrics with sparklines
4. **Adversarial review gate (LOOP-07)** — canary-required + peer-challenge-optional pipeline wired into `AgentBase.improve()`; failed IMPROVE queues to James daily digest
5. **Testing harness** — `fee_crawler/testing/` with contract tests (custom fake Anthropic client), fixture replay, canary runner + schema, shadow-mode skeleton (`shadow_run_id` context + `shadow_outputs` table, full orchestration deferred to Atlas/Phase 65)
6. **Bootstrap protocol** — `agent_registry.lifecycle_state` column, named graduation SQL predicates per agent, `agent-graduate` CLI, exception-review policy (confidence<0.85 + random 5% sample), runbook at `.planning/runbooks/agent-bootstrap.md`

**Explicitly NOT in this phase:**
- Knox / Darwin / Atlas production agent code (Phases 63 / 64 / 65)
- The golden corpus content (BOOT-02 → Phase 63)
- Full shadow-mode orchestration (drift batch scheduling, automated reports) — deferred to Atlas/Phase 65
- RLS + dedicated Postgres agent role (SEC-04 → Phase 68)
- Hamilton refactor to read Tier 3 (Phase 66)
- TS AgentBase — Hamilton stays a pure TS tool-caller this phase; a TS review runner can be added later if needed

</domain>

<decisions>
## Implementation Decisions

### AgentBase framework (LOOP-01..07)

- **D-01:** **Python-only AgentBase.** The 5-step loop framework lives in Python. Knox / Darwin / Atlas / 51 state agents all subclass it; Hamilton stays a TS tool-caller. Rationale: Modal agents are autonomous + scheduled (loop model fits); Hamilton is request-response (different operating model). Hamilton's LOG is already free via Phase 62a's gateway; its observability and messaging participation are database-driven, not inheritance-driven. If Hamilton ever needs scheduled self-critique, add a narrow TS review runner then — do not generalize pre-emptively.
- **D-02:** **Subclass + override API.** `class KnoxAgent(AgentBase):` overrides `run_turn()`, `review()`, `dissect()`, `understand()`, `improve()`. Familiar Python pattern; clear inheritance hook for adversarial-gate plumbing in `improve()`.
- **D-03:** **AgentBase auto-enters `with_agent_context()` on every public method.** Developers never touch contextvars directly. Parent `event_id` / `correlation_id` auto-chains from the enclosing event. 62a's `fee_crawler/agent_tools/context.py` is the scope manager; AgentBase wraps it.
- **D-04:** **Lives at `fee_crawler/agent_base/`.** New package alongside `fee_crawler/agent_tools/` (tools are primitives, agent_base is runtime). Matches the naming convention 62a established.

### Loop cadence + scheduling (LOOP-03)

- **D-05:** **Modal cron per agent.** Each agent class declares `review_schedule = '*/15 * * * *'` (cron string). A Modal function per agent runs on that schedule and calls `agent.review()`. Stays inside the Modal idiom already used in `fee_crawler/modal_app.py`; no new scheduler. Atlas (Phase 65) can later override and centralize without breaking the contract.
- **D-06:** **Time-based REVIEW trigger (not event-count or hybrid).** Cron interval per agent — predictable, matches SC1's "unreviewed events discovered within 15 minutes" bar. Defaults: Knox every 15 min, Darwin every hour, state-agents every 4 hours, Hamilton n/a.

### Adversarial review gate (LOOP-07)

- **D-07:** **Canary-required + peer-challenge-optional.** Every IMPROVE runs the canary regression automatically (deterministic, CI-like bar — zero regression on coverage / confidence / extraction count). Peer-challenge fires when the IMPROVE is adjacent to another agent's domain (e.g., Darwin changes classification rule → Knox challenges). If the agent has no canary corpus yet, IMPROVE is gated (queued) until one exists. Canary is the floor; peer is the ceiling.
- **D-08:** **Failed IMPROVE queues to James daily digest.** Failed IMPROVE writes an `agent_events` row with `status='improve_rejected'`, the proposed change payload, and the gate's verdict; it lands in the same daily human-review digest used by COMMS-04 escalations. James decides: accept anyway (manual override), discard, or send back to iterate. No silent drops; no automatic N-retry loop.

### Inter-agent messaging (COMMS-01..05)

- **D-09:** **`agent_messages` schema — wide typed + JSONB payload.** Columns: `message_id uuid pk`, `created_at timestamptz`, `sender text`, `recipient text`, `intent enum(challenge|prove|accept|reject|escalate)`, `correlation_id uuid`, `parent_message_id uuid` (reply-to), `status enum(pending|delivered|acknowledged|resolved|rejected|escalated|timeout)`, `payload jsonb` (intent-specific shape: `challenge` → `{subject_event_id, question}`; `prove` → `{evidence_refs[]}`; `reject` → `{reason, counter_evidence_refs[]}`; `escalate` → `{digest_context}`). Indexed on `(recipient, status)`, `(correlation_id)`, `(parent_message_id)`. Matches the agent_events pattern from 62a.
- **D-10:** **Per-recipient LISTEN/NOTIFY channels.** One channel per agent name: `agent_msg_knox`, `agent_msg_darwin`, `agent_msg_atlas`, `agent_msg_state_<abbr>`, etc. Each agent LISTENs on its own channel; sender NOTIFYs the recipient's channel with the new `message_id`. No fanout; scales cleanly to 50+ state agents without noisy wakeups.
- **D-11:** **Two-dimensional escalation threshold (COMMS-04).** Escalate a correlation_id to the daily digest when EITHER 3 unresolved rounds have passed (challenge → prove → reject → prove → reject → prove → reject without reaching `resolved`) OR the original challenge is older than 24 hours without a terminal status. Round-count catches fast-looping adversarial threads; time catches silent-stall threads.
- **D-12:** **COMMS-05 reasoning trace via SQL view + Hamilton tool.** Create `v_agent_reasoning_trace(correlation_id)` view that joins `agent_events` and `agent_messages` into a flat ordered timeline per correlation. Expose a read-only agent tool `get_reasoning_trace(correlation_id)` that queries the view. Fits the MCP read-only pattern from 62a (D-07). No new tables.

### Observability surface (OBS-01..05)

- **D-13:** **Fused `/admin/agents` console with tabs.** Single top-level admin page, four tabs: Overview (health metrics), Lineage (search by published-fee id → full chain), Messages (agent_messages queue + active handshakes), Replay (trace by reasoning hash). Single nav entry; agent-native concerns in one place; easier cross-linking than split routes. Adds `/admin/agents` to the `AdminNav` component.
- **D-14:** **Hierarchical tree view for lineage (OBS-03).** Tier 3 row at root; expand → Tier 2 verification event + row; expand → Tier 1 extraction event + row + R2 document link. Click-to-expand inherently hits the 3-click bar. Uses existing Radix primitives and `admin-card` styling; no new visualization dep.
- **D-15:** **All 5 health metrics with tiles + sparklines (OBS-05).** Overview tab shows a tile per metric per agent: loop-completion rate, review latency, pattern promotion rate, confidence drift, cost-to-value ratio. Each tile carries a 7-day sparkline (reuse `src/components/sparkline.tsx`) and drills down to raw `agent_events` rows. Matches the Bloomberg-density admin aesthetic.
- **D-16:** **Read-only trace view for replay (OBS-04).** Paste or click-through to a reasoning hash → render input payload, tool-call sequence, outputs, and final decision as a timeline. No re-execute button. Answers "what did Darwin do at 14:32?" without the cost or side-effect risk of a live LLM replay.
- **D-17:** **`lineage_graph(tier3_row_id)` SQL function returns a JSON tree.** Walks `lineage_ref` (Tier 3 → Tier 2), then `parent_event_id` on events (Tier 2 verification → Tier 1 extraction → crawl event → R2 document). One SQL query from any admin page. Meets OBS-01 and OBS-02 acceptance directly.

### Testing harness (BOOT-03)

- **D-18:** **All four layers ship in 62b — shadow with minimal infra.** Contract tests + fixture replay + canary runner land as working code. Shadow mode lands as a skeleton: `shadow_run()` wrapper + `is_shadow` flag on `agent_events` + `shadow_outputs` table. Full shadow orchestration (batch scheduling, drift reports) is Phase 65's Atlas work.
- **D-19:** **Contract tests use a custom `FakeAnthropicClient`.** Lives in `fee_crawler/testing/fake_anthropic.py`. Returns scripted responses and records tool calls. Injected via the existing Anthropic client wrapper. Zero external dep; matches pytest style already in the codebase. No VCR cassettes.
- **D-20:** **Canary runner + schema land in 62b; the corpus itself lands in Phase 63.** `fee_crawler/testing/canary_runner.py` loads a corpus JSON, runs the target agent against each institution, diffs coverage / confidence / extraction count against a baseline with per-metric tolerance, writes a report row to `canary_runs` table. Pydantic schema for corpus fixtures defined here. Phase 63 populates `fee_crawler/fixtures/golden_corpus/` with 100+ institutions (BOOT-02).
- **D-21:** **Shadow mode gates writes at the tool gateway.** When an agent runs with `shadow_run_id` set on its context, the Phase 62a gateway checks the flag: `agent_events` rows still write (with `is_shadow=true`); business-table writes (`fees_raw`, `fees_verified`, etc.) are suppressed and instead write to `shadow_outputs(shadow_run_id, agent_name, entity, payload_diff)`. Diff report compares `shadow_outputs` to what the live path produced for the same inputs. No duplicate business-table rows; clean isolation.

### Bootstrap protocol (BOOT-01, BOOT-03)

- **D-22:** **`agent_registry.lifecycle_state` column + code gate.** Enum: `q1_validation | q2_high_confidence | q3_autonomy | paused`. AgentBase reads this on turn start and changes behavior: Q1 holds every output for human approval via digest, Q2 auto-commits high-confidence outputs + queues exception subset for review, Q3 auto-commits all with quarterly random sampling. Graduation is a CLI command: `python -m fee_crawler agent-graduate <name> --to q2` which checks a named predicate and only flips state if the predicate passes.
- **D-23:** **Named SQL predicate per agent for graduation.** Each agent declares its own `graduation_q1_to_q2` and `graduation_q2_to_q3` SQL predicates. Example (Knox, Q1→Q2): `SELECT (100 * SUM(CASE WHEN human_verdict='accept' THEN 1 ELSE 0 END) / COUNT(*)) > 95 FROM agent_events WHERE agent_name='knox' AND action='extract' AND created_at > now() - interval '30 days'`. Executable; per-agent flexibility; visible in code review. `agent-graduate` runs the predicate and blocks the transition if it returns false.
- **D-24:** **Q2 exception-review policy: confidence<0.85 threshold + random 5% sample.** Auto-commit outputs with the agent's own `confidence >= 0.85` (same bar already used by 62a's auto-stage threshold). Everything below 0.85 plus a random 5% sample of the auto-committed rows lands in James's daily digest. Deterministic, auditable, reuses an already-tuned threshold, and the 5% sample guards against overconfident-but-wrong outputs.
- **D-25:** **Runbook at `.planning/runbooks/agent-bootstrap.md`.** New `.planning/runbooks/` folder for ops runbooks. Explains Q1/Q2/Q3 semantics, graduation predicates, rollback (pause → q1), exception-review SLAs (James reviews digest within 48h), failure modes (predicate regression triggers auto-pause). Version-controlled; discoverable; referenceable from code (error messages can link to specific sections).

### Claude's Discretion

- **Exact cron strings per agent** — defaults above (Knox 15m, Darwin 1h, state-agents 4h) are Claude's call during planning unless you want them locked now.
- **`lineage_graph()` exact return shape** — JSON tree with nested `{tier_level, row, event, children[]}` is the default; planner can tune field names.
- **Graduation predicates per agent** — the Knox example above is illustrative; Darwin / Atlas predicates get drafted during 63/64/65 phase planning, enforced by the framework from day one.
- **Health-metric computation windows** — 7-day sparklines implied by D-15; rollup cadence (15-min bucket? hourly?) is planner's call.
- **`canary_runs` table shape** — at minimum `{run_id, agent_name, corpus_version, started_at, finished_at, status, coverage_delta, confidence_delta, extraction_count_delta, verdict}`; additional columns at planner's discretion.
- **Fake LLM response DSL** — whether scripted responses are Python objects, YAML fixtures, or a fluent builder API — Claude's call.
- **Exception-digest format** — daily markdown vs. JSONL vs. Postgres-backed admin inbox — planner picks; must be readable in under 20 minutes per day.

### Folded Todos

None. No pending todos in the cross-reference check are relevant to this framework phase (the four UI-area todos carried forward from 62a still belong in UI polish phases).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents (researcher, planner, executor) MUST read these before planning or implementing.**

### Phase scope + audit source
- `.planning/audits/2026-04-16-pipeline-audit/SYNTHESIS.md` — 80.4% lineage loss driving OBS-01/02 requirements; no feedback loops driving LOOP-03/07
- `.planning/audits/2026-04-16-pipeline-audit/AGENT-NATIVE-SYNTHESIS.md` — Action Parity 23%, Context Injection 42% — the scores this phase (together with 62a) unblocks
- `.planning/audits/2026-04-16-pipeline-audit/03-data-integrity.md` — lineage population patterns; informs `lineage_graph()` design

### Requirements + contract
- `.planning/REQUIREMENTS.md` §LOOP-01..07 — 5-step loop acceptance bars
- `.planning/REQUIREMENTS.md` §COMMS-01..05 — messaging acceptance bars
- `.planning/REQUIREMENTS.md` §OBS-01..05 — observability acceptance bars
- `.planning/REQUIREMENTS.md` §BOOT-01, BOOT-03 — bootstrap protocol + testing pattern
- `.planning/PROJECT.md` — v10.0 key decisions table; agent-team naming lock

### Phase 62a handoff (this phase builds directly on)
- `.planning/phases/62A-agent-foundation-data-layer/62A-CONTEXT.md` — 62a decisions, especially D-07 (three-layer tool architecture), D-09 (agent_events schema), D-11 (causality via parent_event_id + correlation_id)
- `.planning/phases/62A-agent-foundation-data-layer/62A-VERIFICATION.md` — what was actually shipped vs. spec

### Existing code surface (read during planning)
- `fee_crawler/agent_tools/gateway.py` — auto-LOG mechanics already in place; AgentBase wraps, does not replace
- `fee_crawler/agent_tools/context.py` — contextvar manager that AgentBase auto-enters (D-03)
- `fee_crawler/agent_tools/registry.py` — tool registry; framework's `list_tools(agent_name)` reads from it
- `fee_crawler/agent_tools/budget.py` — per-agent quota; AgentBase.run_turn() respects halts
- `fee_crawler/modal_app.py` — where cron schedules register (D-05)
- `supabase/migrations/` — new migrations this phase: `agent_messages` finalization, `shadow_outputs`, `canary_runs`, `agent_registry.lifecycle_state`, `v_agent_reasoning_trace`, `lineage_graph()`
- `src/components/sparkline.tsx` — reused for health-metric tiles (D-15)
- `src/components/breadcrumbs.tsx`, `src/app/admin/layout.tsx`, `AdminNav` — /admin/agents integrates here

### Project memory (auto-memory)
- `.planning/memory/project_agent_team.md` — locked team composition; authoritative agent_name enum source
- `.planning/memory/project_kill_sqlite.md` — Postgres-only constraint continues from 62a

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Phase 62a agent_tools gateway** — already auto-writes `agent_events` rows with `parent_event_id`/`correlation_id`/`reasoning_hash`. AgentBase's LOG (LOOP-02) is already mechanically satisfied at the tool boundary — AgentBase only needs to manage context scope and expose REVIEW/DISSECT/UNDERSTAND/IMPROVE hooks.
- **`with_agent_context()` contextvar manager (`fee_crawler/agent_tools/context.py`)** — the canonical scope manager. AgentBase auto-enters it on every public method (D-03); developers never touch it.
- **Per-agent budget halt (`fee_crawler/agent_tools/budget.py`)** — already writes `budget_halt` events. AgentBase.run_turn() checks halt status on entry and aborts cleanly, so LOOP mechanics respect budgets without extra code.
- **`fee_crawler/modal_app.py` cron idiom** — existing pattern for scheduled Modal functions; per-agent REVIEW cron functions register here (D-05).
- **Admin design system (`.admin-card`, `geist` typography, tabular-nums)** — `/admin/agents` console inherits directly; no new design work.
- **`src/components/sparkline.tsx`** — reused for OBS-05 health tiles (D-15).
- **Radix UI primitives already in use (collapsibles, tabs)** — power the tree-view lineage (D-14) and the /admin/agents tab layout (D-13).
- **`pytest` + `vitest` harnesses** — testing pattern (D-18..D-21) extends pytest's conftest.py; TS tests via vitest are out of scope since Hamilton doesn't subclass AgentBase.

### Established Patterns
- **Postgres-backed queues with LISTEN/NOTIFY** — standard Postgres pattern; no new infrastructure. Per-recipient channels (D-10) follow the same idiom used elsewhere.
- **Dynamic WHERE builders (`src/lib/crawler-db/*.ts`)** — `/admin/agents` tabs (health tiles, lineage search, message inbox) reuse the same filter pattern for time ranges and agent-name filters.
- **Transactional write-triple (target row + agent_events + agent_auth_log in one transaction)** — 62a's `fee-actions.ts` pattern. Shadow-mode write gating (D-21) plugs into the same transaction: target row is routed to `shadow_outputs` instead; `agent_events` + `agent_auth_log` still write.
- **Pydantic schemas for tool inputs/outputs** — reused for canary-corpus fixture schema (D-20) and agent_messages payload intents (D-09).

### Integration Points
- **`fee_crawler/agent_tools/gateway.py`** — add `is_shadow` branch (D-21); otherwise unchanged.
- **`fee_crawler/modal_app.py`** — register per-agent REVIEW cron functions (D-05).
- **`src/app/admin/` tree** — new `/admin/agents` route with 4 tabs; `AdminNav` gets a new nav entry.
- **`supabase/migrations/`** — 5-6 new migrations (agent_messages finalization, lifecycle_state enum, shadow_outputs, canary_runs, lineage_graph function, v_agent_reasoning_trace view).
- **`fee_crawler/testing/`** — new package for the testing harness (fake LLM client, canary runner, shadow helper, contract-test base class).
- **`.planning/runbooks/` (new folder)** — home for the bootstrap runbook (D-25) and future ops runbooks.
- **`agent_events.status` enum** — add new terminal values: `improve_rejected` (D-08), `shadow_diff` (D-21).

</code_context>

<specifics>
## Specific Ideas

- **"Python-only for the framework" is the leverage call.** Three Python agents + 51 state agents vs. one TS caller (Hamilton) means the 5-step contract pays for itself in Python. The TS side already gets LOG via the gateway; it participates in observability and messaging via the database. We do not pre-generalize for a Hamilton-subclasses-AgentBase future that may never come.
- **Canary is the floor, peer is the ceiling (LOOP-07).** Every IMPROVE runs the deterministic canary regression unconditionally; peer challenges fire only when the change touches another agent's domain. If an agent has no canary corpus yet, IMPROVE is gated — prevents self-modification without a testable baseline.
- **James's digest is the single human-review surface.** Failed IMPROVE (D-08), escalated message threads (D-11), and Q2 exception-review samples (D-24) all land in the same daily digest. No multiple channels, no real-time pager. 48-hour SLA for review (codified in the runbook).
- **The `/admin/agents` console is not a dashboard — it's a debug tool.** Every pixel is in service of answering "why did this agent do this?" Overview tiles reveal drift; Lineage answers "where did this number come from?"; Messages reveals "what argument are these agents having?"; Replay reveals "reproduce exactly what happened at 14:32." Ordering matches how incidents are actually investigated.
- **Shadow mode is intentionally minimal in 62b.** The skeleton is there so Phase 64 (Darwin) and Phase 65 (Atlas) can run parallel-implementation experiments without rewriting infrastructure. Full orchestration (scheduled shadow batches, automated drift reports, promotion of shadow → live) is Atlas's job in Phase 65.
- **Lifecycle state is enforced at turn start, not at write time.** AgentBase reads `agent_registry.lifecycle_state` on `run_turn()` entry and picks the Q1/Q2/Q3 behavior branch. Means you can pause any agent mid-flight by updating a single column — rollback is one SQL statement, not a code deploy.

</specifics>

<deferred>
## Deferred Ideas

- **TS AgentBase for Hamilton** — Hamilton stays a pure TS tool-caller this phase. If scheduled post-report self-critique ever becomes a need, add a narrow TS review runner or route through a Python companion. Do not generalize the framework pre-emptively.
- **Full shadow-mode orchestration** — scheduled shadow batches, drift-report generation, shadow-to-live promotion gates — all Atlas's job in Phase 65. This phase ships only the write-gating skeleton.
- **Centralized REVIEW scheduler** — Atlas (Phase 65) may later centralize what 62b ships as per-agent Modal cron (D-05). Framework is written to allow that override without breaking existing agents.
- **Cross-agent handshake replay** — replaying an entire correlation_id's worth of messages (not just a single reasoning_hash turn) is a future debug-UI enhancement. This phase ships the view (D-12) but not the interactive replay.
- **Policy-per-agent for Q2 exception review** — D-24 picks a universal threshold (0.85) + random 5%. If per-agent tuning becomes necessary, the framework can later accept a policy object without breaking existing graduation predicates.
- **VCR-style cassette recording for contract tests** — rejected in favor of a custom fake client (D-19). If LLM response realism ever becomes a test gap, cassettes can be added as a parallel mode.
- **`pg_partman` for agent_messages** — inherits 62a's "homemade cron partitioning" stance. Upgrade later if partition management becomes painful.
- **MCP write surface for agent messaging** — agent_messages remains Python + TS internal this phase; no external MCP write exposure. Consistent with 62a's read-only MCP posture.
- **Franklin (5th adversarial agent)** — still deferred to v11.0 per PROJECT.md. Adversarial gate contract (D-07) is written agent-agnostic so Franklin can plug in later.
- **Reviewed Todos (not folded):** None surfaced in cross-reference; UI-area todos carried forward from 62a still belong in UI polish phases.

</deferred>

---

*Phase: 62B-agent-foundation-runtime-layer*
*Context gathered: 2026-04-16*

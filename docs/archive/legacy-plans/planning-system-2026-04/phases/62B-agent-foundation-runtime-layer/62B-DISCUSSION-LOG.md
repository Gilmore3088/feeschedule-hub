# Phase 62b: Agent Foundation — Runtime Layer - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `62B-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-04-16
**Phase:** 62B — agent-foundation-runtime-layer
**Areas discussed:** AgentBase language surface, Loop cadence + adversarial gate, Observability UI shape, Testing harness breadth, Inter-agent messaging, Bootstrap protocol

---

## AgentBase language surface

### Q1: Does Hamilton (Next.js/TS) subclass AgentBase, or Python-only?

| Option | Description | Selected |
|--------|-------------|----------|
| Python-only framework (Recommended) | AgentBase in Python only; Hamilton stays TS tool-caller; LOG free via gateway | |
| Python + TS AgentBase (codegened) | Same contract in both via codegen; Hamilton subclasses TS version | |
| Python + hand-written TS twin | Two parallel implementations maintained by hand | |

**User's first response:** "why do you recommend python only" — asked for justification before committing.
**Re-asked after explaining reasoning (Modal vs. Next.js operating models, LOG-already-free via gateway, Hamilton's "review" is a different beast, 3+51 Python agents vs. 1 TS caller leverage, cross-cutting concerns work cross-language anyway).**

**User's choice (re-ask):** Python-only (Recommended).

### Q2: Python AgentBase API shape?

| Option | Description | Selected |
|--------|-------------|----------|
| Subclass + override (Recommended) | `class KnoxAgent(AgentBase):` overrides run_turn/review/dissect/understand/improve | ✓ |
| AgentRunner composition | Functional: `runner = AgentRunner(name=..., logic=..., review_fn=...)` | |
| Protocol + mixins | Declare AgentProtocol with LoggingMixin, ReviewMixin, etc. | |

**User's choice:** Subclass + override.

### Q3: `parent_event_id` / `correlation_id` propagation?

| Option | Description | Selected |
|--------|-------------|----------|
| AgentBase auto-enters context on entry (Recommended) | Every public method auto-wraps `with_agent_context()`; devs never touch contextvars | ✓ |
| Explicit with_agent_context at turn start | Agent code manually enters at top of run_turn() | |
| Decorator on agent methods | `@agent_turn` decorator | |

**User's choice:** AgentBase auto-enters context on entry.

### Q4: Package location?

| Option | Description | Selected |
|--------|-------------|----------|
| fee_crawler/agent_base/ (Recommended) | New package alongside agent_tools/ | ✓ |
| fee_crawler/agent_tools/base.py | Inside existing agent_tools package | |
| fee_crawler/framework/ | New top-level framework package | |

**User's choice:** fee_crawler/agent_base/.

---

## Loop cadence + adversarial gate

### Q1: Who owns the REVIEW/DISSECT/UNDERSTAND scheduler?

| Option | Description | Selected |
|--------|-------------|----------|
| Modal cron per agent (Recommended) | Each agent declares `review_schedule` cron string; Modal function per agent | ✓ |
| AgentBase internal timer | Background task inside each Modal function | |
| Atlas owns all scheduling (defer to 65) | 62b ships only `agent.review()`, not the scheduler | |

**User's choice:** Modal cron per agent.

### Q2: REVIEW trigger?

| Option | Description | Selected |
|--------|-------------|----------|
| Time-based only (Recommended) | Cron interval per agent | ✓ |
| Event-count threshold | Fire after every N events | |
| Hybrid | Cron floor OR N events, whichever first | |

**User's choice:** Time-based only.

### Q3: LOOP-07 adversarial gate — which path required, which optional?

| Option | Description | Selected |
|--------|-------------|----------|
| Canary-required + peer-challenge-optional (Recommended) | Canary regression every IMPROVE; peer challenge fires when domain-adjacent | ✓ |
| Agent declares its gate in metadata | Each agent sets `adversarial_gate = 'canary'|'peer'|'both'` | |
| Both always required | Every IMPROVE passes canary AND peer | |

**User's choice:** Canary-required + peer-challenge-optional.

### Q4: When IMPROVE fails the gate?

| Option | Description | Selected |
|--------|-------------|----------|
| Queue to James daily digest (Recommended) | `status='improve_rejected'` event + same COMMS-04 digest channel | ✓ |
| Auto-iterate up to N retries | N attempts before escalation | |
| Drop silently + log | Log rejection, agent proceeds with old rule | |

**User's choice:** Queue to James daily digest.

---

## Observability UI shape

### Q1: Admin surface organization?

| Option | Description | Selected |
|--------|-------------|----------|
| Fused /admin/agents console (Recommended) | One page, 4 tabs: Overview / Lineage / Messages / Replay | ✓ |
| Split routes | /admin/debug/lineage, /admin/agents, /admin/agents/messages, /admin/agents/replay | |
| Extend /admin/pipeline | Add sections to existing pipeline page | |

**User's choice:** Fused /admin/agents console.

### Q2: Lineage visualization?

| Option | Description | Selected |
|--------|-------------|----------|
| Hierarchical tree view (Recommended) | Tier 3 → Tier 2 → Tier 1 via click-expand; uses Radix primitives | ✓ |
| Graph visualization (ReactFlow) | Interactive node/edge DAG; prettier; adds dep | |
| Timeline waterfall | Flat vertical list with timestamps | |

**User's choice:** Hierarchical tree view.

### Q3: Health metrics dashboard scope?

| Option | Description | Selected |
|--------|-------------|----------|
| All 5 metrics, tiles + sparklines (Recommended) | Per-agent per-metric tile with 7-day sparkline + drill-down | ✓ |
| Tiles only, no charts this phase | Current-value tiles; defer sparklines | |
| JSON endpoints + tiles, full dashboard in Phase 67 | `/api/admin/agents/metrics` + sanity-check table | |

**User's choice:** All 5 metrics, tiles + sparklines.

### Q4: Replay surface (OBS-04)?

| Option | Description | Selected |
|--------|-------------|----------|
| Read-only trace view (Recommended) | Paste hash → render input/tool-calls/outputs as timeline; no re-execute | ✓ |
| Interactive replay (re-execute) | Click replay → re-run tool sequence on current DB + show diff | |
| CLI only, no UI | `python -m fee_crawler replay <hash>` only | |

**User's choice:** Read-only trace view.

---

## Testing harness breadth

### Q1: Which of the four testing layers ship in 62b?

| Option | Description | Selected |
|--------|-------------|----------|
| All four, shadow with minimal infra (Recommended) | Contract + replay + canary fully; shadow as skeleton (flag + shadow_outputs table) | ✓ |
| All four, full shadow mode this phase | Full shadow orchestration + drift reports | |
| Three layers, defer shadow entirely to Phase 65 | Contract + replay + canary only | |

**User's choice:** All four, shadow with minimal infra.

### Q2: Contract-test LLM mocking?

| Option | Description | Selected |
|--------|-------------|----------|
| Custom fake Anthropic client (Recommended) | `fee_crawler/testing/fake_anthropic.py` with scripted responses + tool-call recording | ✓ |
| VCR/cassette-style recording | Record real responses; replay from `.yaml` cassettes | |
| Anthropic's own test fixtures | Use whatever SDK ships (verify existence) | |

**User's choice:** Custom fake Anthropic client.

### Q3: Canary corpus location — what ships in 62b vs. 63?

| Option | Description | Selected |
|--------|-------------|----------|
| 62b ships runner + schema; 63 ships corpus (Recommended) | Runner + Pydantic schema in 62b; 100+ institutions in Phase 63 (BOOT-02) | ✓ |
| 62b ships 5-institution seed corpus | Runner + tiny seed for self-test; full corpus in 63 | |
| 62b defines interface only; corpus + runner both in 63 | Schema only in 62b | |

**User's choice:** 62b ships runner + schema; 63 ships corpus.

### Q4: Shadow-mode write gating?

| Option | Description | Selected |
|--------|-------------|----------|
| shadow_events flag + tool gateway gate (Recommended) | `shadow_run_id` on context; agent_events still write with `is_shadow=true`; business writes route to `shadow_outputs` | ✓ |
| Separate shadow schema | Run shadow against `shadow_<agent>` schema with copies of business tables | |
| Event-log-only shadow | Only agent_events with `is_shadow=true`; no business-output capture | |

**User's choice:** shadow_events flag + tool gateway gate.

---

## Inter-agent messaging (COMMS-01..05)

### Q1: `agent_messages` row shape?

| Option | Description | Selected |
|--------|-------------|----------|
| Wide typed + JSONB payload (Recommended) | Typed columns for sender/recipient/intent/correlation_id/status + jsonb payload | ✓ |
| Narrow required + large payload | Only sender/recipient/correlation_id/status + full payload jsonb | |
| Separate tables per intent | `agent_challenges`, `agent_proofs`, `agent_escalations` | |

**User's choice:** Wide typed + JSONB payload.

### Q2: LISTEN/NOTIFY channel organization?

| Option | Description | Selected |
|--------|-------------|----------|
| Per-recipient channel (Recommended) | `agent_msg_knox`, `agent_msg_darwin`, etc. | ✓ |
| Single global channel + recipient filter | Everyone listens; each filters `recipient=me` | |
| Per-intent channel | `agent_challenge`, `agent_prove`, etc. | |

**User's choice:** Per-recipient channel.

### Q3: Escalation threshold (COMMS-04)?

| Option | Description | Selected |
|--------|-------------|----------|
| 3 unresolved rounds OR 24h age (Recommended) | Two-dimensional: round count OR time | ✓ |
| 3 rounds only | Count-based only | |
| 24h age only | Time-based only | |

**User's choice:** 3 unresolved rounds OR 24h age.

### Q4: COMMS-05 reasoning-trace surface?

| Option | Description | Selected |
|--------|-------------|----------|
| SQL view + Hamilton tool (Recommended) | `v_agent_reasoning_trace(correlation_id)` joins events + messages; Hamilton tool queries it | ✓ |
| Dedicated reasoning_traces table | Materialize per correlation_id | |
| On-demand graph walker function | Postgres function walks parent_event_id/parent_message_id | |

**User's choice:** SQL view + Hamilton tool.

---

## Bootstrap protocol (BOOT-01)

### Q1: Q1 → Q2 → Q3 encoding?

| Option | Description | Selected |
|--------|-------------|----------|
| lifecycle_state column + code gate (Recommended) | `agent_registry.lifecycle_state` enum; AgentBase reads on turn start; `agent-graduate` CLI checks predicate | ✓ |
| Markdown runbook + manual flag in config | Runbook + config.yaml flag; no DB state | |
| Runbook only, behavior baked in code | No runtime state; graduation = code change | |

**User's choice:** lifecycle_state column + code gate.

### Q2: Q1 → Q2 graduation bar format?

| Option | Description | Selected |
|--------|-------------|----------|
| Named SQL predicate per agent (Recommended) | Each agent declares `graduation_q1_to_q2` SQL; `agent-graduate` runs it | ✓ |
| Shared metric thresholds | Universal ">=95% accept rate on 200+ samples" | |
| Narrative checklist, manual | Runbook checklist; no code enforcement | |

**User's choice:** Named SQL predicate per agent.

### Q3: Q2 exception-review policy?

| Option | Description | Selected |
|--------|-------------|----------|
| Confidence threshold + random 5% sample (Recommended) | Auto-commit if confidence >= 0.85; review below-threshold plus random 5% of auto | ✓ |
| Confidence threshold only | Review only below-threshold | |
| Policy per agent | Each agent declares its own threshold + sample rate | |

**User's choice:** Confidence threshold + random 5% sample.

### Q4: Runbook location?

| Option | Description | Selected |
|--------|-------------|----------|
| .planning/runbooks/agent-bootstrap.md (Recommended) | New ops-runbooks folder in planning tree | ✓ |
| docs/agents/bootstrap.md | Public-facing docs tree | |
| Inline in PROJECT.md or REQUIREMENTS.md | Embed in existing planning doc | |

**User's choice:** .planning/runbooks/agent-bootstrap.md.

---

## Claude's Discretion

- Exact cron strings per agent (Knox 15m / Darwin 1h / state-agents 4h defaults)
- `lineage_graph()` exact JSON return shape
- Graduation predicates for Darwin / Atlas (drafted in 63/64/65 planning)
- Health-metric computation windows and rollup cadence
- `canary_runs` table column shape beyond the required core
- Fake LLM response DSL (Python objects vs. YAML vs. builder API)
- Exception-digest format (daily markdown vs. JSONL vs. Postgres admin inbox)

## Deferred Ideas

- TS AgentBase for Hamilton (Python-only this phase)
- Full shadow-mode orchestration (→ Phase 65 / Atlas)
- Centralized REVIEW scheduler (→ Phase 65 / Atlas override of D-05)
- Cross-agent handshake replay (interactive)
- Policy-per-agent for Q2 exception review (universal default for now)
- VCR cassettes for contract tests (custom fake client instead)
- `pg_partman` for agent_messages
- MCP write surface for agent messaging (read-only only this phase)
- Franklin (v11.0+)

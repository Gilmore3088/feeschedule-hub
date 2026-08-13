# Requirements: Bank Fee Index v10.0 Pipeline Integrity and Agent Team Foundation

**Defined:** 2026-04-16
**Core Value:** Transform the current collection of disconnected stages into a hierarchical agent team (Hamilton coordinating Knox, Darwin, Atlas, plus 51 state agents under Knox) operating under a 5-step self-improvement loop, with source lineage restored and a three-tier data architecture that Hamilton consumes.

## Source context

Based on two audits completed 2026-04-16:
- `.planning/audits/2026-04-16-pipeline-audit/SYNTHESIS.md` — pipeline/Hamilton map (80.4% lineage loss, ~5-10% miscategorization, wave orchestrator unscheduled, no feedback loops)
- `.planning/audits/2026-04-16-pipeline-audit/AGENT-NATIVE-SYNTHESIS.md` — agent-native architecture review (~55% overall; CRUD 4%, Action Parity 23%, Context Injection 42% blocking)

## v10.0 Requirements

### Agent Foundation — Data Layer (AGENT)

- [ ] **AGENT-01**: An `agent_events` Postgres table exists, writable by all agents; schema includes event_id, timestamp, agent_name, action, input_payload, output_payload, source_refs, confidence, cost_cents, parent_event_id
- [ ] **AGENT-02**: Every agent action writes exactly one row to `agent_events` before side effects land
- [ ] **AGENT-03**: The `agent_events` table is partitioned or retention-policied from day one — queries by agent + recent time window stay under 1 second at 10M rows
- [ ] **AGENT-04**: An `agent_auth_log` table records every agent-triggered write to user-facing tables (who called it, tool, entity, before value, after value, reasoning hash)
- [ ] **AGENT-05**: Agents have scoped write-CRUD tool access for every user-manipulable entity — extracted_fees, crawl_targets, fee_reviews, hamilton_watchlists, hamilton_saved_analyses, hamilton_scenarios, hamilton_reports, saved_peer_sets, plus 17+ more — all with identity audit

### Three-Tier Data Architecture (TIER)

- [ ] **TIER-01**: Tier 1 (Raw) tables exist — `fees_raw`, `crawl_events_raw`, `document_snapshots` — Knox's state agents write here with source_url, document_path, extraction_confidence, agent_event_id lineage; never rewritten, never deleted
- [ ] **TIER-02**: Tier 2 (Business) tables exist — `fees_verified`, `institution_profiles_verified`, `category_index_business` — Darwin's verified output with canonical_fee_key, variant_type, outlier_flags applied; admin review happens on Tier 2
- [ ] **TIER-03**: Tier 3 (Presentation) tables exist — `fees_published`, `index_published`, `snapshots_published` — adversarial-gated, Hamilton-consumable; every row traces back to Tier 1 via lineage fields
- [ ] **TIER-04**: Tier 1 → Tier 2 promotion happens only via Darwin's verification function; logged to `agent_events`, audit-traceable
- [ ] **TIER-05**: Tier 2 → Tier 3 promotion requires adversarial review success (Darwin + Knox both attest via inter-agent protocol) plus coverage threshold met
- [ ] **TIER-06**: SQLite is fully eliminated from all paths — `fee_crawler/db.py` deleted or rewritten as a Postgres-only module; all tests run against Postgres; no dual-support remains

### Runtime Foundation — 5-Step Loop (LOOP)

- [ ] **LOOP-01**: A reusable agent framework (Python + TypeScript bindings) implements the 5-step loop — any agent inheriting it honors LOG, REVIEW, DISSECT, UNDERSTAND, IMPROVE
- [ ] **LOOP-02**: LOG is automatic — calling any framework-provided tool writes to `agent_events` without the agent needing to remember
- [ ] **LOOP-03**: REVIEW is scheduled — agents run periodic self-review against their own + peers' event logs, output stored as `review`-type events
- [ ] **LOOP-04**: DISSECT analyzes deltas between expected and actual outcomes; patterns flagged
- [ ] **LOOP-05**: UNDERSTAND produces a named, generalizable lesson written to a knowledge table
- [ ] **LOOP-06**: IMPROVE updates the agent's own rules/knowledge/confidence — before/after captured in `agent_events`
- [ ] **LOOP-07**: Each IMPROVE step passes an adversarial review before becoming canonical — either a peer agent's challenge-and-prove OR a canary-corpus regression check with zero degradation

### Inter-Agent Communication Protocol (COMMS)

- [ ] **COMMS-01**: A message-passing mechanism between agents exists — Postgres-backed queue (`agent_messages`) with LISTEN/NOTIFY; messages have sender, recipient, intent, payload, correlation_id
- [ ] **COMMS-02**: Darwin-challenges-Knox handshake: Darwin asks "why X?", Knox replies with proof (source URL + document path + extraction event), Darwin accepts or rejects; all three messages logged
- [ ] **COMMS-03**: Knox-challenges-Darwin handshake: Knox asks "why rejected?", Darwin replies with the rule/pattern that flagged it, Knox accepts or counter-proves
- [ ] **COMMS-04**: Escalation queue: unresolved handshakes after N rounds route to human review (James) as a daily digest, not a real-time pager
- [ ] **COMMS-05**: Hamilton can query any agent's recent reasoning via reasoning_trace_id; "why this number?" surfaces on demand in reports

### Observability / Lineage (OBS)

- [ ] **OBS-01**: Every Tier 3 row has a `lineage_ref` pointing back through Tier 2 to Tier 1; the chain is queryable as a graph
- [ ] **OBS-02**: Given any number in a published report, one SQL query returns the full trace: Tier 3 row → Darwin verification event → Tier 2 row → Knox extraction event → state agent crawl event → R2 document
- [ ] **OBS-03**: An admin-only debug UI traces any published fee back to source in under 3 clicks
- [ ] **OBS-04**: Agent decisions are replayable by reasoning hash — exact tool calls, inputs, outputs of any turn can be reproduced
- [ ] **OBS-05**: Per-agent health metrics exist — loop-completion rate, review latency, pattern promotion rate, confidence drift, cost-to-value ratio

### Knox + State Agent Fleet (KNOX)

- [ ] **KNOX-01**: Knox is a supervisor — does not crawl URLs itself; coordinates 51 state agents, aggregates rollups, promotes cross-state patterns to national knowledge
- [ ] **KNOX-02**: Each of 51 state agents (50 states + DC) inherits the 5-step loop framework and operates autonomously within its territorial boundary
- [ ] **KNOX-03**: Each state agent maintains a per-institution dossier (table `institution_dossiers`) recording URL tried, document format discovered, strategy used, outcome, cost, next-try recommendation
- [ ] **KNOX-04**: Before each run, a state agent reads its own dossiers — institutions marked "needs Playwright stealth" skip straight to stealth on pass 1
- [ ] **KNOX-05**: State agent knowledge compounds — patterns on one institution's platform promote to all in-state institutions on that platform
- [ ] **KNOX-06**: Cross-state promotion is automatic — when N state agents independently learn the same pattern, Knox promotes it to national knowledge; no manual CLI invocation
- [ ] **KNOX-07**: State agents run on a quarterly cadence by default (4 passes/year), coordinated by Atlas; full refresh cycle fits Atlas's cost budget
- [ ] **KNOX-08**: State agents run against Supabase Postgres only — no SQLite fallback
- [ ] **KNOX-09**: Source lineage is restored — every new fee from a state agent has non-NULL `document_url` (and `document_r2_key` where feasible); pre-insert assertion blocks lineage-less fees from Tier 1
- [ ] **KNOX-10**: Existing Wyoming (91%) and Montana (47%) state agents are migrated to the new framework without regression; all 49 remaining states stand up on the same framework

### Darwin — Classification and Verification (DARWIN)

- [ ] **DARWIN-01**: Darwin verifies every Tier 1 row against its source document before Tier 2 promotion; high-confidence auto-promotes, ambiguous queues for adversarial challenge
- [ ] **DARWIN-02**: Darwin uses active learning — requests review on UNCERTAIN fees (not just flagged ones), plus a calibration sample of normal-looking fees
- [ ] **DARWIN-03**: Admin review actions (approve/reject/edit) feed back into Darwin's confidence model — wrong classifications are learned from
- [ ] **DARWIN-04**: Darwin detects miscategorization via fee_name + fee_category semantic consistency checks, not just amount outliers
- [ ] **DARWIN-05**: Darwin's rules are mostly prompt-driven — verification logic changes are prompt edits, not code edits
- [ ] **DARWIN-06**: Outlier thresholds (stddev bands, amount bands) are externalized to config, not hardcoded
- [ ] **DARWIN-07**: Darwin refuses to auto-reject any fee whose source document is missing — orphaned fees route to Atlas for re-discovery, not Roomba-style rejection

### Atlas — Orchestration (ATLAS)

- [ ] **ATLAS-01**: Atlas schedules the wave orchestrator as a Modal cron job (replacing the current commodity-extraction nightly jobs with the compounding wave system)
- [ ] **ATLAS-02**: Atlas owns per-agent cost budgets — Knox quarterly, Darwin per-batch, Hamilton per-report and per-client-month; exceeding budget halts the agent's next cycle pending review
- [ ] **ATLAS-03**: Atlas routes remediation — Darwin rejections → re-extraction queue; 404 URLs → re-discovery queue; coverage drops → deepening pass
- [ ] **ATLAS-04**: The escalation queue has a daily digest James reviews; queue depth visible on admin dashboard
- [ ] **ATLAS-05**: Atlas runs knowledge promotion after every wave — cross-state patterns promoted to national knowledge before the next quarter starts
- [ ] **ATLAS-06**: Modal cron slots are reorganized or upgraded to accommodate wave + Darwin + Atlas; 5-slot limit documented as resolved

### Hamilton Refactor (HAM)

- [ ] **HAM-01**: Hamilton reads only Tier 3 tables — every assembler, Pro screen, research tool is refactored to query `fees_published`, `index_published`, etc.
- [ ] **HAM-02**: Hamilton uses `canonical_fee_key` (not raw `fee_category`) for all grouping and aggregation — Phase 55's foundation is actually used
- [ ] **HAM-03**: Every Hamilton report surfaces data-quality signals — coverage %, source-verification %, outstanding-challenge count — visibly in the output
- [ ] **HAM-04**: Hamilton refuses to publish a number whose lineage chain to Tier 1 is broken; graceful error, not silent inclusion
- [ ] **HAM-05**: Hamilton reflects client demand back to the agent team — repeated Pro queries on thin-coverage categories trigger a signal to Atlas

### Bootstrap and Testing (BOOT)

- [ ] **BOOT-01**: Bootstrap protocol documented and executable — Q1 full human validation of 10-20% sample, Q2 high-confidence auto, Q3+ autonomy with exception review
- [ ] **BOOT-02**: Golden corpus of 100+ institutions with human-verified fees exists as Darwin's training anchor and canary baseline
- [ ] **BOOT-03**: Agent testing pattern implemented: contract tests (mock LLM, assert tool-call sequence), fixture replay, canary runs (golden corpus ±tolerance), shadow mode (parallel old/new on live data)
- [ ] **BOOT-04**: No agent ships without passing its canary run on the golden corpus with zero regression on core metrics (coverage, confidence, extraction count)

### Capability Discovery + UX (UX)

- [ ] **UX-01**: Slash commands exist across Pro research hub: `/ask`, `/compare`, `/chart`, `/report`, `/help` — keyboard-discoverable
- [ ] **UX-02**: "What Hamilton can do" help panel always accessible; displays current agent team status (Knox last-run, Darwin verification rate, coverage %)
- [ ] **UX-03**: Three silent-action anti-patterns fixed: `refreshFeeds` triggers revalidation; `runExtract` streams status to UI; report-job polling uses SSE not 3s interval
- [ ] **UX-04**: Four workflow-mega-tools (`queryNationalData`, `rankInstitutions`, `queryRegulatoryRisk`, `queryFeeRevenueCorrelation`) are broken into composable primitives; agents compose rather than call monoliths
- [ ] **UX-05**: Context injection upgraded — every agent system prompt includes user identity, recent activity, workspace state, resource freshness timestamps, session-history summary

### Security + Final Hardening (SEC)

- [ ] **SEC-01**: RLS enabled on the 7 exposed Hamilton tables with `user_id` policies
- [ ] **SEC-02**: "RLS Enabled No Policy" tables audited — kept locked (service-role only) or given explicit permissive policies if client-side access is needed
- [ ] **SEC-03**: `ext_intel_search_vector_update` function has `search_path` pinned
- [ ] **SEC-04**: Agent tool calls authenticated via an agent identity system (not reusing user sessions); agent writes auditable by agent name
- [ ] **SEC-05**: Secrets rotation runbook documented for DATABASE_URL, ANTHROPIC_API_KEY, Stripe keys, Modal secrets (Vercel + Modal + local env propagation)

## Future Requirements (v11.0+)

Deferred explicitly from v10.0:

### Smart Roomba with Source Re-extraction (v11.0)
- SMART-01: When Darwin finds a miscategorized fee with a source doc, auto-trigger LLM re-extraction on the source
- SMART-02: When Darwin finds an orphan (no source), Knox's state agent for that institution re-discovers the URL

### Franklin — Adversarial Devil's Advocate (v11.0+)
- FRANKLIN-01: Optional 5th agent challenges Knox+Darwin consensus when confidence is suspiciously high across unusual patterns

### Public API (already in backlog as 999.15)

## Out of Scope

| Feature | Reason |
|---------|--------|
| New user-facing features during v10.0 | Foundation-only milestone |
| SQLite dual-support | Kill it entirely; no compatibility shim |
| Mobile app | Web-first |
| Continued work on v9.0 Phases 56-61 | Shipped or infrastructure-complete |
| Bulk re-extraction of all prod fees | Opt-in per-institution via Atlas remediation queue |
| Monthly / weekly state agent cadence | Quarterly is the operator-locked cadence |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| AGENT-01..05 | 62a | Pending |
| TIER-01..06 | 62a | Pending |
| LOOP-01..07 | 62b | Pending |
| COMMS-01..05 | 62b | Pending |
| OBS-01..05 | 62b | Pending |
| KNOX-01..10 | 63 | Pending |
| DARWIN-01..07 | 64 | Pending |
| ATLAS-01..06 | 65 | Pending |
| HAM-01..05 | 66 | Pending |
| BOOT-01..04 | 62b (framework) + 63 (corpus + bootstrap runs) | Pending |
| UX-01..05 | 67 | Pending |
| SEC-01..05 | 68 | Pending |

**Total: 52 requirements. All mapped.**

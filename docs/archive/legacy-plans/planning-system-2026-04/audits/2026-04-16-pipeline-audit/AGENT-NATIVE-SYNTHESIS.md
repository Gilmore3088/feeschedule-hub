---
title: Agent-Native Architecture Audit — Synthesis
date: 2026-04-16
scope: Full codebase (Bank Fee Index / Next.js 16 + Python fee_crawler)
status: complete
---

# Agent-Native Architecture Review — Bank Fee Index

## Agent team (named, locked)

| Agent | Name | Role |
|---|---|---|
| **Synthesis / consultant** | **Hamilton** | Consumes validated data from the team, produces McKinsey-grade reports, client-facing |
| **Data** | **Knox** | Discover → Fetch → Extract → preserve lineage. Named for Henry Knox, who dragged 59 cannons 300 miles to Boston. |
| **Classification / Verification** | **Darwin** | Categorize, detect outliers, verify against source, challenge bad data. Named for the naturalist/taxonomist; "evolution" is the self-improvement metaphor. |
| **Orchestration** | **Atlas** | Schedule, route, manage queues, apply compounded knowledge. Bears the weight of the whole system. |

## Operating contract — the 5-step loop

Every agent in the team honors this loop as a first-class architectural contract:

```
  ┌─► 1. LOG       every action, input, output, decision — to shared event log
  │   2. REVIEW    periodic self-examination of own log + peers' logs
  │   3. DISSECT   what happened, where did I misjudge, what signal did I miss
  │   4. UNDERSTAND  root cause, pattern, generalizable lesson
  │   5. IMPROVE   update own rules / knowledge / confidence / protocol
  └──────────────────────── next iteration ◄────────────────────────────────
```

Hamilton consumes the agents' self-improvement telemetry as a signal of system health, in addition to consuming their data outputs.

---

## Overall scorecard

| Core Principle | Score | % | Status |
|---|---|---|---|
| 1. Action Parity | 7 / 31 | 23% | ❌ Needs Work |
| 2. Tools as Primitives | 15 / 19 | 79% | ⚠️ Partial (approaching excellent) |
| 3. Context Injection | 2.5 / 6 | 42% | ❌ Needs Work |
| 4. Shared Workspace | 38 / 57 | 67% | ⚠️ Partial |
| 5. CRUD Completeness | 1 / 25 | 4% | ❌ Critical |
| 6. UI Integration | 13 / 16 | 81% | ✅ Excellent |
| 7. Capability Discovery | 5.5 / 7 | 79% | ⚠️ Partial (approaching excellent) |
| 8. Prompt-Native Features | 11 / 20 | 55% | ⚠️ Partial |

**Overall weighted agent-native score: ~55%**

Legend: ✅ ≥80% excellent · ⚠️ 50–79% partial · ❌ <50% needs work

---

## Per-principle findings

### 1. Action Parity — 7/31 (23%) ❌

**Gap:** Hamilton has rich *read* tools (searchFees, queryNationalData, searchIndex) but is blocked from almost every *write* action a user can take. Of 31 enumerated user actions across admin, pro, and consumer surfaces, only 7 have agent equivalents — mostly read/query and report-trigger flows.

**Critical unexposed actions (admin side):** approveFee, rejectFee, markDuplicate, approveAllFees, updateFee, updateFeeUrl, runExtract, markInstitutionOffline.

**Critical unexposed actions (pro side):** saveAnalysis, saveScenario, addToWatchlist, removeFromWatchlist, createPeerSet, removePeerSet, loadReport, loadAnalysis, refreshFeeds.

**Why it matters for Knox/Darwin/Atlas:** Darwin needs to approve/reject fees autonomously once its confidence crosses a threshold. Knox needs to rerun extraction on orphaned fees. Atlas needs to invoke every pipeline stage. Zero of those capabilities exist as tools today.

### 2. Tools as Primitives — 15/19 (79%) ⚠️

**Gap:** Four of 19 tools are workflow wrappers rather than primitives: `queryNationalData`, `rankInstitutions`, `queryRegulatoryRisk`, `queryFeeRevenueCorrelation`. The mega-tool `queryNationalData` conflates 11 independent sources (FRED, Beige Book, complaints, deposits, etc.) into a single call — severely limits agent composition when only one domain is needed.

**Refactor pattern:** break each workflow tool into 3–5 primitives (one per data source) and let the agent compose them.

### 3. Context Injection — 2.5/6 (42%) ❌

**What's injected:** broad capability descriptions ("X+ observations from Y+ institutions"), tool descriptions.

**What's NOT injected:**
- User identity / preferences (saved peer sets, charter focus, recent analyses)
- Session history summary (prior Q&A threads invisible in system prompt)
- Workspace state (flagged fee counts by status, coverage gaps by category, failed targets)
- Data freshness ("as of [timestamp]")
- Recent activity (last admin action, last crawl outcome)

**Consequence:** Hamilton knows *what* tools exist but not *who* is asking, *what* they asked before, or *what* matters right now in the workspace.

### 4. Shared Workspace — 38/57 (67%) ⚠️

**Core operational tables are properly shared** (38): `extracted_fees`, `crawl_targets`, `crawl_results`, `fee_reviews`, `users`, `sessions`, etc. Both users and agents read/write the same rows.

**Isolated sandboxes (19 tables, anti-pattern):**
- `agent_runs`, `agent_run_results` — agent-only, never surfaced to user dashboard
- `research_conversations`, `research_messages`, `research_usage`, `research_articles` — Hamilton writes its own history
- `hamilton_saved_analyses`, `hamilton_scenarios`, `hamilton_reports`, `hamilton_watchlists`, `hamilton_signals` — full Hamilton sandbox
- `wave_runs`, `wave_state_runs` — orchestrator isolated from crawl_runs
- `classification_cache`, `external_intelligence`, `beige_book_themes` — research data not surfaced

**Action:** consolidate under user-visible schema; make agent work observable to users.

### 5. CRUD Completeness — 1/25 (4%) ❌ CRITICAL

**Only `articles` has full CRUD** for agents. Every other entity (extracted_fees, crawl_targets, fee_reviews, hamilton_scenarios, hamilton_reports, watchlists, peer_sets, saved_analyses, and 17 more) is either read-only to agents or has no agent access at all.

**Why it's the lowest score:** write operations universally funnel through Python CLI or Next.js server actions gated by `requireAuth()`. There's no agent-accessible write layer.

**Consequence for the agent team:**
- Darwin cannot flag/reject fees programmatically
- Knox cannot rerun extraction for an institution
- Atlas cannot spawn or cancel jobs
- No agent can persist its own reasoning or save its own work

This score is the single biggest blocker to the agent team being real.

### 6. UI Integration — 13/16 (81%) ✅

**Strengths:**
- Hamilton streams via Vercel AI SDK `streamText` + `toUIMessageStreamResponse` — real-time UI updates
- Most server actions call `revalidatePath` immediately
- Modal post-processing pings `/api/revalidate` via `BFI_REVALIDATE_TOKEN`

**Silent-action anti-patterns (3):**
1. `refreshFeeds` in `/pro/news/actions.ts` writes to DB with no revalidation
2. `runExtract` spawns Modal job but doesn't revalidate the UI to show "job started"
3. Report job polling doesn't update `report_jobs.status` immediately in UI (3s polling delay)

Near-miss on excellent; 3 small fixes would push to 100%.

### 7. Capability Discovery — 5.5/7 (79%) ⚠️

**Works well:**
- Welcome flow has capability cards
- Public About page
- Hamilton self-describes persona + response structure in system prompt
- Research hub has suggested prompts
- Reports empty states guide users

**Missing:**
- No slash-command interface (`/help`, `/ask`, `/compare`) — keyboard discovery is zero
- No persistent "What can Hamilton do?" help panel in Pro screens
- Tooltips on Analyze output sections (Hamilton's View / What This Means / etc.) are missing

### 8. Prompt-Native Features — 11/20 (55%) ⚠️

**Prompt-driven (good):** Hamilton voice system, thesis generator, research skill frameworks — 100% prompt.

**Hardcoded (bad):**
- Movement detection thresholds (numeric constants in code)
- Outlier filtering thresholds
- Report type allowlist (enumerated in code)
- Tool permissions (role → toolset mapping)
- Analyze mode section structure (templated in code, not prompt)
- Forbidden terms list (hardcoded array)

**Consequence:** operators cannot tune the model's editorial voice or adjust quality thresholds without developer help. ~45% of behavior changes need code edits.

---

## Top 10 recommendations (prioritized by agent-team impact)

| # | Action | Principle | Effort | Unblocks |
|---|---|---|---|---|
| 1 | Build the **agent_events** shared log + 5-step loop infrastructure | (new) | Medium | Every agent's ability to LOG, REVIEW, DISSECT, UNDERSTAND, IMPROVE |
| 2 | Expose **write CRUD** for core entities as tools: approveFee, rejectFee, updateFee, addToWatchlist, saveAnalysis, saveScenario, createPeerSet | 1, 5 | High | Darwin + Knox can act autonomously; Hamilton can persist work |
| 3 | Break the 4 workflow-mega-tools (queryNationalData, rankInstitutions, queryRegulatoryRisk, queryFeeRevenueCorrelation) into focused primitives | 2 | Low-Med | All agents can compose cleanly |
| 4 | Inject user identity + session summary + workspace state into every agent system prompt | 3 | Low | Agents know who they're talking to and what matters now |
| 5 | Merge `hamilton_*` sandbox tables into user-visible schema with `user_id` FK; expose watchlists/analyses/reports to agents | 4, 5 | Medium | Remove sandbox; agent work becomes observable to users |
| 6 | Externalize hardcoded thresholds (outlier bands, movement detection, confidence cutoffs) into prompt-editable config | 8 | Low | Operators tune behavior without dev cycle |
| 7 | Add `/help`, `/ask`, `/compare`, `/chart`, `/report` as slash commands in Pro + Admin research hubs | 7 | Low | Capability becomes keyboard-discoverable |
| 8 | Wire the 3 silent-action anti-patterns (refreshFeeds, runExtract, report polling) to `revalidatePath` / SSE | 6 | Low | Full 100% UI integration |
| 9 | Make `agent_runs`, `wave_runs`, `research_conversations` visible in admin dashboard (Atlas's console) | 4 | Low | Users see the agent team at work |
| 10 | Surface data freshness + coverage-gap summary in every system prompt | 3 | Low | Agents self-report quality instead of pretending data is pristine |

---

## What's working excellently

1. **UI streaming & revalidation discipline (81%)** — the Hamilton response path from model → stream → UI is production-quality. That's a real platform advantage.
2. **Tool primitives are mostly clean (79%)** — 15 of 19 tools are proper primitives with good "when to use" hints. Good composition surface.
3. **Capability discovery is mostly present (79%)** — welcome flow + suggested prompts + self-describing Hamilton is a solid baseline.
4. **Core operational data is properly shared (67%)** — extracted_fees, crawl_targets, fee_reviews all live in one place both users and agents touch.
5. **Prompt-native core (Hamilton voice, thesis, skills)** — the part of Hamilton that matters most is fully prompt-driven. Changing tone, structure, emphasis is a prompt edit.

---

## What's critically broken

1. **CRUD at 4%** is the headline. Agents can read plenty but write almost nothing. The agent team cannot be real until this changes.
2. **Action Parity at 23%** is the same blocker from a different angle. Agents have analytical tools, not operational ones.
3. **Context Injection at 42%** means agents operate blind to user identity and workspace state. Every conversation starts cold.

These three scores are the "why Knox/Darwin/Atlas can't exist as autonomous agents yet" — they compound into the same problem: the current codebase treats Hamilton as a *read-only analyst* instead of an *operational system member*.

---

## Proposed v10.0 sequencing (agent-first)

Reframing the earlier Phases 62-68 proposal through the agent-team lens:

**Phase 62 — Agent Foundation**
Build `agent_events` shared log, 5-step loop infrastructure, write-CRUD tool layer, context injection upgrade. Recommendations #1, #2, #4, #10.

**Phase 63 — Knox: Source Lineage**
Stand up Knox as the Data Agent. First job: fix the 80.4% NULL `document_url` crisis by routing orphaned fees through the URL finder loop. Knox uses the new agent_events log to persist what it learns.

**Phase 64 — Darwin: Categorization QA**
Stand up Darwin as the Classification Agent. First job: retrain classifier against human-verified corpus, wire admin review actions back to Darwin's learning loop. Darwin challenges Knox's extractions ("this $2500 isn't a monthly_maintenance fee").

**Phase 65 — Atlas: Orchestration**
Stand up Atlas as the Orchestration Agent. First job: schedule wave orchestrator, wire knowledge promotion into cron, route work between Knox and Darwin. Atlas owns the pipeline's daily heartbeat.

**Phase 66 — Hamilton as Consumer**
Refactor Hamilton to consume agent-validated, quality-tagged views instead of raw tables. Hamilton reports get source transparency badges and agent confidence scores. Recommendations #5, #6.

**Phase 67 — Discovery & Silent Actions**
Slash commands, help panel, silent-action fixes. Recommendations #7, #8, #9.

**Phase 68 — RLS & Security**
Lock down Hamilton tables, finish migrations, close the security loop.

Each phase ships a working agent or a working agent upgrade. No "build it all first, then connect" trap.

---

## Artifacts

```
.planning/audits/2026-04-16-pipeline-audit/agent-native/
├── 02-tools-primitives.md      (written by subagent)
├── 05-crud-completeness.md     (written by subagent)
├── 08-prompt-native.md         (written by subagent)
└── [1, 3, 4, 6, 7 returned inline — captured in this synthesis]
```

All eight principles audited; all scores derived from inline subagent returns + three on-disk reports. Total subagent output: ~4K+ lines of evidence.

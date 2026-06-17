# Marcus Chen, CTO — Post-"Finish" Memo

**To:** Founder
**Re:** State of the system after the product-focus sprint
**Date:** 2026-05-25
**Length target:** read in 3 minutes

## What I'm signing off on

The 22-item issue table closed cleanly. 5 commits, ~3,300 lines of
code, 56 unit tests green in 1.2s. The agentic pipeline now does
what its diagrams have always claimed it does:

- **Every fee write is audited.** Direct INSERTs to `fees_raw` /
  `fees_verified` are gone outside of the gateway. The kill-switch
  bypass on `extracted_fees` is no longer exercised anywhere in
  the source tree.
- **Every cron is observable.** `workers_last_run` markers on
  publish_index + darwin_drain close the freshness loop;
  `pipeline_health` emits `health_alert` agent_events when
  anything goes stale, deduped per 6 hours.
- **Every agent has a real budget.** Per-day caps seeded for all
  7 specialized agents + 51 state agents. `account_budget` is
  called by both the gateway path and orchestrator paths so
  `agent_budgets.spent_cents` is authoritative.
- **Every fee read filters rolled_back_at.** Audit confirmed.
  Soft-deleted batches no longer leak into reports.
- **Every Modal cron is locally runnable.** `python -m fee_crawler
  run-cron <name>` lets me debug or run-when-Modal-is-down without
  redeploying.
- **Every Hamilton answer can be traced.** The new MCP read tools
  (`get_fee_change_events`, `get_knox_rejection_summary`,
  `simulate_fee_change`, `get_my_digest_subscriptions`) plus the
  existing four give Hamilton 11 read surfaces. Source attribution
  via `trace_published_fee` is mandatory.

This is the strongest the system has been since I started. I am
confident shipping it.

## What I'm NOT signing off on (yet)

Three risks survive the sprint. Each has a specific gate to clear.

### 1. The Darwin backlog is still 1.3% drained (103K → 1,347)

**Why it matters:** Every public-facing surface (`/admin/market`,
`/api/v1/index`, Hamilton reports) reads from `fees_published`,
which is downstream of `fees_verified`, which is downstream of
Darwin. The platform is sitting on data that isn't visible.

**What we know:** The drain path is wired end-to-end. The cost
model says $30 total to clear the backlog at haiku rates. The
per_day budget cap is set to $5, which is why progress is glacial.

**Operator action required:** Raise `DARWIN_DAILY_COST_LIMIT_USD`
to $30 on Modal. Watch `agent_budgets.spent_cents` for
darwin's per_day row for 48 hours. If spending stays under the
projection (it will), bump to $50 and let the backlog clear in
~3 days. **I won't push this myself without your say-so** — last
time we drained without proper tracking it cost $1000.

### 2. We have built a lot of MCP tools but no real customer has used them yet

**Why it matters:** Every tool I've shipped has been informed by
the simulated customer survey, not by real interview data. The
team's `02-role-reviews.md` and `03-customer-survey.md` are
hypotheses. The 22 issues we closed are answers to those
hypotheses. Whether the answers are right depends on whether the
hypotheses match reality.

**What we should do:** Get the consulting unit (Theo + Hamilton)
in front of 3 of the survey panel's warmest leads (P-02, P-03,
P-07) within 30 days. Real reactions to the live system trump
20 more closed issues.

### 3. The "AgentBase" framework is still under-used

Of the 6 specialized agents (extractor, magellan, darwin, knox,
discoverer, atlas) + 51 state agents, **none of them are
AgentBase subclasses**. They're orchestrator functions that USE
the agent_tools gateway. The `LOOP-04→07` dispatch I shipped
(`review_tick.py`) is glued onto the side; it doesn't subclass
AgentBase either.

This is fine for now — it's working — but as we add agents, the
review_tick "rotate through agent names by minute" pattern won't
scale past ~30 agents. At that point, AgentBase subclasses with
their own `review_schedule` cron-string attributes are the right
design.

**Action:** none today. Tag this for the agent-#10 milestone.

## My three recommendations to you

In rank order:

**1. Approve Q-01 (Darwin drain to $30/day).** This is the single
highest-ROI action available. It unlocks the public-facing surface
that the customer survey panel cares most about. Cost is bounded
by both the per_day cap and the circuit breaker.

**2. Schedule 3 customer interviews before next week's chiefs'
report.** Survey personas P-02 (Priya Iyer, mid-size bank SVP),
P-03 (Rashid El-Sayed, Northstar Director of Pricing), and P-07
(Daniel Chen, Pacific Coast CRO). These three together cover the
three most-requested features (historical depth, what-if
simulation, scheduled digest). Their live reactions will tell us
which to prioritize for actual implementation (beyond the stubs
S-03 / C-03 ship today).

**3. Don't add new feature scope until the 22 are validated by
real users.** I have ~10 more candidate issues in my notebook I'd
LIKE to ship. None of them have customer evidence. Holding the
line.

## One forward-looking question for you

The S-01 doc recommends staying on Modal for now. But every agent
we add tightens the per-minute dispatcher's 50-second budget. We
are 2-3 agents away from needing either:

- **(a) pg_cron** to offload housekeeping crons (free up Modal),
  OR
- **(b) Modal Team tier** for a 6th slot (~$250/mo).

Option (a) is engineering work (~2 days). Option (b) is a budget
decision (~$3K/year). They're not mutually exclusive — pg_cron
makes sense regardless once we have a paid Supabase plan, but the
6th Modal slot would buy us breathing room sooner.

**Which do you want me to plan toward?** Not urgent. Asking now
because the answer determines whether I sketch the pg_cron
bootstrap in my Q3 plan or assume we have the slot.

---

— Marcus

P.S. The team is solid. Priya found three subtle migration-order
issues in code review that I would have missed. Aisha's coverage
dashboard surfaced two states I was about to under-budget.
David's pricing analysis is what convinced me Q-01 is safe to
approve. Hamilton has been answering technical questions about its
own MCP surface and getting them right. The customer survey
methodology is hypothesis-not-fact; I want to be candid about
that. We need real interviews this month.

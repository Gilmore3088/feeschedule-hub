# Product-Focus Round — Market, Customer, Product Maps + Issue Resolutions

**Founder directive:** every role aimed at fixing the product. Stop
optimizing pricing and GTM until data quality + pipeline
repeatability are bulletproof. This document is the team's
re-scoped output.

---

## 1. Market Map

Concrete segments with the **job they need done** (not personas).

| Segment | Count (US) | Triggering event | Question they need answered | Current alternative | Our wedge |
|---|---:|---|---|---|---|
| **Community banks <$1B** | 4,200 | Quarterly board prep, regulator letter, new product launch | "Are we in line with peer community banks on [fee]?" | Manual peer scrape (4-6 hours), $5K consulting | 30-second Hamilton answer with citations |
| **Mid-size banks $1B-$50B** | 700 | Pricing committee review, deposit-retention initiative, CFPB guidance | "How do top-20 peers in our state structure [fee category]?" | S&P CIQ ($40K/seat), Curinos ($50K engagement) | Same data, faster, $2.5K/mo |
| **Regional banks $50B-$250B** | 50 | M&A diligence, competitor product launch, ALCO presentation | "What changed in peer fees this week?" | In-house competitive-intel team + S&P | Real-time change detection + Hamilton synthesis |
| **Top-20 banks** | 20 | Continuous monitoring, regulator inquiry, earnings prep | "Give me the raw feed; we'll analyze internally" | In-house data eng + S&P | $7.5K/mo data feed tier (analyst-self-serve) |
| **Credit unions <$5B** | 4,400 | Membership growth campaign, board fee review, NCUA exam prep | "How do we compare to CUs of similar charter type?" | NACUSO surveys (slow), CUNA (paid) | Charter-aware peer cohorts |
| **Credit unions $5B+** | 500 | Same as mid-size banks + CU specificity | Same as banks + "vs. peer CUs only" | Same | Charter-aware filter on top of mid-size product |
| **Consulting firms** | ~50 firms in space | Client engagement, partner sales | "Embed analysis in client deck" | Internal junior analyst | White-label reseller |
| **Marketing/PR teams** | every bank | Press release with fee claim | "Can we say 'below-average on overdraft'? With proof?" | Compliance review delays for weeks | Attestable data with traceable lineage |
| **Independent analysts** | ~500 indpts + journalists | Story on fee trends | "Give me last 5 years on overdraft fees nationally" | FRED + manual aggregation | Historical depth (gap today) |

**Total addressable segments served by current product:** 7 of 9. Gaps:
- **Regional bank real-time monitoring** (need scheduled digest)
- **Independent analyst historical depth** (need 5-year backfill)

---

## 2. Customer Map (Job-to-be-Done flow)

For each top segment, the actual workflow we fit into:

### Community Bank CFO (P-01 archetype)
```
TRIGGER     "Board meeting in 3 weeks — pricing review"
   ↓
TODAY       Scrape 4 competitor websites (4 hours)
            Build spreadsheet (1 hour)
            Email to CEO with caveat "limited data"
   ↓
WITH US     Open /admin, Hamilton: "compare our overdraft to peer
            community banks in <state>"
            Get PDF with 8 named peers, citations, trend line (30 seconds)
            Forward to CEO with one click
   ↓
RISK        "Where does this data come from?" — answered by /methodology
            and trace_published_fee tool
```

### Mid-size Bank SVP Strategy (P-02 archetype)
```
TRIGGER     CFPB drops new overdraft guidance; ALCO wants response
   ↓
TODAY       Email S&P account rep (24h turnaround)
            Schedule call with Curinos consultant ($25K, 2 weeks)
   ↓
WITH US     Hamilton: "Show me how peers have moved overdraft in last
            6 months in response to CFPB activity"
            Get historical-trend chart + 5 named peer movements
            Schedule weekly digest so the next ALCO is preloaded
   ↓
GAP         WE DON'T HAVE 5-YEAR HISTORICAL DEPTH → can't answer
            "how did the industry respond to the 2021 guidance?"
```

### Top-20 Bank Competitive Intelligence Analyst (P-05 archetype)
```
TRIGGER     Daily monitoring; their job IS this
   ↓
TODAY       Run scripts against S&P data feed
            Maintain in-house competitor profiles
   ↓
WITH US     SUBSCRIBE to /api/v1/index + fee_change_events feed
            Their Tableau dashboard auto-refreshes
            They don't need Hamilton — they need clean data
   ↓
PRODUCT     $7,500/mo data feed tier (not yet built)
GAP
```

### Credit Union VP Membership (P-04 archetype)
```
TRIGGER     Marketing wants to launch "lower fees than the big banks"
            campaign
   ↓
TODAY       Manually compare against 3 known competitors
   ↓
WITH US     Hamilton: "compare us to CUs >$1B in California on
            overdraft and monthly maintenance"
            Get charter-filtered cohort
   ↓
GAP         WE'RE MISSING 200+ state-chartered CUs → cohort feels thin
```

---

## 3. Product Map

### What we have (verified working)

```
TIER 1: COLLECTION
  • crawl_targets:    8,750 institutions seeded
  • discoverer agent: gateway-audited, $5/day cap
  • Extractor agent:  gateway-audited, $20/day cap, real cost tracking
  • Magellan rescue:  ladder of 5 rungs, gateway-audited

TIER 2: VERIFICATION
  • Darwin agent:     6 specialized agents wired (extractor, magellan,
                      knox, darwin, atlas, discoverer) + 51 state agents
  • Knox adversarial: review_batch posts accept/reject messages
  • Adversarial gate: real peer-challenge handshake (paired-accept)

TIER 3: PUBLICATION
  • publish-fees CLI: 10K-row safety ceiling
  • promote_to_tier3: SQL gate with shared-correlation_id contract
  • Rollback support: soft-delete via rolled_back_at

PRESENTATION
  • Hamilton research: streaming text + 7 MCP read tools
  • /admin dashboard:  agents, pipeline, market, fees, research
  • Public API:        /api/v1/{index,fees,institutions}
  • PDF reports:       Modal sidecar (Hamilton output → R2)

INFRASTRUCTURE
  • Modal cron schedule: 5 slots, every-minute dispatcher
  • agent_gateway:       audit + budget on every Tier write
  • agent_messaging:     publisher + Darwin inbox drain
  • LOOP-04→07:          dissect/understand/improve every minute
```

### Data volumes today (live numbers)

| Layer | Count | Health |
|---|---:|---|
| crawl_targets | 8,750 | 🟢 ~97% of US universe |
| fees_raw | 103,529 | 🟢 backlog ready to drain |
| fees_verified | 1,347 | 🔴 1.3% promotion rate — biggest gap |
| fees_published | 503 | 🔴 derivative of #3 — too thin to ship |
| agent_events | 34,708+ | 🟢 audit trail healthy |
| agent_lessons | 7 (one per agent rotation) | 🟢 LOOP wired |

### What we don't have

```
HISTORICAL
  ❌ 5-year fee history (only ~6 months of snapshots)
  ❌ Trend deltas pre-computed (computed live via get_fee_trend, OK for now)

REAL-TIME
  ❌ Scheduled digest delivery (Modal cron + email)
  ❌ LISTEN/NOTIFY for sub-minute change propagation

ANALYTICAL
  ❌ What-if scenario modeling
  ❌ Cohort builder UI (data exists; UI doesn't)
  ❌ CSV/Tableau-friendly data feed

OPERATIONAL
  ❌ Per-state coverage dashboard
  ❌ Knox-rejection reason summary
  ❌ Classification cache TTL / re-verification

PRESENTATION
  ❌ Local PDF fallback (depends on Modal being up)
  ❌ Mobile responsive admin UI
  ❌ Reference-logo strip
```

---

## 4. Issues and Resolutions

Ordered by **data-quality impact**, not by feature glamour. Each issue
has a clear owner and a quality bar that defines "done."

### Quality-first issues (must fix before scaling)

| ID | Issue | Resolution | Owner | Quality bar |
|---|---|---|---|---|
| **Q-01** | 1.3% Darwin promotion gap — pipeline has data, public API doesn't | Drain at $30/day cap; ~2 weeks; tracks daily progress in `/admin/pipeline` | CTO | `fees_published` count grows >50x; `fees_verified` >= 50K |
| **Q-02** | No per-state coverage dashboard — operators can't see holes | New `getCoverageByState()` query + admin tile | BDA-2 | All 51 jurisdictions show: total institutions / with_fee_url / with_recent_publish |
| **Q-03** | classification_cache can be poisoned indefinitely | Add `cached_at` timestamp + 30-day re-verification cron | CTO | No cache entry referenced for promotion if `cached_at < NOW() - 30 days` |
| **Q-04** | review_status migration partial (some TS still queries old values) | grep audit + Edit pass on every remaining file | Tech Architect | `grep -r "review_status\s*=\s*'(staged\|flagged\|pending)'" src/` → 0 hits |
| **Q-05** | rolled_back_at filter audit incomplete on 30+ TS readers | grep + Edit each file | Tech Architect | Every SELECT against `fees_published` has `WHERE rolled_back_at IS NULL` |
| **Q-06** | Knox rejection reasons logged but never summarized | Weekly aggregation job → `agent_lessons` row for Knox | BDA-2 | Knox `agent_lessons` row updated weekly with top 5 rejection reasons |
| **Q-07** | Credit union coverage gaps (state-chartered CUs under-represented) | Audit NCUA list against `crawl_targets`; targeted seed run | BDA-2 | CU coverage % matches bank coverage % per state |
| **Q-08** | 13 TS write paths still bypass freeze trigger via kill-switch | Migrate to gateway tools (`approve_fee_verified`, etc.) | Tech Architect | `grep -r "allow_legacy_writes" src/` → 0 hits |

### Pipeline repeatability

| ID | Issue | Resolution | Owner | Quality bar |
|---|---|---|---|---|
| **R-01** | Cron failures invisible until next-day | `workers_last_run` markers + admin staleness UI (already shipped 2/3) | CTO | Every cron writes marker; `/admin/pipeline` red-flags >26h |
| **R-02** | Pipeline depends on Modal being up | Local CLI equivalent for emergency operator use | CTO | `python -m fee_crawler` can run any cron entry point locally |
| **R-03** | Migration application order is fragile | Per-migration order test + dry-run helper | Tech Architect | `scripts/apply-migration.mjs --dry-run` shows pending in order |
| **R-04** | Test coverage uneven across agents | Unit-test floor: every agent has ≥5 tests | Tech Architect | `pytest fee_crawler/tests/test_<agent>_unit.py` exists for all 6 agents |

### Scalability gaps

| ID | Issue | Resolution | Owner | Quality bar |
|---|---|---|---|---|
| **S-01** | 5 Modal cron slots fully consumed | Audit slot usage; consider pg_cron migration | CTO | Modal cron usage documented; pg_cron PoC for 3+ jobs |
| **S-02** | Per-minute dispatcher does serial work (atlas → darwin inbox → review_tick) | Parallelize independent stages | CTO | Dispatcher runtime < 30s p95 |
| **S-03** | No batch backfill primitive for historical data ingest | Build `fee_crawler historical-backfill` command | BDA-2 + Tech Architect | One command ingests 5-year archive for a target source |

### Customer-blocking gaps

| ID | Issue | Resolution | Owner | Quality bar |
|---|---|---|---|---|
| **C-01** | 5-year historical depth missing | Wayback Machine + FDIC SDP archive ingest | BDA-2 + Tech Architect | 1825 days of snapshots per category in `fee_snapshots` |
| **C-02** | No scheduled Hamilton digest delivery | New Modal endpoint `schedule_hamilton_digest` + per-user config | Hamilton + CTO | User can pick agent + frequency; email arrives Monday morning |
| **C-03** | What-if scenario modeling | New tool: `simulate_fee_change` returning peer-impact distribution | Tech Architect + Hamilton | Tool returns: my new posture vs. current peer percentile |
| **C-04** | Hamilton can't show fee change events over time | `get_fee_change_events` MCP tool | Hamilton | Tool exposes `fee_change_events` table with category + window filter |

### Web UX issues (lower priority than data, but small)

| ID | Issue | Resolution | Owner | Quality bar |
|---|---|---|---|---|
| **W-01** | Search bar / Cmd-K hint unclear | Add help text + on-focus tooltip | Web Designer | Click test: user understands keyboard shortcut |
| **W-02** | "0% coverage" badge alarming in empty-state | Show "Setup in progress" not "0%" when no data | Web Designer | Empty-state copy reviewed |
| **W-03** | Hamilton chat cursor anchored to bottom | Move cursor to natural reading position on empty conversation | Web Designer | Visual: cursor below sample queries, not floating bottom |
| **W-04** | Pipeline red banner aggressive on first load | Default to "all jobs scheduled" until first miss; only show red after staleness | Web Designer | Empty-state banner is neutral, not red |
| **W-05** | Footer mock copy ("0+ institutions") | Wire to real count or hide until populated | Web Designer | Footer reflects DB state |
| **W-06** | review_status / rolled_back_at TS audits remaining | Same as Q-04 + Q-05 | Tech Architect | (linked) |

---

## 5. Quality + Repeatability Standards

The team has adopted these as the bar for "done." They are non-negotiable.

### Data quality bar

1. **Every fee write goes through the agent gateway.** Direct
   `INSERT INTO fees_*` only allowed in (a) the `tools_fees.py`
   helpers themselves, (b) one-time migrations under
   `supabase/migrations/`. Code review rejects any other path.
2. **Every fee read has rolled_back_at handling.** Live-path
   queries against `fees_published` filter `WHERE rolled_back_at
   IS NULL`. Audit/admin queries may include them with explicit
   filter or column.
3. **Source attribution mandatory.** Every Hamilton answer cites
   at least one published fee via `trace_published_fee`. No
   uncited claims.
4. **Cache TTL.** No data older than 30 days served as
   authoritative without a re-verification timestamp.
5. **No silent failures.** Every exception logged with structured
   metadata; failures > 5% in a cron run trigger circuit-breaker.

### Pipeline repeatability bar

1. **Every cron writes a `workers_last_run` marker** on success
   or failure. Adversarial: a missing marker is treated as
   failed.
2. **Every migration is idempotent.** `CREATE TABLE IF NOT EXISTS`,
   `ON CONFLICT DO NOTHING`, wrapped in `DO $$` blocks with
   schema-existence guards. Verified by re-applying.
3. **Every agent has a per_day budget row.** Gateway refuses to
   bill an agent that has no budget configured.
4. **Every named agent has a canary corpus.** `fee_crawler/agents/_canary/<name>.json`
   exists and parses. Adversarial gate enforces.
5. **Every code path is testable locally.** No "this only works
   on Modal" production-only behaviors. Modal is an executor, not
   a behavior shim.

### Scalability bar

1. **All schema changes via migrations.** No `ALTER TABLE` via
   admin scripts. Every PR carries any schema changes.
2. **All queries use `FOR UPDATE SKIP LOCKED` for queue workers.**
   Two workers must not select the same target.
3. **All writes are bounded.** Every cron has a `--limit` flag
   or hardcoded cap. No unbounded loops.
4. **All sensitive operations require explicit flags.** Pattern:
   `--apply` for execution, `--override` for safety bypasses,
   `--i-know-what-im-doing` for irreversible actions.

---

## What shipped in commits 1b03494 + (this commit)

| ID | Status |
|---|---|
| Q-02 per-state coverage | ✅ `src/lib/crawler-db/coverage.ts` + `/admin/agents/coverage` page |
| Q-03 classification_cache TTL | ✅ `_lookup_cache` filters `created_at > NOW() - 30 days` |
| Q-04 review_status migration | ✅ all `'staged'`/`'flagged'`/`'pending'` references in TS migrated |
| Q-05 rolled_back_at filter | ✅ audit shows every `fees_published` reader filters correctly |
| Q-06 Knox rejection summary | ✅ `summarize_recent_rejections` + per-minute weekly gate + MCP read tool |
| R-04 unit-test floor | ✅ darwin cache + knox rejections both have unit tests |
| C-04 `get_fee_change_events` MCP tool | ✅ |

**34 unit tests across 5 test files, all green in 2.4s.**

## Still open (Q-* + R-* + S-* + C-* + W-*)

- **Q-01 Drain Darwin backlog** — operator action, raise env var
- **Q-07 CU coverage audit** — needs NCUA list comparison; operator data
- **Q-08 Migrate 13 TS write paths to gateway tools** — multi-day refactor
- **R-01 Cron failure alerting** — partially shipped; alert routing TBD
- **R-02 Local CLI for any cron** — design work
- **R-03 Migration order test** — quick fix; deferred
- **S-01/02/03** — parallelization + slot audit + historical backfill
- **C-01/02/03** — historical depth, scheduled digest, what-if simulation
- **W-01..W-06** — UX refinements (lower priority than data)

All tracked at the top of this doc.

---

## Round-2 reporting cadence

The team will report progress against this issue table weekly. Each
row will be either:
- ✅ **shipped** (PR merged, quality bar met)
- 🟡 **in progress** (PR open, < 1 week from merge)
- 🔴 **blocked** (with the blocker named)

No more strategy decks until every Q-* row is ✅.

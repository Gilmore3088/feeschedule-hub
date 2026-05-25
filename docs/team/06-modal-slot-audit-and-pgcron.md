# S-01 — Modal Cron Slot Audit + pg_cron Recommendation

**Owner:** CTO Marcus + Tech Architect Priya
**Closes:** Issue S-01 in `docs/team/05-product-focus.md`

## Today's slot inventory (Modal Starter — 5 slots, all used)

| Slot | Cron | Schedule (UTC) | What it does | Slot pressure |
|---|---|---|---|---|
| 1 | `run_discovery` | `0 2 * * *` | URL discovery (Playwright); now wrapped by `discoverer` agent shell | Low — single nightly run |
| 2 | `run_pdf_extraction` | `0 3 * * *` | PDF extraction via extractor agent (state-aware, gateway-audited) | Low — single nightly run |
| 3 | `run_browser_extraction` | `0 4 * * *` | Browser/JS-rendered extraction via extractor agent | Low — single nightly run |
| 4 | `run_post_processing` | `* * * * *` | **Every-minute dispatcher.** Runs 7 parallel tasks: agent ticks, Darwin inbox, review-tick, Knox summary, Hamilton digests, Atlas dispatch, pipeline health | **CRITICAL — this is the agentic loop** |
| 5 | `ingest_data` | `0 10 * * *` | Daily/weekly/quarterly FRED + NYFed + FDIC + NCUA + Beige Book ingest | Low — single multi-source run |

## Why slot 4 is the pivot

The every-minute dispatcher was the D-05 architectural decision (per
`modal_app.py:189`): instead of asking Modal for a sixth cron slot
(impossible on Starter), one minute-tick fans out to all the work
that would otherwise need its own slot. With the S-02 parallelization
shipped, the 7 tasks complete in roughly the time the slowest one
takes — typically <10s.

This is structurally sound for the next ~2× of agent additions. The
ceiling is when a single task takes longer than ~50s (leaves <10s
headroom for the others). Today the slowest is Atlas dispatch (2
states × 100 targets × ~0.5s per target ≈ ~1 minute peak); we'd
need to reduce per-tick batch size before adding more tasks.

## Stress points

| Risk | Manifestation | Mitigation |
|---|---|---|
| Atlas batch size growth | One slow tick → next tick overlaps before previous finishes; Modal may queue or skip | Reduce `states_per_tick` to 1; reduce `size_per_state` from 100 to 50 |
| Hamilton digest queue spike (post-marketing campaign) | 5 due/tick × 60min × 24h = 7,200 digests/day cap | Add a "digest priority" lane; or upgrade Modal tier for a 6th slot |
| Agent message bus latency | Currently polled (1-min); for sub-second handoffs we'd want LISTEN/NOTIFY | Sidecar Modal ASGI app running a long-lived listener (separate from cron slots) |

## pg_cron — should we migrate?

**pg_cron** is a PostgreSQL extension that runs cron jobs from inside
the database. Supabase supports it on paid tiers.

### Tradeoffs

| Aspect | Modal (today) | pg_cron |
|---|---|---|
| Slot limit | 5 (Starter) | Effectively unlimited |
| Job authoring | Python in `modal_app.py`; full agent SDK in scope | SQL only; HTTP webhook for non-SQL work |
| Logs / observability | Modal dashboard, structured logs | `cron.job_run_details` table |
| Cost | Bundled in Modal subscription | Bundled in Supabase Pro |
| Failure handling | Modal retries, our `_safe()` wrapper, `workers_last_run` markers | Job runs again on next interval; no built-in retry |
| Distributed locks | Modal's per-function isolation | Need to add advisory locks ourselves |
| Long-running work | Up to 6 hours per function | Designed for short SQL — bad fit for 6h crawls |
| Visibility into spend | `agent_budgets.spent_cents` (via our gateway) | Same — DB-level |

### Recommendation

**Keep Modal for the heavy crawl/extraction crons. Move only the
gate-check + administrative crons to pg_cron** (incremental
migration, no slot pressure).

Specifically, these would be reasonable pg_cron candidates:

- `pg_cron.schedule('cleanup_old_classification_cache_entries', '0 4 * * 0', 'DELETE FROM classification_cache WHERE created_at < NOW() - INTERVAL ''90 days''')` — pure SQL housekeeping; ~weekly
- `pg_cron.schedule('refresh_agent_health_rollup', '*/5 * * * *', 'SELECT refresh_agent_health_rollup()')` — admin UI refresh; no compute heavy enough to need Modal
- `pg_cron.schedule('reset_agent_budgets_daily', '0 0 * * *', 'UPDATE agent_budgets SET spent_cents = 0, window_started_at = NOW() WHERE budget_window = ''per_day''')` — currently we do per-tick aggregation; this would reset daily for cleaner accounting

**None of these are blocking today.** Listed as "consider in next 90
days as agent count grows" — defer until we have a concrete reason
to migrate (e.g., agent #20 and the per-minute task list outgrows
the 50s slot window).

## What we'd build if/when we migrate

1. **`scripts/pg-cron-bootstrap.sql`** — idempotent installer that
   creates the `cron` schema (if Supabase plan supports it) and
   schedules the migration-eligible jobs above.
2. **`/admin/agents/cron-health`** — small page reading
   `cron.job_run_details` and joining with `workers_last_run` so
   operators see both surfaces in one place.
3. **Migration runbook** — order of operations for moving a Modal
   cron to pg_cron without losing a day's run.

## Action items

- [x] Document current slot inventory + stress points (this doc)
- [x] Surface freshness via R-01 pipeline_health alerting
- [ ] Pre-commit to pg_cron when first crawl cron exceeds 50s p95
- [ ] Build the bootstrap SQL script (deferred — not blocking)

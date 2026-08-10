# pg-tests remediation — status & remaining work

**As of branch `claude/repo-operational-audit-x5uyvu`.**

`test.yml` (the `pg-tests` check) has been red on `main` for its entire history
(30/30 runs). This documents what was fixed and exactly what remains.

## Result

| | baseline (`main`) | now |
|---|---|---|
| Failing test nodes | **48** (36 failed + 12 errors) | **~18** |
| Passing | 432 | ~522 |

The pre-existing failures are **not** regressions from the engine work — a
`main`-vs-branch diff showed the 48 failures are identical on `main`. This branch
adds the engine suite (+65 passing) on top.

## Fixed this pass (safe, verified against real Postgres 16, committed)

1. **`promote_to_tier3` overload ambiguity** (a real production bug) — two
   overloads coexisted so 2-arg calls were "not unique". All production callers
   pass 3 args; added an idempotent migration dropping the redundant 2-arg form.
   → `supabase/migrations/20270101_dedupe_promote_to_tier3_overload.sql`
2. **Fresh-DB migration ordering** — several migrations ADD to / depend on a
   table a later-sorted migration CREATEs (`fees_published.batch_id` before
   `fees_published`; `agent_registry` update before its CREATE). `conftest.py`
   now applies `supabase/migrations` to a **fixpoint**.
3. **~30 individual test bugs** — `test_62b_migrations` (outdated all-q1
   assertion vs. darwin/magellan graduation), `test_review_dispatcher` (invalid
   `role='test'`), `test_backfill_and_freeze` (wrong migration paths, missing
   NOT-NULL seed cols, freeze kill-switch), `test_tools_agent_infra`
   (`budget_window` vs reserved `window`), `test_promote_to_tier3` /
   `test_lineage_graph` (`entity_id::TEXT` int binding), `test_knox_review_overrides`
   (jsonb param type inference), `test_tools_crawl` (seed cols).

## Remaining ~18 — each needs an owner decision, NOT a blind fix

### A. `user_id` type contract — schema drift (blocks ~8: `test_tools_hamilton`, `test_tools_peer_research`, and most Hamilton recipes in `test_sc2`)
The **tool layer treats `user_id` as a string** (`schemas/hamilton.py`:
`user_id: str`; tools compare `str(owner) != inp.user_id`) and the tests pass
`"user_test_1"`. The **migrated schema** makes those columns `INTEGER`/`BIGINT`
(FK to `users.id`) — and `report_jobs.user_id` is declared as **both** `uuid`
(hamilton_schema mirror) **and** `integer` (a later `ALTER`). These genuinely
disagree.
**Decision needed:** what is the canonical `user_id` type? If **text**, the
migrations that made it integer/uuid are the bug (fix schema). If **integer**,
the tool `schemas/*` and every string-user_id test are the bug (fix tools+tests
and seed `users` rows). Do not guess — it changes production tool behavior.

### B. `test_sc2_every_tool_writes_auth_log` — 17 tool recipes
Beyond the `user_id` ones, several tools insert rows missing NOT-NULL columns
(`fee_change_events.fee_category`, `jobs.entity_id`, `wave_runs.wave_size`,
`hamilton_reports.institution_id`, `hamilton_signals.title`,
`published_reports.report_type`, `articles.content_md`, `classification_cache.model`,
`external_intelligence.source_date`) or reference absent FK parents
(`fee_reviews.fee_id`, `crawl_results.crawl_target_id`, `institution_dossiers`).
Each is either the **SC2 recipe** under-seeding (test-side, safe) or the **tool**
omitting a required field (production-side). They must be triaged one-by-one
against the intended tool contract.

### C. `test_darwin_integration` / `test_magellan_integration` — 12 errors
Their `seeded_conn` / `magellan_seeded_conn` fixtures operate on the empty
`public` schema, and the agent code (`classify_batch`, `rescue_batch`) opens its
**own global pool** to `public`. Needs a **session-scoped `public` bootstrap**
(baseline + migrations) plus pointing the agents' pool at the test DSN. This is
shared mutable state across the suite — implement carefully so it doesn't
perturb the per-test `db_schema` tests. (An attempt to bootstrap a per-connection
schema was reverted because the agents' global pool bypasses it.)

### D. `test_sc5_budget_halt::test_sc5_env_var_halts_knox`
Asserts a `budget_halt` row is written when the env kill-switch is set; none is.
Needs a look at the budget-halt path under the test's env config (likely a
missing seed or an env var the test doesn't set in this harness).

## Recommendation
Land the ~30 fixes here (strictly better than `main`), then resolve A–D in a
dedicated PR once the `user_id` contract is decided. A is the linchpin: settling
it unblocks the bulk of B as well.

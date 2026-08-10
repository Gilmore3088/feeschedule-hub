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

### A. `user_id` type — RESOLVED as integer; fix is mechanical but security-sensitive (blocks ~8: `test_tools_hamilton`, `test_tools_peer_research`, and most Hamilton recipes in `test_sc2`)
The canonical type is **integer**, per the production source of truth — the
TypeScript DDL that actually creates these tables: `src/lib/hamilton/chat-memory.ts`
and `src/lib/hamilton/pro-tables.ts` both declare `user_id INTEGER NOT NULL`,
and the TS queries pass a numeric `userId`. So the **Python agent tools are the
drift**: `fee_crawler/agent_tools/schemas/hamilton.py` (and `peer_research.py`)
declare `user_id: str`, and the tests pass non-numeric strings (`"user_test_1"`)
that can never satisfy an integer FK to `users(id)`.

**The fix (determinate, but do it deliberately — it is user-scoped access
control):**
1. `schemas/hamilton.py` / `schemas/peer_research.py`: `user_id: str` →
   `user_id: int` (every occurrence).
2. Tool bodies: the ownership guards `if str(owner) != inp.user_id: raise
   PermissionError` become integer comparisons (`owner != inp.user_id`). **Review
   each of these carefully — they are the cross-user access checks.**
3. Regenerate `src/lib/agent-tools/types.generated.ts`
   (`bash scripts/codegen.sh agent-tool-types`) and commit; the drift guard will
   otherwise fail. This changes the agent→frontend contract (`user_id` becomes a
   number) — confirm frontend callers already pass numbers (they do in the TS).
4. Tests: replace string user_ids with integers and seed a `users` row per test.
5. Also resolve the `report_jobs.user_id` conflict (declared `uuid` in the
   hamilton_schema mirror but `integer` via a later `ALTER`) — pick integer to
   match the rest.

This was NOT force-changed in this session because it edits security-sensitive
user-scoping logic and the agent/frontend type contract — it deserves a review,
not a CI-driven auto-push.

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
**own global pool** to `public`.

**Two approaches were tried and reverted — do NOT repeat them:**
- Bootstrapping a **per-connection throwaway schema** — reverted: the agents'
  global pool bypasses the fixture connection, so it still hit an empty `public`.
- A **session-scoped `public` bootstrap** — empirically **regressed 11
  previously-passing `db_schema` tests** (`test_promote_to_tier3` ×7,
  `test_rollback_publish` ×2, `test_lineage_graph`, `test_knox_review_overrides`):
  a populated `public` collides with the per-test schemas that use
  `search_path = "<schema>, public"`. Full suite went 19 → 25 failures. Reverted.

**What will actually work:** give the agents' global pool its **own dedicated,
isolated schema** for the duration of these tests (e.g. a fixture that creates a
throwaway schema, bootstraps it, and sets `server_settings.search_path` on the
`fee_crawler.agent_tools.pool` pool to that schema — NOT public), and tear it
down after. Then the 4 that already pass stay green and the remaining 8 are
genuine agent-logic assertions (`circuit_tripped`, `rescue_batch` ladder
outcomes) to be triaged against the agent internals.

### D. `test_sc5_budget_halt::test_sc5_env_var_halts_knox`
Asserts a `budget_halt` row is written when the env kill-switch is set; none is.
Needs a look at the budget-halt path under the test's env config (likely a
missing seed or an env var the test doesn't set in this harness).

## Recommendation
Land the ~30 fixes here (strictly better than `main`), then resolve A–D in a
dedicated PR once the `user_id` contract is decided. A is the linchpin: settling
it unblocks the bulk of B as well.

# Legacy → Agentic Pipeline Cutover

Plan to retire `extracted_fees` + `state_agent._write_fees` and route every
fee write through the agent gateway into `fees_raw` / `fees_verified` /
`fees_published`. Companion to `docs/AUDIT-2026-05-24.md`.

## What landed in this commit

| Change | File | Effect |
|---|---|---|
| New extractor agent | `fee_crawler/agents/extractor/{__init__,config,orchestrator}.py` | Mirrors Magellan's structure; selects candidates, downloads, extracts via LLM, writes via `create_fee_raw` (agent gateway → `fees_raw`). Heavy deps lazy-imported so the module loads in slim envs. |
| Unit tests | `fee_crawler/tests/test_extractor_unit.py` | 10 tests, all mocking the heavy pieces. `pytest fee_crawler/tests/test_extractor_unit.py` → 10 passed in 0.2s. |
| 3am cron swap | `fee_crawler/modal_app.py` (`run_pdf_extraction`) | Was: `subprocess(["python3","-m","fee_crawler","crawl",...])` → `extracted_fees` (frozen). Now: `await extract_batch(conn, size=500, doc_type="pdf")` → `fees_raw`. |
| 4am cron swap | `fee_crawler/modal_app.py` (`run_browser_extraction`) | Same swap, both doc types. |
| Manual HTTP trigger | `fee_crawler/modal_app.py` (`extract_batch_endpoint`) | New POST endpoint for ad-hoc batch extraction (replaces the previous "kick the cron" pattern). |
| Deprecation warning | `fee_crawler/agents/state_agent.py:_write_fees` | `DeprecationWarning` raised; behavior unchanged so existing callers don't break mid-cutover. |
| Deprecation warning | `fee_crawler/commands/merge_fees.py:merge_institution_fees` | Same. |
| Agent registration | `supabase/migrations/20260525_extractor_agent_registry.sql` | Inserts `extractor` into `agent_registry` + seeds `per_day` ($10) and `per_batch` ($5) budgets. Required before first cron run — gateway rejects unregistered agents. |
| Sample TS migration | `src/app/api/health/route.ts` | Reads from `fees_raw / verified / published` tiers instead of `extracted_fees`. Demonstrates the read-side migration pattern. |

## What did NOT change (intentional)

- `fee_crawler/commands/crawl.py` — the CLI `crawl` subcommand still exists,
  still writes through `merge_fees.py`. It'll fail against the freeze
  trigger unless the user explicitly sets the kill-switch. Marked
  deprecated; deletion deferred to the next phase.
- `fee_crawler/agents/state_agent.py:run_state_agent` and `_write_fees`
  — still callable, still wired into `wave/orchestrator.py`,
  `commands/probe_urls.py`, `commands/reextract_incomplete.py`, the
  loose `_run_states.py` / `_run_il_3x.py` scripts, and Modal endpoints
  `extract_single` and `run_state_agent`. Marked deprecated.
- `src/lib/fee-actions.ts` — 13 admin-UI write paths that use
  `SET LOCAL app.allow_legacy_writes='true'` to bypass the freeze
  trigger. Migrating these requires new agent tools for manual
  approve/reject/categorize/edit (multi-day effort) AND coordinating UI
  changes. Not safe to touch in a one-shot pass.
- 30+ TS read paths in `src/lib/crawler-db/*` and `src/app/admin/*`.
  Migrating these requires understanding which tier (`fees_published`
  for stable, `fees_verified` for in-flight) each report should read.
  See "Phase 3" below.
- 13 test files that exercise `extracted_fees` / `state_agent`. They
  pass against the current schema; updating them is part of Phase 4.

## Cutover phases

### Phase 1 — DONE (this commit)

- New extractor agent in place
- Modal crons switched
- HTTP trigger available
- Deprecation warnings live
- Agent registry seeded

### Phase 2 — single-target HTTP path (1-2 hours)

`extract_single` (`modal_app.py:553`) still routes through legacy. Build
`extract_single_agentic` that takes a `target_id`, picks just that
target, runs the same extractor code path with `size=1`. Update any
in-product "extract now" buttons to call the new endpoint.

### Phase 3 — TS reader migration (2-3 days)

For each of the 30+ files in `src/lib/crawler-db/*` and `src/app/`:

1. Decide: does this query want **published** (stable index) or
   **verified** (latest data, possibly unpublished)? Most public-facing
   reads → `fees_published`. Most admin queues → `fees_verified`.
2. Map columns (e.g., `extracted_fees.review_status` → derive from
   tier: rows in `fees_published` are inherently "approved").
3. Update the query + the consuming component's shape.
4. Add a regression test for the new query.

Order of attack (by user impact):
- `src/app/api/v1/index/route.ts` (public API; high blast radius)
- `src/lib/crawler-db/fee-index.ts`, `peers.ts`, `market.ts`
  (dashboards)
- `src/lib/crawler-db/institution.ts`, `dashboard.ts`
- `src/app/admin/query/query-client.tsx` (9 hardcoded queries; easy
  bulk swap)
- `src/app/account/welcome/page.tsx` (1 query)
- `src/app/api/reports/institution/[id]/route.ts`,
  `src/app/api/reports/msa/[code]/route.ts` (report assemblers)

### Phase 4 — admin UI write migration (5-10 days)

`src/lib/fee-actions.ts` has 13 write paths. Each needs:

1. A new gateway-wrapped tool in `fee_crawler/agent_tools/tools_fees.py`
   (e.g., `approve_fee_verified`, `reject_fee_verified`, `recategorize_fee_verified`).
2. A new Next.js server action that calls the tool via the agent
   messaging bus or a direct asyncpg call inside the action.
3. UI updates so "approve" / "reject" / "edit amount" operate on
   `fees_verified` rows, not `extracted_fees`.

Defer until Phase 3 is far enough along that the admin UI can read from
new tables. Otherwise approving a fee writes to one place but the UI
reads from another.

### Phase 5 — remove legacy code (1 day, after a soak)

After at least 2 weeks of green Phase 1-4:

- Delete `fee_crawler/agents/state_agent.py` (the legacy extractor).
- Delete `fee_crawler/commands/merge_fees.py`.
- Delete `_run_states.py`, `_run_il_3x.py`, `_run_states_original.py`
  from the repo root.
- Delete `fee_crawler/commands/probe_urls.py` and
  `fee_crawler/commands/reextract_incomplete.py` (or rewrite to use the
  extractor agent).
- Strip the `cmd_crawl` CLI subcommand from `__main__.py`.
- Strip `merge_institution_fees` calls from `commands/crawl.py`.
- Drop the 13 test files that exercise the legacy path (or rewrite
  them).
- Drop `fee_crawler/wave/orchestrator.py` (or rewrite to drive
  extractor agent instead of state_agent).

### Phase 6 — table cleanup (operator-supervised)

After everything reads from `fees_published`:

```sql
-- 1. Snapshot first (in case rollback needed)
CREATE TABLE _extracted_fees_archive AS SELECT * FROM extracted_fees;
-- 2. Drop the freeze trigger
DROP TRIGGER IF EXISTS extracted_fees_freeze ON extracted_fees;
DROP FUNCTION IF EXISTS _block_extracted_fees_writes();
-- 3. Drop the table
DROP TABLE extracted_fees;
-- 4. Drop the kill-switch GUC reference (purely cosmetic at this point)
```

This is irreversible without restoring the archive. Wait at least 90
days after Phase 5 to give downstream tools / saved queries time to
break visibly.

## Operator needs

To deploy Phase 1 (this commit):

1. **Apply the agent-registry migration** in prod:
   ```bash
   set -a; . ./.env.local; set +a
   node scripts/apply-migration.mjs 20260525_extractor_agent_registry.sql
   ```
   The Tier-2 dedup migration shipped in the prior commit
   (`20260525_fees_verified_dedup.sql`) should also be applied (it
   safely aborts if existing duplicates would violate the index).

2. **Deploy Modal** with the new bootstrap:
   ```bash
   bash scripts/modal-deploy.sh
   ```
   This requires `bfi-secrets` to contain `ANTHROPIC_API_KEY` and the
   other 9 keys (`DATABASE_URL`, `R2_*`, `FRED_API_KEY`, `BFI_APP_URL`,
   `REPORT_INTERNAL_SECRET`, `REPORT_CRON_SECRET`). The script
   validates them before deploy.

3. **Verify the agent registered**:
   ```bash
   psql "$DATABASE_URL" -c "SELECT agent_name, is_active FROM agent_registry WHERE agent_name = 'extractor';"
   ```
   Should return one row, `is_active=true`.

4. **Smoke-test the manual trigger** with a small batch BEFORE waiting
   for the 3am cron:
   ```bash
   curl -X POST "$(modal url bank-fee-index-workers extract_batch_endpoint)" \
        -H "Content-Type: application/json" \
        -d '{"size": 10, "document_type": "pdf", "include_failing": false}'
   ```
   Expected: `{"ok": true, "processed": <≤10>, "fees_written": <int>, "failed": <int>, ...}`.
   Confirm new rows appear in `fees_raw` and `agent_events` (each fee
   write produces one `agent_events` row + one `agent_auth_log` row).

5. **Watch the first 3am cron run** in the Modal dashboard. The new
   logs will be `extract_batch` result dicts instead of subprocess
   stdout tails.

## Known gaps to resolve in Phase 2+

- **No per-target HTTP path** — `extract_batch_endpoint` operates on the
  whole pool. A `target_id` selector is needed for "extract now" UX
  buttons. (Phase 2.)
- **No reasoning storage to R2 yet** — gateway's
  `_upload_reasoning_to_r2` exists for payloads >8KB, but the
  extractor's reasoning is short JSON, so it goes inline. If we capture
  the LLM prompt+response verbatim later (for audit), this kicks in.
- **No circuit breaker on the extractor itself** — Magellan has one
  (`agents._common.circuit.CircuitBreaker`). Should the extractor halt
  after N consecutive download failures? Probably; track as Phase 2
  follow-up.
- **No idempotency check** — `select_candidates` filters on "no fees_raw
  newer than 30 days," but two parallel runs in the same minute would
  still both pick a target (the `FOR UPDATE SKIP LOCKED` row-level lock
  prevents that). Confirm by load-testing once deployed.
- **No metric for "how many targets remain"** — operators will want a
  dashboard query: `SELECT COUNT(*) FROM crawl_targets ct LEFT JOIN
  LATERAL (SELECT MAX(created_at) AS latest FROM fees_raw WHERE
  institution_id = ct.id) r ON TRUE WHERE ct.fee_schedule_url IS NOT
  NULL AND (r.latest IS NULL OR r.latest < NOW() - INTERVAL '30 days')`.
  Could be added to `/api/health` or as its own endpoint.

## Rollback

If Phase 1 misbehaves:

```bash
git revert <this-commit>
bash scripts/modal-deploy.sh  # redeploys old cron bodies
```

The agent-registry insert is `ON CONFLICT … DO UPDATE`-style, so it's
idempotent forward but doesn't auto-revert. If you need to remove the
extractor agent:

```sql
DELETE FROM agent_budgets WHERE agent_name = 'extractor';
DELETE FROM agent_registry WHERE agent_name = 'extractor';
```

`fees_raw` rows written by the new pipeline are harmless to leave (they
won't surface anywhere until reads migrate in Phase 3).

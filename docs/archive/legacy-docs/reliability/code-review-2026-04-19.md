# Code Review — 19 commits landed 2026-04-19

Reviewer: Senior Code Reviewer (automated sweep)  
Scope: `git log 3224971..HEAD` — 19 production-facing commits + checkpoint/docs  
Focus: Runtime safety, auth boundaries, SQL integrity, backward compat, cache correctness, migration ordering, production blast radius.

---

## Summary

| Severity | Count |
|---|---:|
| BLOCKER | 2 |
| MAJOR | 5 |
| MINOR | 7 |
| NIT | 3 |

**Recommendation:** Do NOT let the 05:00 UTC dispatcher run autonomously against production tomorrow without addressing the two BLOCKER findings. One of them (migration order) depends on which order the DB operator ran migrations today — it may already be producing runtime errors on Knox override and on the `test_promote_to_tier3` 2-arg test path.

---

## BLOCKER findings

### BLOCKER-1 — Migration filename order collides with intended apply order; produces either an ambiguous function overload or a broken knox-override action, depending on which order was actually used in prod

- Files:
  - `supabase/migrations/20260420_promote_to_tier3_batch_id.sql:35-139`
  - `supabase/migrations/20260420_promote_to_tier3_tighten_search.sql:55-154`
  - `scripts/apply-migration.mjs:47-52` (sorts alphabetically)
  - Callers still using 2-arg shape:
    - `src/app/admin/agents/knox/reviews/actions.ts:194`
    - `fee_crawler/tests/test_promote_to_tier3.py:164`
    - `fee_crawler/tests/test_lineage_graph.py:315, 356`
    - `fee_crawler/tests/test_knox_review_overrides.py:157`

```sql
-- batch_id migration:
DROP FUNCTION IF EXISTS promote_to_tier3(BIGINT, UUID);
CREATE OR REPLACE FUNCTION promote_to_tier3(BIGINT, UUID, TEXT DEFAULT NULL) ...

-- tighten_search migration:
CREATE OR REPLACE FUNCTION promote_to_tier3(BIGINT, UUID) ...  -- 2-arg form
```

Both files carry the same `20260420_` prefix. `scripts/apply-migration.mjs --pending` sorts file names alphabetically and applies in that order. Alphabetical order puts `batch_id` BEFORE `tighten_search`. This is the OPPOSITE of the intended order (the batch_id header explicitly documents "re-tightened in 20260420_promote_to_tier3_tighten_search.sql" — treating tighten_search as already applied).

Two possible end states depending on the actual order you ran them:

1. **Alphabetical (what `--pending` does):**
   - After batch_id: only the 3-arg form exists.
   - After tighten_search: the 3-arg form PLUS a freshly-created 2-arg form both exist.
   - Calling `promote_to_tier3(x, y)` (2 args) is **AMBIGUOUS** — PostgreSQL dispatches to "two candidate functions" and raises `function promote_to_tier3(bigint, uuid) is not unique`.
   - Impact: every test in `test_promote_to_tier3.py` that uses the 2-arg shape fails; `src/app/admin/agents/knox/reviews/actions.ts:194` fails at runtime the first time an analyst clicks "Override & promote"; `test_lineage_graph.py` fails; `test_knox_review_overrides.py:157` fails.

2. **Intended order (manual, tighten_search first then batch_id):**
   - After tighten_search: only the 2-arg form exists.
   - After batch_id: `DROP FUNCTION IF EXISTS promote_to_tier3(BIGINT, UUID)` removes the 2-arg form and creates the 3-arg form with `DEFAULT NULL`.
   - Calling `promote_to_tier3(x, y)` dispatches to the 3-arg form via the default — works correctly.

Given alphabetical sort is the default, **if the operator used `--pending`, production is currently in state 1** and knox-override is broken. If the operator applied manually in commit-timestamp order, production is in state 2 and everything works — but a fresh CI/staging rebuild will produce state 1 and fail.

**Fix:** Either
- Rename the tighten_search file to something that sorts BEFORE batch_id (e.g. `20260420a_promote_to_tier3_tighten_search.sql` and `20260420b_promote_to_tier3_batch_id.sql`), re-record both in `schema_migrations` after the rename, OR
- Fold both migrations into a single file that DROPs all overloads and creates exactly the 3-arg form, OR
- Change `apply-migration.mjs` to honor a manifest file ordering instead of alphabetical.

Verification step: run `SELECT proname, pg_get_function_identity_arguments(oid) FROM pg_proc WHERE proname='promote_to_tier3'` against prod. Expect exactly one row, 3-arg form.

### BLOCKER-2 — `fees_published` queries that back the admin pipeline dashboard and Hamilton's benchmark tool do NOT filter `rolled_back_at IS NULL`; the rollback migration's own documentation mandated this filter

- Files:
  - Migration: `supabase/migrations/20260419_fees_published_rollback.sql:36-37`
  - Call sites missing the filter:
    - `src/lib/admin-queries.ts:486-489` (`getPipelineMap`)
    - `src/lib/crawler-db/agent-console.ts:220-229` (`listRecentPublishedFees`)
    - `fee_crawler/agent_mcp/tools_read.py:60-89` (`get_fee_benchmark` — Hamilton tool)

```ts
// src/lib/admin-queries.ts:486
const [publishNow] = await sql`SELECT COUNT(*)::int AS n FROM fees_published`;
const [publish24h] = await sql`
  SELECT COUNT(*)::int AS n FROM fees_published WHERE created_at > NOW() - INTERVAL '24 hours'
`;
```

The rollback migration explicitly says: "Live queries MUST filter rolled_back_at IS NULL" (line 37). Today, with zero rolled-back rows, this is latent. The moment someone runs `python -m fee_crawler rollback-publish --batch-id X --execute` to fix a bad drain, rolled-back rows immediately begin polluting:

- The admin `/admin/pipeline` dashboard publish counts (overstate)
- Hamilton's `get_fee_benchmark` tool medians/P25/P75 (which are the core product output — reports will cite rolled-back fees as live data)
- The `listRecentPublishedFees` feed on the agent console

Separately, `src/lib/admin-queries.ts:488` references `created_at` on `fees_published` — the table has no `created_at` column, only `published_at` (`20260420_fees_tier_tables.sql:90`). This is a pre-existing bug (introduced in 99291b8), but it will surface the next time the pipeline dashboard loads; flagging for awareness even though it pre-dates the review window.

**Fix:**
1. Add `WHERE rolled_back_at IS NULL` (or `AND`) to every SELECT that drives user-visible numbers.
2. Change `admin-queries.ts:488` from `created_at` to `published_at`.
3. Backstop: add a partial view `fees_published_live AS SELECT * FROM fees_published WHERE rolled_back_at IS NULL` and grep the codebase to replace `FROM fees_published` with `FROM fees_published_live` for any query that is not forensic/audit.

---

## MAJOR findings

### MAJOR-1 — Hardcoded Modal URLs as fallbacks break silently on redeploy under a different app name

- Files:
  - `src/app/api/extract/route.ts:6-8`
  - `src/app/api/admin/darwin/stream/route.ts:7-9`
  - `src/app/admin/coverage/actions.ts:9-11`

```ts
const SIDECAR =
  process.env.DARWIN_SIDECAR_URL ??
  "https://gilmore3088--bank-fee-index-workers-darwin-api.modal.run";
```

Modal's generated URL is `<workspace>--<app-name>-<function-name>.modal.run`. If the Modal workspace ("gilmore3088"), app name ("bank-fee-index-workers"), or function name ("darwin-api") changes, these fallbacks route to a 404 host. The route code has try/catch and falls through to the degraded stream — so the admin console will just silently show "sidecar unreachable" with zero events forever. The correct fix (per the Vercel-landmine commit's own intent) is to REQUIRE the env var and fail loudly on unset. A hardcoded fallback is an anti-pattern for infra URLs.

**Fix:** Either fail fast on missing env (log once + 503) or add a daily canary that pings the URL and alerts if it 404s. Document the env var in the Vercel deploy runbook so nobody forgets to set it.

### MAJOR-2 — Knox override path writes a human-attested `knox 'accept'` agent_messages row even when Darwin has not yet posted, creating the "cross-correlation grandfather" scenario the tightened handshake was supposed to make rare

- File: `src/app/admin/agents/knox/reviews/actions.ts:152-169`

```ts
// Write a human-attested knox 'accept' so the 62b V4 handshake check
// in promote_to_tier3 passes.
await tx`
  INSERT INTO agent_messages (sender_agent, recipient_agent, intent, state,
                              correlation_id, payload, round_number)
  VALUES ('knox', 'darwin', 'accept', 'resolved', ${correlationId}, ...)
`;
```

The knox 'accept' is posted under the ORIGINAL rejection's `correlation_id`. If Darwin later posts its own 'accept' under a DIFFERENT correlation_id (very likely — Darwin generates new correlation_ids per classify run), the tightened preferred-path query won't match (no shared correlation), and promotion will only succeed via the **grandfather path** — which raises `RAISE NOTICE`. That's NOT an error, but:

1. Every override will emit the grandfather NOTICE forever (not just for legacy data).
2. The plan to drop the grandfather clause after 2026-05-20 (documented in `tighten_search.sql:34`) would silently break every future Knox override.

**Fix:** Have the Knox override action SEARCH for an existing darwin 'accept' on this `fee_verified_id` first; if found, reuse its `correlation_id`. If not, either (a) refuse and wait for Darwin (current UI message already says this is possible), or (b) insert a placeholder that the next Darwin pass will match by correlation_id rather than by fee_verified_id.

### MAJOR-3 — Knox badge cache has a race on first populate under concurrent requests; also has no upper cap on cache populate failure behavior

- File: `src/lib/crawler-db/knox-reviews.ts:86-140`

```ts
const CACHE_TTL_MS = 30_000;
let _knoxCountsCache: { value: KnoxReviewCounts; expiresAt: number } | null = null;

export async function getKnoxReviewCounts(): Promise<KnoxReviewCounts> {
  const now = Date.now();
  if (_knoxCountsCache && _knoxCountsCache.expiresAt > now) {
    return _knoxCountsCache.value;
  }
  try { ... rows ... _knoxCountsCache = { value: counts, expiresAt: now + CACHE_TTL_MS };
  } catch (e) { console.error(...); return { pending:0,... }; }
}
```

Three problems:
1. **Thundering herd on cold cache.** Every request that arrives in the first 30s races to populate. Admin layout renders hit this once per page render. Not a crash, just wasted DB calls until one wins — fine in practice but worth documenting.
2. **Catch returns all-zero counts without caching them.** If the DB blips for even one request, that request gets all zeros. The next request retries — which is the right behavior, but users may see the "pending" count flap from N → 0 → N on a transient error.
3. **No cache-busting on migration.** In a Vercel Edge runtime, each function instance has its own `_knoxCountsCache`. `clearKnoxReviewCountsCache()` is a no-op on any OTHER instance — so after a confirm/override, other instances still show the stale badge until their TTL expires. Not technically incorrect (TTL < 30s), but the "explicit invalidation" branding in the commit message overstates this.

**Fix:** Accept the per-instance staleness as the design, update the doc comment to say "best-effort cross-instance invalidation bounded by TTL." For the cold-cache race, a promise-dedupe (`_knoxCountsCachePromise`) is 5 lines.

### MAJOR-4 — `darwin-drain` piggyback inside `run_post_processing` swallows per-batch errors and keeps marching; no circuit breaker on repeated Darwin LLM failures

- File: `fee_crawler/modal_app.py:342-363`

```py
if not _already_ran("darwin_drain"):
    try:
        ...
        for i in range(5):
            result = await classify_batch(conn, size=500)
            summary = result.to_dict()
            ...
            if classified == 0: break
    except Exception as exc:
        print(f"darwin_drain failed (non-fatal): {exc}")
        _mark_ran("darwin_drain", "failed")
```

A single failure during any of the five 500-row batches aborts the whole drain, but the ERROR gets "non-fatal"'d — only surfacing via `print` in Modal logs. Five batches × 500 rows × potentially 1 Anthropic call each = up to 2,500 API calls. If the classifier is producing malformed JSON the catch swallows each symptom, and tomorrow at 05:00 UTC it just retries fresh, potentially burning daily budget. The `daily_cost_limit_cents` circuit breaker in Hamilton (`src/app/api/research/hamilton/route.ts:22-23`) is NOT applied here.

**Fix:** Gate the drain on a daily Darwin spend counter (even a simple in-DB `workers_last_run`-shaped cost row). If the prior day's drain hit failure-without-success, exit with status "degraded" and require an operator reset — same pattern as Magellan's `halted: true` circuit.

### MAJOR-5 — `revalidate_urls._apply_fixes` does an unbounded `UPDATE … WHERE id = ANY(%s::bigint[])` with no batch size

- File: `fee_crawler/commands/revalidate_urls.py:425-447`

```py
def _apply_fixes(candidates: list[ProbeResult]) -> int:
    ids = [r.target_id for r in candidates]
    if not ids: return 0
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            "UPDATE crawl_targets SET fee_schedule_url = NULL "
            "WHERE id = ANY(%s::bigint[]) AND fee_schedule_url IS NOT NULL",
            (ids,),
        )
        affected = cur.rowcount
        conn.commit()
```

The first `--fix` run cleared 27 rows — tiny. But the dry-run report structure is unbounded and could easily surface 500+ hard-404s if a major hosting provider drops coverage. An unbounded UPDATE in a single transaction holds row locks and may conflict with the nightly crawl. It's also not restartable — if the update is killed halfway it rolls back entirely.

**Fix:** Chunk to 100 IDs per commit. Log chunk progress. If the crawl cron is running, this also relieves lock-wait pressure.

---

## MINOR findings

1. **`src/app/admin/agents/knox/reviews/review-actions.tsx:55` uses `prompt()`** for the override note. Blocks main thread on mobile, inaccessible, loses input if user misses the OK/Cancel dialog. Replace with a proper modal textarea within the next UI pass.

2. **`src/lib/hamilton/citation-gate.ts:267`** divides `citations / claims` without guarding `claims === 0` at the division site (the guard is correct above it), so TypeScript reports NaN-safety correctly but the metric hashed into the response shape reports `density: 0` when `claims === 0`. This is the design intent per the suggestion text but reads oddly at a glance. Add a comment.

3. **`src/lib/crawler-db/knox-reviews.ts:199, 233`** injects `statusClause` via `sql.unsafe()`. The value is from a whitelist `reviewStatusClause()` so it's safe, but the pattern is error-prone: a future refactor that accepts user input for `filter` without re-whitelisting would open SQL injection. Use the postgres.js `sql` template literal interpolation instead (e.g. parameterize via `sql.CASE` or branch at the JS level).

4. **`fee_crawler/__main__.py:1188`** the argparse help for `revalidate-urls --fix` still says `"(BLOCKED) placeholder for future DB write path"` — but the flag is now fully wired (commit 52c907d). Stale help text.

5. **`fee_crawler/commands/darwin_drain.py:44`** opens `asyncpg.connect(os.environ["DATABASE_URL"])` — if the env is unset, this raises `KeyError`, which exits non-zero but without a friendly message. The modal piggyback at `modal_app.py:345` does the same.

6. **`src/app/opengraph-image.tsx:80`** hardcodes "8,000+ banks and credit unions" in the OG share card. The MEMORY.md says 4,000+ elsewhere. Pick one and make it a constant sourced from a dashboard query so it doesn't drift.

7. **`fee_crawler/commands/rollback_publish.py:135`** does `row['fee_name'][:40]!r`. If `fee_name` is ever NULL in `fees_published` (it's `NOT NULL` today, but the column constraint is trusting — no defensive check), this throws `TypeError`. Harden with `(row['fee_name'] or '')[:40]`.

---

## NIT findings

1. `fee_crawler/modal_app.py:170-184` has duplicate timezone arithmetic between the 0500 and 0600 windows — factor out `_within_window(now, hour, window_minutes=10)`.

2. `src/lib/crawler-db/knox-reviews.ts:157` hardcodes `const PAGE_SIZE = 25;` separate from `pageSize: 25` default on line 186. Consolidate.

3. `supabase/migrations/20260419_knox_review_overrides.sql:47-51` creates two indexes on `rejection_msg_id` — the non-unique `knox_overrides_rejection_msg_idx` at line 47 is redundant with the unique index at line 57. Drop the non-unique one.

---

## Cross-cutting observations

### Auth boundaries — PASS
Every new API route and server action correctly gates on `getCurrentUser()` / `requireAuth()`:
- `/api/extract/route.ts:11-14` admin+analyst
- `/api/admin/darwin/stream/route.ts:30-33` admin
- `/admin/coverage/actions.ts:13-16` admin
- knox-reviews confirmRejection/overrideRejection — `requireAuth("approve")`

No new surface trusts client input without validation.

### SQL integrity — MIXED
- Migrations use `IF NOT EXISTS` correctly for tables and indexes. 
- Missing `DROP FUNCTION IF EXISTS` guard on the 2-arg tighten_search would collide with an existing 3-arg overload — see BLOCKER-1.
- The `knox_overrides_rejection_msg_unique` UNIQUE INDEX + the FK `REFERENCES agent_messages(message_id)` provides strong idempotency on double-click overrides. Good.
- Partial expression index `agent_messages_accept_fee_verified_idx` is well-scoped and matches the query planner's likely path.

### Backward compatibility — MIXED
- `promote_to_tier3(bigint, uuid)` → `(bigint, uuid, text)` is compatible AS LONG AS migration order is correct (see BLOCKER-1).
- The 2-arg form's body DOES NOT insert batch_id. Knox override's 2-arg call will therefore produce `batch_id=NULL` rows even when the 3-arg form could have tagged them. Rollback by batch_id will silently miss knox-overridden rows — acceptable if documented, dangerous otherwise.

### Injection / XSS — PASS
No `dangerouslySetInnerHTML` in new files. React escapes all interpolated values. SQL is parameterized via postgres.js tagged templates, with the one `sql.unsafe` usage being from a whitelisted string (see MINOR-3).

### Cache correctness — see MAJOR-3

### Migration ordering — see BLOCKER-1

### Production blast radius — MIXED
- Darwin drain: 5×500 = 2,500 classifications/day. At Haiku rates (~$0.0001/classification per config), ~$0.25/day. Survivable. But see MAJOR-4 on missing circuit breaker.
- Knox review: 500/day. Mid-cost. No guardrails against LLM cost overrun — inherits whatever Knox already has.
- Magellan rescue: 200/day, unchanged.
- No hot loops that could spiral; the minute-dispatcher is throttled by `workers_last_run` markers.

### Magic URLs — see MAJOR-1

### Dead code / scope creep — NIT
- `fee_crawler/commands/darwin_drain.py` is redundant with the `_run_0500_jobs` inline block in `modal_app.py:336-363` (same logic, re-implemented). Not a bug, but one should call the other so they don't drift.

---

## Files reviewed

- `supabase/migrations/20260419_fees_published_rollback.sql`
- `supabase/migrations/20260419_knox_review_overrides.sql`
- `supabase/migrations/20260420_agent_messages_accept_payload_idx.sql`
- `supabase/migrations/20260420_promote_to_tier3_batch_id.sql`
- `supabase/migrations/20260420_promote_to_tier3_tighten_search.sql`
- `fee_crawler/modal_app.py` (piggyback expansion)
- `fee_crawler/commands/darwin_drain.py`
- `fee_crawler/commands/publish_fees.py` (batch_id wiring)
- `fee_crawler/commands/revalidate_urls.py`
- `fee_crawler/commands/rollback_publish.py`
- `fee_crawler/agent_tools/tools_fees.py` (3-arg thread)
- `fee_crawler/agent_mcp/tools_read.py` (Hamilton benchmark queries)
- `fee_crawler/__main__.py` (revalidate-urls --fix unblock)
- `src/app/api/extract/route.ts`
- `src/app/api/admin/darwin/stream/route.ts`
- `src/app/admin/coverage/actions.ts`
- `src/app/admin/agents/knox/reviews/page.tsx`
- `src/app/admin/agents/knox/reviews/[id]/page.tsx`
- `src/app/admin/agents/knox/reviews/actions.ts`
- `src/app/admin/agents/knox/reviews/review-actions.tsx`
- `src/app/admin/agents/knox/reviews/keyboard-nav.tsx`
- `src/app/admin/page.tsx` (leads widget)
- `src/app/api/research/hamilton/route.ts` (citation gate)
- `src/app/opengraph-image.tsx`, `src/app/twitter-image.tsx`
- `src/lib/admin-queries.ts`
- `src/lib/crawler-db/knox-reviews.ts`
- `src/lib/hamilton/citation-gate.ts`
- `scripts/apply-migration.mjs`

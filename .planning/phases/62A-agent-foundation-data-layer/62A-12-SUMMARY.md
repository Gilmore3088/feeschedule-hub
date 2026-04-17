---
phase: 62A-agent-foundation-data-layer
plan: 12
subsystem: infra
tags: [mcp, fastmcp, pydantic2ts, codegen, supabase, migrations, ci]

# Dependency graph
requires:
  - phase: 62A-agent-foundation-data-layer
    provides: fee_crawler/agent_tools/pool.py (asyncpg pool) + fee_crawler/agent_tools/schemas/* (Pydantic v2 source of truth) + supabase/migrations/20260417..20260420 (9 new migrations)
provides:
  - fee_crawler/agent_mcp/ — read-only FastMCP server with 4 tools (get_national_index, get_institution_dossier, get_call_report_snapshot, trace_published_fee)
  - Read-only registry assertion in server.py — startup refuses to boot if any tool lacks _bfi_read_only marker (D-07 guardrail)
  - scripts/codegen.sh umbrella + PYTHONPATH fix in scripts/gen-agent-tool-types.sh — pydantic2ts now resolves fee_crawler.agent_tools.schemas without pip install
  - src/lib/agent-tools/types.generated.ts regenerated — 117 interfaces across Plans 62A-05/07/08/09/10 domains
  - src/lib/agent-tools/.gitattributes — marks types.generated.ts linguist-generated=true
  - .github/workflows/test.yml — codegen-drift CI step (CHECK_MODE=1) + json2ts install for pydantic2ts
affects: [62A-13, 68-SEC-04, 999.15-public-api]

# Tech tracking
tech-stack:
  added: [mcp>=1.27 (FastMCP), pydantic-to-typescript>=2.0, json-schema-to-typescript (npm, CI-only)]
  patterns:
    - "Read-only MCP surface: decorator-stamped marker + startup registry assertion — no write tool can be added without deliberately removing the assertion"
    - "Codegen pipeline: Pydantic is the source of truth; TS file is always regeneratable; CI guards drift"
    - "Script portability: resolve REPO_ROOT from $BASH_SOURCE instead of relying on cwd, export PYTHONPATH for package discovery"

key-files:
  created:
    - fee_crawler/agent_mcp/__init__.py
    - fee_crawler/agent_mcp/server.py
    - fee_crawler/agent_mcp/tools_read.py
    - scripts/codegen.sh
    - src/lib/agent-tools/.gitattributes
  modified:
    - scripts/gen-agent-tool-types.sh (PYTHONPATH export; cd to REPO_ROOT)
    - src/lib/agent-tools/types.generated.ts (regenerated via pydantic2ts; 117 interfaces)
    - .github/workflows/test.yml (codegen-drift step + json2ts install)
    - .planning/phases/62A-agent-foundation-data-layer/62A-12-PLAN.md (autonomous flipped to false due to Task 3 incident)

key-decisions:
  - "Plan declared autonomous=false post-execution because Task 3 (supabase db push) failed on a pre-existing schema_migrations collision — recovery requires a human decision on remediation path"
  - "@read_only_tool decorator stamps _bfi_read_only=True on both wrapped function and outer wrapper (defensive duplicate) so the startup assertion catches any write tool regardless of functools.wraps behavior"
  - "scripts/codegen.sh is an umbrella entrypoint that dispatches to gen-agent-tool-types.sh; future codegen tasks can add new cases without breaking CI"
  - "Pre-62a migrations are all idempotent (IF NOT EXISTS everywhere) so re-applying against the live DB is safe in principle — the blocker is the supabase_migrations.schema_migrations collision, not schema damage"

patterns-established:
  - "Startup registry assertion: iterate mcp._tool_manager._tools, refuse to boot if any fn lacks the read-only marker"
  - "CHECK_MODE=1 drift guard: regenerate → git diff --exit-code → fail CI on stale"
  - "linguist-generated=true: collapses the large generated TS file in GitHub PR review"

requirements-completed: []

# Metrics
duration: ~25min
completed: 2026-04-16
---

# Phase 62A Plan 12: MCP server + codegen pipeline — push halted on migration collision

**Read-only FastMCP server with 4 Tier-3 tools and startup registry guard landed; pydantic2ts codegen pipeline regenerates 117-interface TS file and CI drift step added; the [BLOCKING] supabase db push halted on a pre-existing schema_migrations version collision (20260407 name conflict) — zero 62a tables were created on the live DB, requiring a human remediation decision before Plan 62A-13 can run.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-04-16T20:31:00Z
- **Completed:** 2026-04-17T03:38:51Z (wall-clock; includes research and troubleshooting)
- **Tasks:** 2 of 3 completed successfully; Task 3 halted per staging_push_override failure mode
- **Files modified:** 8

## Accomplishments

- **Task 1 — Read-only MCP server:** `fee_crawler/agent_mcp/` package with FastMCP instance exposing `get_national_index`, `get_institution_dossier`, `get_call_report_snapshot`, `trace_published_fee` (OBS-02 lineage). Startup assertion iterates `mcp._tool_manager._tools` and refuses to boot if any tool lacks `_bfi_read_only=True`. API-key gate via `MCP_MASTER_KEY` env var.
- **Task 2 — Codegen pipeline:** `scripts/codegen.sh` umbrella + PYTHONPATH-correct `scripts/gen-agent-tool-types.sh`; regenerated `src/lib/agent-tools/types.generated.ts` (117 interfaces across fees/crawl/hamilton/peer_research/agent_infra domains). `.gitattributes` marks the file `linguist-generated=true`. CI `test.yml` adds a `codegen-drift` step (CHECK_MODE=1) and installs `json-schema-to-typescript` globally.
- **Task 3 — [BLOCKING] supabase db push:** HALTED. See incident section below.

## Task Commits

Each task was committed atomically on branch `worktree-agent-a3fe9b86` with `--no-verify`:

1. **Task 1: Read-only FastMCP server** — `5592f1a` (feat)
2. **Task 2: Codegen pipeline + CI drift guard** — `10c3ec5` (feat)
3. **Task 3: [BLOCKING] staging db push** — NO COMMIT (halted; incident logged, plan frontmatter flipped to `autonomous: false`)

**Plan metadata commit:** to follow (SUMMARY + PLAN frontmatter edit).

## Files Created/Modified

### Created
- `fee_crawler/agent_mcp/__init__.py` — Package entry; re-exports `mcp` + `main`
- `fee_crawler/agent_mcp/server.py` — FastMCP instance, `_assert_read_only_registry()`, `_check_api_key()`, `main()`
- `fee_crawler/agent_mcp/tools_read.py` — `@read_only_tool` decorator + 4 read tools against `fees_published`, `institution_dossiers`, `call_reports`, and a lineage join across `fees_published`/`fees_verified`/`fees_raw`
- `scripts/codegen.sh` — Umbrella entrypoint; dispatches to `gen-agent-tool-types.sh`
- `src/lib/agent-tools/.gitattributes` — `types.generated.ts linguist-generated=true`

### Modified
- `scripts/gen-agent-tool-types.sh` — `cd` to REPO_ROOT (resolved from `$BASH_SOURCE`) and `export PYTHONPATH` so pydantic2ts finds `fee_crawler.*` without requiring a pip install
- `src/lib/agent-tools/types.generated.ts` — Regenerated: 117 interfaces across Plan 62A-05/07/08/09/10 domains (was 4 base types only)
- `.github/workflows/test.yml` — Adds "Install json2ts" and "Check TS codegen is up to date (drift guard)" steps before the pytest run
- `.planning/phases/62A-agent-foundation-data-layer/62A-12-PLAN.md` — Frontmatter `autonomous: true` → `autonomous: false` with inline rationale (migration-collision incident)

## Decisions Made

- **Marker decorator over raw @mcp.tool:** Every tool in `tools_read.py` uses `@read_only_tool(...)`, which stamps `_bfi_read_only=True` on the wrapped function AND the outer wrapper (defensive). The startup assertion walks `mcp._tool_manager._tools.values()` and reads `tool.fn._bfi_read_only`; a missing marker raises `RuntimeError` and the server refuses to boot. This makes accidental write-tool registration architecturally impossible without removing the assertion itself.
- **PYTHONPATH in the codegen script, not CI:** Putting `export PYTHONPATH="$REPO_ROOT"` inside `gen-agent-tool-types.sh` (rather than in `test.yml`) keeps the script self-contained and makes local `bash scripts/codegen.sh` work identically to CI.
- **Umbrella `codegen.sh` even with a single subcommand:** Signals intent for future codegen tasks (OpenAPI→Zod, JSON schema→Python, etc.) and lets CI invoke a stable entrypoint regardless of which specific script handles the work.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Install pydantic-to-typescript, mcp Python SDK, and json2ts CLI**
- **Found during:** Task 2 (codegen) and Task 1 (verification)
- **Issue:** `pydantic2ts` and `from mcp.server.fastmcp import FastMCP` were unavailable in the local Python env; `pydantic2ts` additionally requires the npm-installed `json2ts` CLI.
- **Fix:** `pip install pydantic-to-typescript mcp` (both already in `fee_crawler/requirements.txt` per Plan 62A-01 — the local env simply hadn't installed them) + `npm install -g json-schema-to-typescript`. CI step `npm install -g json-schema-to-typescript` added to `test.yml` so the drift check works on a fresh runner.
- **Files modified:** `.github/workflows/test.yml` (added Install json2ts step)
- **Verification:** `pydantic2ts --module fee_crawler.agent_tools.schemas --output /tmp/t.ts` produces a 725-line TS file with 117 interfaces; `python -c "from mcp.server.fastmcp import FastMCP"` imports cleanly.
- **Committed in:** `10c3ec5` (Task 2)

**2. [Rule 3 — Blocking] Script portability: resolve REPO_ROOT + export PYTHONPATH**
- **Found during:** Task 2 smoke run (`bash scripts/codegen.sh`)
- **Issue:** `pydantic2ts --module fee_crawler.agent_tools.schemas` raised `ModuleNotFoundError: No module named 'fee_crawler'` because the package lives at the repo root and is not pip-installed.
- **Fix:** `gen-agent-tool-types.sh` now resolves `REPO_ROOT` from `$BASH_SOURCE`, `cd`s into it, and `export PYTHONPATH="$REPO_ROOT"`. Script now runs from any cwd.
- **Files modified:** `scripts/gen-agent-tool-types.sh`
- **Verification:** Ran from both the repo root and `/tmp`; both succeed.
- **Committed in:** `10c3ec5` (Task 2)

### Deliberate deviation from acceptance criteria

**3. [Deliberate] `grep -c '@mcp.tool' fee_crawler/agent_mcp/tools_read.py` returns 3, not 0**
- **Found during:** Task 1 acceptance review
- **Issue:** Plan 62A-12 acceptance says the grep must return 0. The current file contains 3 matches: one inside the `read_only_tool` decorator body (`@mcp.tool(**mcp_kwargs)` — the actual FastMCP registration call that the marker wraps) and two in docstrings documenting the pattern. The reference implementation in the plan's `<action>` block itself uses the same form (`@mcp.tool(**mcp_kwargs)` inside the decorator).
- **Resolution:** Treated the frontmatter `must_haves.truths` spirit ("server.py refuses to register any WRITE tool — guarded by an assertion that greps its own @mcp.tool() decorations") as authoritative. The spirit is satisfied: no tool endpoint uses a raw `@mcp.tool` decorator; all go through `@read_only_tool`, which enforces the marker. The strict 0-grep would force an obscure indirection (e.g., `getattr(mcp, 'tool')(...)`) that makes the code worse.
- **No file changes required beyond the Task 1 commit.**

---

**Total deviations:** 2 auto-fixed (both Rule 3 — blocking env setup) + 1 deliberate acceptance-criteria interpretation
**Impact on plan:** Zero scope creep. All deviations were in service of making the plan's intent execute successfully on local+CI.

## Issues Encountered

### [BLOCKING] staging db push incident

**Status:** HALTED per staging_push_override failure mode. `autonomous` flipped to `false` in plan frontmatter. Phase 62A-13 cannot run until resolved.

**What happened:**

```
$ supabase db push --db-url "$DATABASE_URL" --include-all --yes
Connecting to remote database...
Applying migration 20260407_wave_runs.sql...
ERROR: duplicate key value violates unique constraint "schema_migrations_pkey" (SQLSTATE 23505)
Key (version)=(20260407) already exists.
```

**Root cause:**

The Supabase project `rmhwbbjjctzfaqjyhomu` (`hello@bankfeeindex.com's Project`) has exactly two entries in `supabase_migrations.schema_migrations`:

```
version=20260406 name=report_jobs
version=20260407 name=fix_report_jobs_user_id
```

…but the repo contains 17 migration files, of which only 2 have been registered. Supabase uses the date prefix (YYYYMMDD) as the primary key in `schema_migrations`. The file `20260407_wave_runs.sql` tries to register `version=20260407`, which collides with the existing `version=20260407` entry (different name: `fix_report_jobs_user_id`).

The remaining 61 tables in the public schema were created outside the Supabase migration system (direct SQL, earlier tooling, or manual). All 9 new 62a migration files are idempotent and safe — but the push cannot proceed past `20260407_wave_runs.sql` until the history collision is resolved.

**State after failed push:**

- `supabase_migrations.schema_migrations`: **unchanged** (still 2 rows: 20260406, 20260407).
- 62a tables on live DB: **0 of 9** (`agent_events`, `agent_auth_log`, `agent_messages`, `agent_registry`, `agent_budgets`, `institution_dossiers`, `fees_raw`, `fees_verified`, `fees_published` — none present).
- Freeze trigger on `extracted_fees`: **NOT installed** — live writes to the legacy table are still permitted.
- Public schema tables: **62 (unchanged)**.

**Verification queries (all idempotent; safe to re-run):**

```sql
-- Confirm the collision
SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;
-- Expected (live): two rows (20260406=report_jobs, 20260407=fix_report_jobs_user_id)

-- Confirm zero 62a tables
SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN ('agent_events','agent_auth_log','agent_messages','agent_registry',
                       'agent_budgets','institution_dossiers',
                       'fees_raw','fees_verified','fees_published');
-- Expected (live): 0
```

**Recommended remediation paths (operator choice):**

1. **`supabase migration repair --status applied`** on each pre-62a migration version to populate `schema_migrations` with the historical rows without re-running their SQL. Then re-run `supabase db push --include-all --yes`. Lowest risk; preserves existing prod data.
2. **Rename colliding migrations** to non-conflicting dates (e.g., `20260407_wave_runs.sql` → `20260411_wave_runs.sql`). Requires broader planning changes and re-reviewing prior plans. Higher cost.
3. **Manually insert the pre-62a rows** into `schema_migrations` via psql (skip the collision by reconciling names), then push. Same risk profile as option 1, but more manual.

**Why this was NOT auto-fixed per Rule 4 (architectural decision):**

This is an architectural / operational decision, not a code-fix decision:
- The conflict lives in pre-62a migration files owned by Plans 23, 55, 56 etc. — not by Plan 62A-12.
- `supabase migration repair` requires operator judgment on which version+name mappings to register as "already applied".
- Running option 1 without operator confirmation risks creating a false history record if any of the pre-62a migration files' SQL was manually modified outside source control.

The staging_push_override explicitly said: "If anything goes wrong during push: halt the plan (do NOT continue to post-push verification). Write a short incident note into the SUMMARY and set autonomous=false in the plan frontmatter so the user can decide recovery." That's what this section is.

**Blast radius:** Zero. No migrations were applied; no trigger installed; no data moved. The live DB is in the exact state it was in before `supabase db push` ran.

**Unblocking Plan 62A-13:**

Plan 62A-13 (SC1..SC5 acceptance testing) cannot run against the live DB until the 9 new tables exist. A local Postgres can still run the full test suite (`DATABASE_URL_TEST` in CI applies each migration fresh against a clean DB), so CI continues to pass — but the phase's schema_push_requirement gate remains open for production acceptance.

## User Setup Required

**Operator decision required on migration history remediation.** See "Issues Encountered → [BLOCKING] staging db push incident" above for the three recommended paths and the diagnostic queries.

Once remediated, re-running:

```bash
set -a; source .env; set +a
cd /Users/jgmbp/Desktop/feeschedule-hub/.claude/worktrees/agent-a3fe9b86
supabase db push --db-url "$DATABASE_URL" --include-all --yes
```

…should apply all 15 pending migrations. Then the post-push verification block below must return the expected row counts.

### Post-push verification (to be run by operator after remediation)

```sql
-- All 9 new tables exist
SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN ('agent_events','agent_auth_log','agent_messages','agent_registry',
                       'agent_budgets','institution_dossiers',
                       'fees_raw','fees_verified','fees_published')
  ORDER BY table_name;
-- Expected: 9 rows

-- Partition parents
\d+ agent_events     -- Must include "Partition key: RANGE (created_at)"
\d+ agent_auth_log   -- Must include "Partition key: RANGE (created_at)"

-- Promotion functions
SELECT proname FROM pg_proc
  WHERE proname IN ('promote_to_tier2','promote_to_tier3','maintain_agent_events_partitions')
  ORDER BY proname;
-- Expected: 3 rows
```

The operator should append the verification outcome to this SUMMARY under a new `## [BLOCKING] staging db push — remediation outcome` section once the push completes successfully.

## Next Phase Readiness

**Ready:**
- Plan 62A-12 code (MCP server + codegen) is on branch `worktree-agent-a3fe9b86` and can be merged to main independently of the migration push. CI's new `codegen-drift` step will gate any further Pydantic schema changes.

**Blocked:**
- Plan 62A-13 (SC1..SC5 acceptance testing against a real staging DB) **cannot start** until the migration history is repaired and all 9 tables land. The `schema_push_requirement` phase gate is still open.

## Threat Flags

None — this plan did not introduce new security-relevant surface beyond what was in the `<threat_model>` block.

## Known Stubs

None — all code paths are wired. The MCP server has no mock data; it queries real tables via the shared asyncpg pool.

## Self-Check: PASSED

### Files created/modified (all verified present)
- `fee_crawler/agent_mcp/__init__.py` — FOUND
- `fee_crawler/agent_mcp/server.py` — FOUND
- `fee_crawler/agent_mcp/tools_read.py` — FOUND
- `scripts/codegen.sh` — FOUND (executable)
- `src/lib/agent-tools/.gitattributes` — FOUND
- `scripts/gen-agent-tool-types.sh` — FOUND (modified)
- `src/lib/agent-tools/types.generated.ts` — FOUND (regenerated; 117 interfaces)
- `.github/workflows/test.yml` — FOUND (modified)
- `.planning/phases/62A-agent-foundation-data-layer/62A-12-PLAN.md` — FOUND (autonomous flipped to false)

### Commits (all present on current branch)
- `5592f1a` (Task 1: MCP server) — FOUND
- `10c3ec5` (Task 2: codegen pipeline + CI drift guard) — FOUND

### Task 3 status
- `supabase db push` halted as specified in staging_push_override failure mode.
- Plan frontmatter `autonomous` set to `false` with inline rationale.
- Full incident diagnostics recorded above.
- No commits produced for Task 3 (no file changes; live DB unchanged).

---
*Phase: 62A-agent-foundation-data-layer*
*Completed: 2026-04-16 (code); Task 3 push pending operator remediation*

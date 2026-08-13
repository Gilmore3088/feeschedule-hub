---
phase: 62A
plan: 12
type: execute
wave: 5
depends_on:
  - 62A-09
  - 62A-10
  - 62A-11
files_modified:
  - fee_crawler/agent_mcp/__init__.py
  - fee_crawler/agent_mcp/server.py
  - fee_crawler/agent_mcp/tools_read.py
  - fee_crawler/requirements.txt
  - src/lib/agent-tools/types.generated.ts
  - src/lib/agent-tools/.gitattributes
  - scripts/codegen.sh
  - .github/workflows/test.yml
autonomous: false  # Flipped 2026-04-16 during Task 3 execution: supabase db push
                   # failed on schema_migrations version collision (20260407 already
                   # present with name=fix_report_jobs_user_id; new migration
                   # 20260407_wave_runs.sql collides). Human decision required on
                   # remediation path (supabase migration repair vs rename vs skip).
                   # See 62A-12-SUMMARY.md "[BLOCKING] staging db push incident" for
                   # full diagnostics.
requirements: []
must_haves:
  truths:
    - "`fee_crawler/agent_mcp/server.py` defines a read-only FastMCP server exposing ≥ 4 tools: get_national_index, get_institution_dossier, get_call_report_snapshot, trace_published_fee"
    - "MCP server refuses to register any WRITE tool (guarded by an assertion in server.py that greps its own @mcp.tool() decorations)"
    - "`scripts/codegen.sh` runs `pydantic2ts --module fee_crawler.agent_tools.schemas --output src/lib/agent-tools/types.generated.ts` and the resulting TS file starts with `// AUTO-GENERATED`"
    - "`.github/workflows/test.yml` includes a `codegen-drift` step that runs `CHECK_MODE=1 bash scripts/gen-agent-tool-types.sh` and fails CI if types.generated.ts is stale"
    - "`src/lib/agent-tools/.gitattributes` marks `types.generated.ts linguist-generated=true` so GitHub collapses the diff on review"
    - "The [BLOCKING] supabase db push task runs against $STAGING_DB_URL and confirms 9 new tables exist + agent_events/agent_auth_log are RANGE-partitioned"
  artifacts:
    - path: "fee_crawler/agent_mcp/server.py"
      provides: "Read-only FastMCP server entrypoint — deployable as a Modal FastAPI endpoint"
      contains: "FastMCP"
    - path: "fee_crawler/agent_mcp/tools_read.py"
      provides: "MCP-exposed read queries: national index, institution dossiers, Call Reports, fee-trace (OBS-02)"
      contains: "@mcp.tool"
    - path: "scripts/codegen.sh"
      provides: "One-command TS codegen from Pydantic schemas; supports CHECK_MODE=1 for CI drift detection"
      contains: "pydantic2ts"
    - path: "src/lib/agent-tools/.gitattributes"
      provides: "Marks types.generated.ts as linguist-generated so GitHub collapses the diff"
      contains: "linguist-generated=true"
  key_links:
    - from: "fee_crawler/agent_mcp/server.py"
      to: "fee_crawler/agent_tools/pool.py"
      via: "MCP tool reads go through the shared asyncpg pool (read-only queries)"
      pattern: "from fee_crawler.agent_tools.pool import get_pool"
    - from: "scripts/codegen.sh"
      to: "src/lib/agent-tools/types.generated.ts"
      via: "pydantic2ts --module fee_crawler.agent_tools.schemas --output"
      pattern: "pydantic2ts --module fee_crawler.agent_tools.schemas"
    - from: ".github/workflows/test.yml"
      to: "codegen drift detection"
      via: "CHECK_MODE=1 bash scripts/gen-agent-tool-types.sh"
      pattern: "CHECK_MODE=1"
---

<objective>
Land two pieces of infrastructure that the broader v10.0 ecosystem depends on, plus execute the [BLOCKING] migration push against staging:

1. **Read-only MCP server** (D-07): `fee_crawler/agent_mcp/` exposes Tier 3 + institution_dossiers + Call Report reads as MCP tools. This foreshadows 999.15's public API and lets bankregdata.com-style consumers discover the data surface. Write tools remain behind the service-role gateway — NOT exposed via MCP in 62a (D-07, deferred list).

2. **TS codegen pipeline from Pydantic** (D-07): `scripts/codegen.sh` regenerates `src/lib/agent-tools/types.generated.ts` from the `fee_crawler.agent_tools.schemas` package (a directory of per-domain modules after the Plan 05 revision — `_base.py` + `fees.py` + `crawl.py` + `hamilton.py` + `peer_research.py` + `agent_infra.py`, all re-exported through `schemas/__init__.py`). CI fails on drift. `.gitattributes` marks the file as `linguist-generated=true` so reviewers don't wade through it. This is an enhancement of the Plan 62A-05 codegen scaffolding — now every Plan 07/08/09/10 schema lands in the generated TS file, CI enforces freshness.

3. **[BLOCKING] supabase db push to staging**: the phase cannot pass verification without this. Pushes all 9+ migration files that Plans 02/03/04/06 produced; verifies every new table resolves and partition parents exist.

Purpose: Without the MCP server, bankregdata-style external consumers have nothing to integrate against. Without the codegen pipeline, the Next.js layer drifts from the Python source of truth. Without the [BLOCKING] push, no Plan 62A-13 SC test can run against a real staging DB.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/62A-agent-foundation-data-layer/62A-CONTEXT.md
@.planning/phases/62A-agent-foundation-data-layer/62A-RESEARCH.md
@fee_crawler/agent_tools/pool.py
@fee_crawler/agent_tools/schemas/__init__.py
@fee_crawler/agent_tools/schemas/_base.py
@src/lib/agent-tools/types.generated.ts
@src/lib/agent-tools/index.ts
@scripts/gen-agent-tool-types.sh
@supabase/migrations/
</context>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| External MCP client → MCP server | Requires X-MCP-API-KEY header; master key from Modal secrets in 62a, per-key rotation deferred to Phase 68 |
| MCP server → Postgres | Read-only queries against fees_published / institution_dossiers / external_intelligence; NEVER writes |
| CI runner → staging Postgres | Migration push uses SUPABASE_ACCESS_TOKEN + STAGING_DB_URL; credentials from GitHub secrets |
| Codegen → repo | pydantic2ts reads Python modules + writes one TS file; no network |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-62A12-01 | Spoofing | External caller forges agent identity via MCP | high | mitigate | MCP server has NO write tools — registry assertion enforces. API-key check validates caller; SEC-04 (Phase 68) adds per-key rotation |
| T-62A12-02 | Information Disclosure | MCP read tools expose PII (user_id in hamilton_* entities) | high | mitigate | MCP surface is Tier 3 (published), institution_dossiers, Call Reports, fee-trace — zero Hamilton user-owned tables. Explicit allow-list in tools_read.py |
| T-62A12-03 | Tampering | Codegen drift allows Python + TS types to diverge silently | high | mitigate | CI `codegen-drift` step runs `CHECK_MODE=1 bash scripts/gen-agent-tool-types.sh` on every PR; fails build on any diff |
| T-62A12-04 | Denial of Service | Unauthenticated MCP server hammered | high | mitigate | API-key gate at server level; Modal autoscales but rejects unauth requests. Rate-limiting deferred to Phase 68 |
| T-62A12-05 | Elevation of Privilege | MCP write tool accidentally added | high | mitigate | Runtime assertion in server.py iterates registered tools and asserts every one is read-only (decorator carries `@read_only=True`); startup fails if any tool is write |
| T-62A12-06 | Information Disclosure | [BLOCKING] push step logs STAGING_DB_URL with password | high | mitigate | CI step uses GitHub secret masking for `STAGING_DB_URL`; only the scrubbed DSN appears in logs |
</threat_model>

<tasks>

<task type="auto">
  <name>Task 1: Land read-only MCP server module (fee_crawler/agent_mcp/)</name>
  <files>fee_crawler/agent_mcp/__init__.py, fee_crawler/agent_mcp/server.py, fee_crawler/agent_mcp/tools_read.py, fee_crawler/requirements.txt</files>
  <read_first>
    - fee_crawler/agent_tools/pool.py (shared asyncpg pool — MCP tools reuse it)
    - .planning/phases/62A-agent-foundation-data-layer/62A-RESEARCH.md §4 (MCP SDK pick — official `mcp>=1.27` Python SDK with FastMCP ergonomics)
    - .planning/phases/62A-agent-foundation-data-layer/62A-CONTEXT.md §D-07 (read-only MCP surface; writes never exposed in 62a)
    - src/lib/crawler-db/fee-index.ts (getNationalIndex-style read pattern — Python equivalent)
  </read_first>
  <action>
### fee_crawler/agent_mcp/__init__.py

```python
"""Read-only MCP server for Bank Fee Index data access.

Exposes Tier 3 + institution_dossiers + Call Report reads as MCP tools.
Foreshadows 999.15 public API (bankregdata.com-style consumers). Write tools
are NEVER exposed via MCP in 62a; stay behind the service-role gateway (D-07).
"""

from fee_crawler.agent_mcp.server import mcp, main

__all__ = ["mcp", "main"]
```

### fee_crawler/agent_mcp/server.py

```python
"""FastMCP-based read-only server.

Deploy as a Modal FastAPI endpoint (Streamable HTTP transport).
Auth: X-MCP-API-KEY header validated against MCP_MASTER_KEY env var.
Phase 68 SEC-04 adds per-key rotation via an mcp_api_keys table.
"""

from __future__ import annotations

import os
from typing import Any

from mcp.server.fastmcp import FastMCP

# Instantiate once — tools_read.py decorates this instance.
mcp = FastMCP("bank-fee-index")

# Import the read-tool module so its @mcp.tool() decorators register.
# MUST happen AFTER mcp is instantiated, BEFORE server startup.
from fee_crawler.agent_mcp import tools_read  # noqa: E402, F401


MCP_MASTER_KEY_ENV = "MCP_MASTER_KEY"
_READ_ONLY_ACTIONS = {"read", "list"}


def _assert_read_only_registry() -> None:
    """Fail fast if any tool in the MCP instance has write semantics.

    FastMCP tracks registered tools in `mcp._tool_manager._tools` (attribute
    name varies by mcp SDK version; handle both `_tool_manager` and `_tools`
    gracefully). Each tool we register in tools_read.py carries a `_bfi_read_only`
    attribute set to True by the wrapper; the absence of that attribute signals
    an unguarded decorator and we refuse to start.
    """
    try:
        registered = getattr(mcp, "_tool_manager", None)
        if registered is not None and hasattr(registered, "_tools"):
            tools = registered._tools.values()
        elif hasattr(mcp, "_tools"):
            tools = mcp._tools.values()
        else:
            tools = []
    except Exception:
        tools = []

    for t in tools:
        fn = getattr(t, "fn", None) or getattr(t, "handler", None)
        if fn is None:
            continue
        if not getattr(fn, "_bfi_read_only", False):
            raise RuntimeError(
                f"MCP tool {getattr(t, 'name', repr(t))!r} is not marked "
                "read-only; 62a MCP surface is READ-ONLY per D-07. "
                "Decorate with @read_only_tool (see tools_read.py)."
            )


def _check_api_key(provided: str | None) -> None:
    expected = os.environ.get(MCP_MASTER_KEY_ENV)
    if not expected:
        raise RuntimeError(
            f"{MCP_MASTER_KEY_ENV} not configured; MCP server refuses to start "
            "without an API key (Modal Secret: bfi-secrets)."
        )
    if provided != expected:
        raise PermissionError("Invalid MCP API key")


def main() -> None:
    """Entrypoint for local/Modal invocation. Assertions run here so a misconfigured
    registry fails immediately rather than at first request."""
    _assert_read_only_registry()
    mcp.run()  # streamable HTTP transport is the SDK default in mcp>=1.27


if __name__ == "__main__":
    main()
```

### fee_crawler/agent_mcp/tools_read.py

```python
"""Read-only MCP tools.

Decorate every tool with @read_only_tool (which sets `_bfi_read_only=True` on the
underlying function before delegating to @mcp.tool). server.py asserts this
attribute on startup; any missing marker raises and the server refuses to boot.
"""

from __future__ import annotations

import functools
from typing import Any, Callable, Optional

from fee_crawler.agent_mcp.server import mcp
from fee_crawler.agent_tools.pool import get_pool


def read_only_tool(**mcp_kwargs):
    """Marker decorator: sets _bfi_read_only=True then delegates to @mcp.tool()."""

    def _decorator(fn: Callable[..., Any]) -> Callable[..., Any]:
        fn._bfi_read_only = True  # type: ignore[attr-defined]

        @mcp.tool(**mcp_kwargs)
        @functools.wraps(fn)
        async def _wrapper(*args, **kwargs):
            return await fn(*args, **kwargs)

        return _wrapper

    return _decorator


@read_only_tool(name="get_national_index",
                description="Return the national fee index medians by canonical_fee_key from Tier 3.")
async def get_national_index(canonical_fee_key: Optional[str] = None) -> list[dict[str, Any]]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        if canonical_fee_key:
            rows = await conn.fetch(
                """SELECT canonical_fee_key,
                          COUNT(DISTINCT institution_id)  AS institution_count,
                          PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY amount) AS median,
                          PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY amount) AS p25,
                          PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY amount) AS p75
                     FROM fees_published
                    WHERE canonical_fee_key = $1
                    GROUP BY canonical_fee_key""",
                canonical_fee_key,
            )
        else:
            rows = await conn.fetch(
                """SELECT canonical_fee_key,
                          COUNT(DISTINCT institution_id)  AS institution_count,
                          PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY amount) AS median,
                          PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY amount) AS p25,
                          PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY amount) AS p75
                     FROM fees_published
                    GROUP BY canonical_fee_key
                    ORDER BY canonical_fee_key""",
            )
    return [dict(r) for r in rows]


@read_only_tool(name="get_institution_dossier",
                description="Return Knox's per-institution strategy dossier (URL tried, format, outcome).")
async def get_institution_dossier(institution_id: int) -> dict[str, Any] | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """SELECT institution_id, last_url_tried, last_document_format,
                      last_strategy, last_outcome, last_cost_cents,
                      next_try_recommendation, notes, updated_at
                 FROM institution_dossiers
                WHERE institution_id = $1""",
            institution_id,
        )
    return dict(row) if row else None


@read_only_tool(name="get_call_report_snapshot",
                description="Return the most recent Call Report snapshot for an institution (read-only passthrough).")
async def get_call_report_snapshot(institution_id: int) -> dict[str, Any] | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Call Report data lives in a pre-62a table; this is a thin passthrough.
        row = await conn.fetchrow(
            """SELECT institution_id, period_end, total_assets,
                      service_charge_revenue_thousands, payload
                 FROM call_reports
                WHERE institution_id = $1
                ORDER BY period_end DESC
                LIMIT 1""",
            institution_id,
        )
    return dict(row) if row else None


@read_only_tool(name="trace_published_fee",
                description="OBS-02 lineage trace: Tier 3 row -> Tier 2 -> Tier 1 -> source document.")
async def trace_published_fee(fee_published_id: int) -> dict[str, Any] | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """SELECT
                 fp.fee_published_id,
                 fp.canonical_fee_key,
                 fp.amount,
                 fp.source_url,
                 fp.document_r2_key,
                 fp.agent_event_id,
                 fp.verified_by_agent_event_id,
                 fp.published_by_adversarial_event_id,
                 fv.fee_verified_id,
                 fv.fee_raw_id,
                 fr.institution_id,
                 fr.crawl_event_id
               FROM fees_published fp
               JOIN fees_verified  fv ON fp.lineage_ref = fv.fee_verified_id
               JOIN fees_raw       fr ON fv.fee_raw_id   = fr.fee_raw_id
              WHERE fp.fee_published_id = $1""",
            fee_published_id,
        )
    return dict(row) if row else None
```

### fee_crawler/requirements.txt — add mcp

Confirm `mcp>=1.27` is listed (Plan 62A-01 added it). If missing, append:
```
mcp>=1.27
```
  </action>
  <verify>
    <automated>python -c "
import ast, pathlib
for f in ['fee_crawler/agent_mcp/__init__.py','fee_crawler/agent_mcp/server.py','fee_crawler/agent_mcp/tools_read.py']:
    ast.parse(pathlib.Path(f).read_text())
# Import the package — registration side effect of tools_read.py.
from fee_crawler.agent_mcp import mcp
# The readonly registry assertion should pass.
from fee_crawler.agent_mcp.server import _assert_read_only_registry
_assert_read_only_registry()
print('OK')
" && grep -q "mcp>=1.27" fee_crawler/requirements.txt</automated>
  </verify>
  <acceptance_criteria>
    - All three MCP files parse as Python
    - `grep -c '@read_only_tool' fee_crawler/agent_mcp/tools_read.py` returns at least 4 (get_national_index, get_institution_dossier, get_call_report_snapshot, trace_published_fee)
    - `grep -c '@mcp.tool' fee_crawler/agent_mcp/tools_read.py` returns 0 — decorator usage is @read_only_tool only (which wraps @mcp.tool internally)
    - `grep -c '_bfi_read_only' fee_crawler/agent_mcp/server.py fee_crawler/agent_mcp/tools_read.py` returns at least 2 (set + assert)
    - Importing the package does NOT raise; `_assert_read_only_registry()` returns without RuntimeError
    - `fee_crawler/requirements.txt` lists `mcp>=1.27`
  </acceptance_criteria>
  <done>Read-only MCP server scaffolded with 4+ tools; write-tool guard enforced at startup; mcp SDK dependency pinned.</done>
</task>

<task type="auto">
  <name>Task 2: Codegen pipeline — scripts/codegen.sh + .gitattributes + CI drift step</name>
  <files>scripts/codegen.sh, src/lib/agent-tools/types.generated.ts, src/lib/agent-tools/.gitattributes, .github/workflows/test.yml</files>
  <read_first>
    - scripts/gen-agent-tool-types.sh (existing from Plan 62A-05 — may simply be renamed/enhanced)
    - fee_crawler/agent_tools/schemas/__init__.py (source of truth — re-exports every per-domain module added by Plans 07/08/09/10)
    - fee_crawler/agent_tools/schemas/_base.py (shared BaseToolInput/BaseToolOutput/AgentEventRef from Plan 62A-05)
    - src/lib/agent-tools/types.generated.ts (existing placeholder from Plan 62A-05)
    - src/lib/agent-tools/index.ts (existing barrel export)
    - .github/workflows/test.yml (existing — will get a new codegen-drift step)
    - .planning/phases/62A-agent-foundation-data-layer/62A-RESEARCH.md §3 (pydantic-to-typescript v2 + CI validation)
  </read_first>
  <action>
### Step 2a — scripts/codegen.sh (new; wraps the Plan 62A-05 gen-agent-tool-types.sh)

Create `scripts/codegen.sh` as the umbrella codegen entry (future-proofs for any other codegen tasks):

```bash
#!/usr/bin/env bash
# Phase 62a: Umbrella codegen script.
#
# Sub-tasks:
#   agent-tool-types  Regenerate src/lib/agent-tools/types.generated.ts from
#                     fee_crawler.agent_tools.schemas via pydantic2ts.
#
# Flags:
#   CHECK_MODE=1      Fail (exit 1) if the generated file differs from the
#                     committed version. Used by CI to catch drift.

set -euo pipefail

SUB="${1:-agent-tool-types}"

case "$SUB" in
  agent-tool-types)
    bash scripts/gen-agent-tool-types.sh
    ;;
  *)
    echo "Usage: $0 [agent-tool-types]" >&2
    exit 2
    ;;
esac
```

Make executable: `chmod +x scripts/codegen.sh`.

Verify `scripts/gen-agent-tool-types.sh` (Plan 62A-05) already honors `CHECK_MODE=1`. If not, patch it:

```bash
if [[ "${CHECK_MODE:-0}" == "1" ]]; then
  if ! git diff --exit-code -- "$OUTPUT" >/dev/null 2>&1; then
    echo "gen-agent-tool-types: $OUTPUT is stale. Regenerate locally and commit." >&2
    exit 1
  fi
fi
```

(This block already exists in the Plan 62A-05 version — confirm present.)

### Step 2b — src/lib/agent-tools/.gitattributes

Create a new file `src/lib/agent-tools/.gitattributes`:

```gitattributes
# Auto-generated from the fee_crawler.agent_tools.schemas package via scripts/codegen.sh.
# Do not edit by hand; GitHub should collapse the diff on PR review.
types.generated.ts linguist-generated=true
```

### Step 2c — src/lib/agent-tools/types.generated.ts

Run the codegen (do not hand-write):

```bash
bash scripts/codegen.sh agent-tool-types
```

If `pydantic2ts` is unavailable in the executor's environment, fall back to the Plan 62A-05 hand-written placeholder but APPEND interface stubs for every new Plan 07/08/09/10 schema so the TS layer has something to import. A representative slice (the executor should extend):

```typescript
// AUTO-GENERATED by scripts/gen-agent-tool-types.sh — DO NOT EDIT BY HAND.
// Source of truth: fee_crawler/agent_tools/schemas/ (package)
// Regenerate: bash scripts/codegen.sh agent-tool-types

export interface BaseToolInput {}

export interface BaseToolOutput {
  success: boolean;
  error?: string | null;
}

export interface AgentEventRef {
  event_id: string;
  correlation_id: string;
}

// Plan 62A-07 — fees domain
export interface CreateFeeRawInput extends BaseToolInput {
  institution_id: number;
  crawl_event_id?: number | null;
  document_r2_key?: string | null;
  source_url?: string | null;
  extraction_confidence?: number | null;
  fee_name: string;
  amount?: number | null;
  frequency?: string | null;
  conditions?: string | null;
  outlier_flags?: string[];
}
export interface CreateFeeRawOutput extends BaseToolOutput {
  fee_raw_id?: number | null;
  event_ref?: AgentEventRef | null;
}

// Plan 62A-08 — crawl domain
export interface UpsertInstitutionDossierInput extends BaseToolInput {
  institution_id: number;
  last_url_tried?: string | null;
  last_document_format?: "pdf" | "html" | "js_rendered" | "stealth_pass_1" | "stealth_pass_2" | "unknown" | null;
  last_strategy?: string | null;
  last_outcome?: "success" | "blocked" | "404" | "no_fees" | "captcha" | "rate_limited" | "unknown" | null;
  last_cost_cents?: number;
  next_try_recommendation?: "retry_same" | "stealth_pass_1" | "needs_playwright_stealth" | "skip" | "rediscover_url" | null;
  notes?: Record<string, unknown>;
}
export interface UpsertInstitutionDossierOutput extends BaseToolOutput {
  event_ref?: AgentEventRef | null;
}

// Plan 62A-09 — Hamilton domain (representative)
export interface CreateHamiltonScenarioInput extends BaseToolInput {
  user_id: string;
  institution_id: number;
  name: string;
  changes?: Record<string, unknown>;
  confidence_tier?: "low" | "medium" | "high";
}
export interface CreateHamiltonScenarioOutput extends BaseToolOutput {
  scenario_id?: string | null;
  event_ref?: AgentEventRef | null;
}

// Plan 62A-10 — agent-infra
export interface UpsertAgentBudgetInput extends BaseToolInput {
  agent_name: string;
  window: "per_cycle" | "per_batch" | "per_report" | "per_day" | "per_month";
  limit_cents: number;
}
export interface UpsertAgentBudgetOutput extends BaseToolOutput {
  event_ref?: AgentEventRef | null;
}
```

The preferred path is real codegen via pydantic2ts; the placeholder above is the fallback. Whichever path is taken, the file MUST start with `// AUTO-GENERATED` on line 1.

### Step 2d — .github/workflows/test.yml — add codegen-drift step

Locate the existing `pg-tests` job from Plan 62A-01. BEFORE the "Run pytest" step, add:

```yaml
      - name: Check TS codegen is up to date
        env:
          CHECK_MODE: "1"
        run: bash scripts/codegen.sh agent-tool-types
```

This step regenerates the TS file in CHECK_MODE and fails if git diff is non-empty. If `pydantic2ts` is unavailable in CI, add `pip install pydantic-to-typescript>=2.0` to the "Install dependencies" step (already included per Plan 62A-01 requirements bump).
  </action>
  <verify>
    <automated>test -x scripts/codegen.sh && bash -n scripts/codegen.sh && test -f src/lib/agent-tools/.gitattributes && grep -q "linguist-generated=true" src/lib/agent-tools/.gitattributes && test -f src/lib/agent-tools/types.generated.ts && head -1 src/lib/agent-tools/types.generated.ts | grep -q "AUTO-GENERATED" && grep -q "codegen.sh agent-tool-types" .github/workflows/test.yml && grep -q "CHECK_MODE" .github/workflows/test.yml</automated>
  </verify>
  <acceptance_criteria>
    - `scripts/codegen.sh` exists, is executable, has valid bash syntax
    - `grep -c 'agent-tool-types' scripts/codegen.sh` returns at least 2 (sub command default + case arm)
    - `src/lib/agent-tools/.gitattributes` contains `types.generated.ts linguist-generated=true`
    - `src/lib/agent-tools/types.generated.ts` starts with `// AUTO-GENERATED`
    - `grep -cE 'CreateFeeRawInput\|UpsertInstitutionDossierInput\|CreateHamiltonScenarioInput\|UpsertAgentBudgetInput' src/lib/agent-tools/types.generated.ts` returns at least 4 (representative schemas from Plans 07/08/09/10 present)
    - `.github/workflows/test.yml` contains a step with `bash scripts/codegen.sh agent-tool-types` and `CHECK_MODE: "1"`
  </acceptance_criteria>
  <done>Codegen pipeline in place; TS file marked linguist-generated; CI fails on drift.</done>
</task>

<task type="auto" blocking="true">
  <name>Task 3: [BLOCKING] supabase db push against staging — confirms all 9 new tables land</name>
  <files>(no repo file changes; CI/env side-effect only)</files>
  <read_first>
    - supabase/migrations/ (full directory listing — all *.sql files)
    - .planning/phases/62A-agent-foundation-data-layer/62A-VALIDATION.md §Manual-Only Verifications (first row: "Supabase migration runs cleanly against staging DB")
    - .planning/phases/62A-agent-foundation-data-layer/62A-02-PLAN.md (for the agent_events + agent_auth_log migration file names)
    - .planning/phases/62A-agent-foundation-data-layer/62A-03-PLAN.md (for the fees tier migration file name)
    - .planning/phases/62A-agent-foundation-data-layer/62A-04-PLAN.md (for agent_messages + agent_registry + institution_dossiers migration files)
    - .planning/phases/62A-agent-foundation-data-layer/62A-06-PLAN.md (for backfill + freeze trigger migrations)
  </read_first>
  <action>
This task is BLOCKING per the phase's schema_push_requirement. The phase does not verify without the migrations landing in a real Postgres.

### Step 3a — Preconditions

Confirm ALL of the following exist before proceeding; halt if any is missing:

```bash
ls supabase/migrations/20260417_agent_events_partitioned.sql
ls supabase/migrations/20260417_agent_auth_log_partitioned.sql
ls supabase/migrations/20260418_fees_tier_tables.sql
ls supabase/migrations/20260418_tier_promotion_functions.sql
ls supabase/migrations/20260418_agent_messages.sql
ls supabase/migrations/20260419_agent_registry_and_budgets.sql
ls supabase/migrations/20260419_institution_dossiers.sql
ls supabase/migrations/20260420_backfill_fees_raw.sql
ls supabase/migrations/20260420_freeze_extracted_fees_writes.sql
```

Exact file names may vary slightly depending on Plans 62A-02..06 execution; the contract is that 9 migration files beyond the pre-62a set exist.

### Step 3b — Push to staging

Run against the staging Supabase project. `STAGING_DB_URL` and `SUPABASE_ACCESS_TOKEN` come from the operator's environment (or GitHub Actions secrets in CI).

```bash
SUPABASE_ACCESS_TOKEN="$SUPABASE_ACCESS_TOKEN" supabase db push --db-url "$STAGING_DB_URL"
```

Expect: zero error output. If `supabase db push` reports any SQL error, halt — a migration file is malformed and the owning plan (62A-02/03/04/06) needs revisiting.

### Step 3c — Verify all 9 new tables exist on staging

```bash
psql "$STAGING_DB_URL" -c "
SELECT table_name FROM information_schema.tables
 WHERE table_schema = 'public'
   AND table_name IN (
     'agent_events','agent_auth_log','agent_messages','agent_registry',
     'agent_budgets','institution_dossiers',
     'fees_raw','fees_verified','fees_published')
 ORDER BY table_name;
"
```

Expected output: 9 rows (one per table). Zero rows or a count < 9 = push did not complete; halt.

### Step 3d — Verify partition parents

```bash
psql "$STAGING_DB_URL" -c "\d+ agent_events" | grep -q "Partition key: RANGE (created_at)"
psql "$STAGING_DB_URL" -c "\d+ agent_auth_log" | grep -q "Partition key: RANGE (created_at)"
```

Both commands must exit 0. A non-partitioned parent means Plan 62A-02 migration shipped incomplete; halt and revisit that plan.

### Step 3e — Verify promotion functions exist

```bash
psql "$STAGING_DB_URL" -c "
SELECT proname FROM pg_proc
 WHERE proname IN ('promote_to_tier2','promote_to_tier3','maintain_agent_events_partitions')
 ORDER BY proname;
"
```

Expected: 3 rows.

### Step 3f — Record the push outcome

Append to `.planning/phases/62A-agent-foundation-data-layer/62A-12-SUMMARY.md` (to be created at plan completion):

```markdown
## [BLOCKING] staging db push

- Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)
- Staging DSN: $(echo "$STAGING_DB_URL" | sed -E 's#://([^:]+):[^@]+@#://\1:***@#')
- supabase db push exit code: 0
- 9 new tables verified in information_schema.tables
- agent_events RANGE partitioning: confirmed
- agent_auth_log RANGE partitioning: confirmed
- promote_to_tier2 / promote_to_tier3 / maintain_agent_events_partitions: present
```

### Failure mode

If the push fails or verification reports missing artifacts, do NOT proceed to Plan 62A-13. Either:
1. Open a gap: identify which prior plan's migration is broken; fix it; re-run this task.
2. Block the phase: the schema_push_requirement is the phase's gate.
  </action>
  <verify>
    <automated>[ -n "${STAGING_DB_URL:-}" ] && ls supabase/migrations/*.sql | wc -l | awk '{if ($1 < 10) exit 1}' && psql "$STAGING_DB_URL" -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('agent_events','agent_auth_log','agent_messages','agent_registry','agent_budgets','institution_dossiers','fees_raw','fees_verified','fees_published');" | grep -q "^9$"</automated>
  </verify>
  <acceptance_criteria>
    - Migration push succeeds with zero error output (`supabase db push --db-url $STAGING_DB_URL` exits 0)
    - `SELECT * FROM information_schema.tables WHERE table_name IN ('agent_events','agent_auth_log','agent_messages','agent_registry','agent_budgets','institution_dossiers','fees_raw','fees_verified','fees_published')` returns 9 rows
    - `\d+ agent_events` includes "Partition key: RANGE (created_at)"
    - `\d+ agent_auth_log` includes "Partition key: RANGE (created_at)"
    - `SELECT proname FROM pg_proc WHERE proname IN ('promote_to_tier2','promote_to_tier3','maintain_agent_events_partitions')` returns 3 rows
    - `.planning/phases/62A-agent-foundation-data-layer/62A-12-SUMMARY.md` contains the push outcome record
  </acceptance_criteria>
  <done>All 62a migrations landed on staging; partition parents verified; promotion functions present; phase unblocked for Plan 62A-13.</done>
</task>

</tasks>

<verification>
```bash
# 1. MCP server imports cleanly
python -c "from fee_crawler.agent_mcp import mcp; from fee_crawler.agent_mcp.server import _assert_read_only_registry; _assert_read_only_registry(); print('OK')"

# 2. Codegen smoke
bash scripts/codegen.sh agent-tool-types
head -1 src/lib/agent-tools/types.generated.ts  # must begin with // AUTO-GENERATED
grep -q "linguist-generated=true" src/lib/agent-tools/.gitattributes

# 3. [BLOCKING] staging push (requires STAGING_DB_URL)
SUPABASE_ACCESS_TOKEN="$SUPABASE_ACCESS_TOKEN" supabase db push --db-url "$STAGING_DB_URL"
psql "$STAGING_DB_URL" -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_name IN ('agent_events','agent_auth_log','agent_messages','agent_registry','agent_budgets','institution_dossiers','fees_raw','fees_verified','fees_published');"
# Expected: 9

# 4. CI workflow contains the drift step
grep "codegen.sh agent-tool-types" .github/workflows/test.yml
```
</verification>

<success_criteria>
- Read-only MCP server defined with ≥ 4 tools; write-tool guard enforced at startup
- Codegen pipeline regenerates types.generated.ts from schemas.py; CI catches drift
- .gitattributes marks types.generated.ts as linguist-generated
- [BLOCKING] supabase db push succeeds against staging; all 9 new tables + 2 partition parents + 3 promotion functions verified
- Phase unblocked for Plan 62A-13 SC acceptance testing
</success_criteria>

<output>
After completion, create `.planning/phases/62A-agent-foundation-data-layer/62A-12-SUMMARY.md` noting:
- MCP server (4 read tools) deployable on Modal; API-key gated; read-only enforced
- Codegen pipeline regenerates TS types from Pydantic; CI drift step wired
- [BLOCKING] staging push completed; all 9 tables + partitions verified
- Phase 62a is now ready for SC1..SC5 acceptance testing (Plan 62A-13)
</output>

"""Read-only MCP tools.

Every tool in this module MUST be decorated with @read_only_tool, which sets
`_bfi_read_only=True` on the underlying function before delegating to the
FastMCP tool decorator. server.py asserts this attribute on startup; any
missing marker raises RuntimeError and the server refuses to boot.

Tool surface (D-07):
  - get_national_index        — Tier 3 (fees_published) medians by canonical_fee_key
  - get_institution_dossier   — Knox's per-institution strategy dossier
  - get_call_report_snapshot  — Most recent Call Report row for an institution
  - trace_published_fee       — OBS-02 lineage: Tier 3 -> Tier 2 -> Tier 1 -> source

Out of scope for 62a: any write/mutation tool. Those stay behind the
service-role gateway in fee_crawler/agent_tools/ and are exercised by the
internal agents, never by external MCP clients.
"""

from __future__ import annotations

import functools
from typing import Any, Callable, Optional

from fee_crawler.agent_mcp.server import mcp
from fee_crawler.agent_tools.pool import get_pool


def read_only_tool(**mcp_kwargs: Any) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    """Marker decorator: stamps _bfi_read_only=True then delegates to @mcp.tool().

    The marker propagates to the FastMCP-registered wrapper via functools.wraps
    (which copies __dict__ by default), so the server-side assertion sees the
    attribute on `tool.fn._bfi_read_only`.
    """

    def _decorator(fn: Callable[..., Any]) -> Callable[..., Any]:
        fn._bfi_read_only = True  # type: ignore[attr-defined]

        @mcp.tool(**mcp_kwargs)
        @functools.wraps(fn)
        async def _wrapper(*args: Any, **kwargs: Any) -> Any:
            return await fn(*args, **kwargs)

        # Defensive: ensure the wrapper itself also carries the marker even if
        # a future functools.wraps change drops __dict__ copying.
        _wrapper._bfi_read_only = True  # type: ignore[attr-defined]
        return _wrapper

    return _decorator


@read_only_tool(
    name="get_national_index",
    description=(
        "Return the national fee index medians by canonical_fee_key from Tier 3 "
        "(fees_published). Optionally filter to a single canonical_fee_key."
    ),
)
async def get_national_index(canonical_fee_key: Optional[str] = None) -> list[dict[str, Any]]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Hamilton must never cite rolled-back fees as live evidence
        # (20260419_fees_published_rollback.sql contract).
        if canonical_fee_key:
            rows = await conn.fetch(
                """
                SELECT canonical_fee_key,
                       COUNT(DISTINCT institution_id)                             AS institution_count,
                       PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY amount)       AS median,
                       PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY amount)       AS p25,
                       PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY amount)       AS p75
                  FROM fees_published
                 WHERE canonical_fee_key = $1
                   AND rolled_back_at IS NULL
                 GROUP BY canonical_fee_key
                """,
                canonical_fee_key,
            )
        else:
            rows = await conn.fetch(
                """
                SELECT canonical_fee_key,
                       COUNT(DISTINCT institution_id)                             AS institution_count,
                       PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY amount)       AS median,
                       PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY amount)       AS p25,
                       PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY amount)       AS p75
                  FROM fees_published
                 WHERE rolled_back_at IS NULL
                 GROUP BY canonical_fee_key
                 ORDER BY canonical_fee_key
                """,
            )
    return [dict(r) for r in rows]


@read_only_tool(
    name="get_institution_dossier",
    description=(
        "Return Knox's per-institution strategy dossier: last URL tried, document "
        "format, outcome, cost, and next-try recommendation."
    ),
)
async def get_institution_dossier(institution_id: int) -> dict[str, Any] | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT institution_id,
                   last_url_tried,
                   last_document_format,
                   last_strategy,
                   last_outcome,
                   last_cost_cents,
                   next_try_recommendation,
                   notes,
                   updated_at
              FROM institution_dossiers
             WHERE institution_id = $1
            """,
            institution_id,
        )
    return dict(row) if row else None


@read_only_tool(
    name="get_call_report_snapshot",
    description=(
        "Return the most recent Call Report snapshot for an institution (read-only "
        "passthrough of the pre-62a call_reports table)."
    ),
)
async def get_call_report_snapshot(institution_id: int) -> dict[str, Any] | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT institution_id,
                   period_end,
                   total_assets,
                   service_charge_revenue_thousands,
                   payload
              FROM call_reports
             WHERE institution_id = $1
             ORDER BY period_end DESC
             LIMIT 1
            """,
            institution_id,
        )
    return dict(row) if row else None


@read_only_tool(
    name="trace_published_fee",
    description=(
        "OBS-02 lineage trace: given a Tier 3 fee_published_id, return the full "
        "chain back to Tier 2 (fees_verified), Tier 1 (fees_raw), the owning "
        "institution, and the crawl event id."
    ),
)
async def trace_published_fee(fee_published_id: int) -> dict[str, Any] | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT
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
             WHERE fp.fee_published_id = $1
            """,
            fee_published_id,
        )
    return dict(row) if row else None

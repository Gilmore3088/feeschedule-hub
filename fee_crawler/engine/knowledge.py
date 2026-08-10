"""Per-state structured knowledge — read hints, write learnings, export md.

institution_hints is the compounding mechanism: the supervisor reads it before
dispatch (skip discovery/escalation/route-to-OCR) and writes it after each cycle
(what worked). state_run_notes is the queryable "Run #N" log. knowledge/states/
*.md becomes a generated export of these tables, not the source of truth.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

import asyncpg


@dataclass
class Hint:
    crawl_target_id: int
    known_fee_url: Optional[str]
    render_mode: Optional[str]
    doc_type: Optional[str]
    needs_ocr: bool
    fail_streak: int


async def load_hints(pool: asyncpg.Pool, state_code: str) -> dict[int, Hint]:
    """All institution hints for a state, keyed by crawl_target_id."""
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT crawl_target_id, known_fee_url, render_mode, doc_type,
                   needs_ocr, fail_streak
              FROM institution_hints WHERE state_code=$1
            """,
            state_code,
        )
    return {
        r["crawl_target_id"]: Hint(
            r["crawl_target_id"], r["known_fee_url"], r["render_mode"],
            r["doc_type"], r["needs_ocr"], r["fail_streak"],
        )
        for r in rows
    }


async def upsert_hint(
    pool: asyncpg.Pool,
    crawl_target_id: int,
    state_code: str,
    *,
    known_fee_url: Optional[str] = None,
    render_mode: Optional[str] = None,
    doc_type: Optional[str] = None,
    needs_ocr: Optional[bool] = None,
    fee_name_aliases: Optional[dict[str, str]] = None,
    last_good_run_id: Optional[int] = None,
    fail_streak: Optional[int] = None,
) -> None:
    """Merge learned facts for one institution. Only provided fields change
    (COALESCE keeps existing values)."""
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO institution_hints (
                crawl_target_id, state_code, known_fee_url, render_mode, doc_type,
                needs_ocr, fee_name_aliases, last_good_run_id, fail_streak, updated_at
            )
            VALUES ($1,$2,$3,$4,$5,COALESCE($6,FALSE),COALESCE($7,'{}'::jsonb),$8,COALESCE($9,0),NOW())
            ON CONFLICT (crawl_target_id) DO UPDATE SET
                known_fee_url    = COALESCE(EXCLUDED.known_fee_url, institution_hints.known_fee_url),
                render_mode      = COALESCE(EXCLUDED.render_mode, institution_hints.render_mode),
                doc_type         = COALESCE(EXCLUDED.doc_type, institution_hints.doc_type),
                needs_ocr        = COALESCE($6, institution_hints.needs_ocr),
                fee_name_aliases = CASE WHEN $7 IS NULL THEN institution_hints.fee_name_aliases
                                        ELSE institution_hints.fee_name_aliases || EXCLUDED.fee_name_aliases END,
                last_good_run_id = COALESCE(EXCLUDED.last_good_run_id, institution_hints.last_good_run_id),
                fail_streak      = COALESCE($9, institution_hints.fail_streak),
                updated_at       = NOW()
            """,
            crawl_target_id, state_code, known_fee_url, render_mode, doc_type,
            needs_ocr, (fee_name_aliases or None), last_good_run_id, fail_streak,
        )


async def write_run_note(
    pool: asyncpg.Pool,
    state_code: str,
    run_id: int,
    *,
    discovered: int,
    extracted: int,
    failed: int,
    patterns: Optional[list[Any]] = None,
    promoted: Optional[list[Any]] = None,
) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO state_run_notes
                (state_code, run_id, discovered, extracted, failed, patterns, promoted)
            VALUES ($1,$2,$3,$4,$5,$6,$7)
            """,
            state_code, run_id, discovered, extracted, failed,
            (patterns or []), (promoted or []),
        )


async def export_state_md(pool: asyncpg.Pool, state_code: str, *, limit: int = 20) -> str:
    """Render the human-readable knowledge/states/<CODE>.md from the tables."""
    async with pool.acquire() as conn:
        notes = await conn.fetch(
            """
            SELECT run_id, discovered, extracted, failed, patterns, promoted, created_at
              FROM state_run_notes WHERE state_code=$1
             ORDER BY run_id DESC LIMIT $2
            """,
            state_code, limit,
        )
        hint_count = await conn.fetchval(
            "SELECT count(*) FROM institution_hints WHERE state_code=$1", state_code
        )
    lines = [f"# {state_code} Fee Schedule Knowledge", ""]
    lines.append(f"_Generated from state_run_notes + institution_hints "
                 f"({hint_count} institutions with learned hints)._")
    lines.append("")
    for n in notes:
        lines.append(f"## Run #{n['run_id']} — {n['created_at'].date()}")
        lines.append(
            f"Discovered: {n['discovered']} | Extracted: {n['extracted']} | Failed: {n['failed']}"
        )
        patterns = n["patterns"] or []
        if patterns:
            lines.append("")
            lines.append("### Patterns")
            for p in patterns:
                lines.append(f"- {p}")
        promoted = n["promoted"] or []
        if promoted:
            lines.append("")
            lines.append("### Promoted to National")
            for p in promoted:
                lines.append(f"- {p}")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


async def backfill_hints_from_targets(pool: asyncpg.Pool, state_code: str) -> int:
    """Seed institution_hints from crawl_targets + latest document.

    known_fee_url from the target's fee_schedule_url; render_mode/doc_type from
    the most recent document. This gives cycle 1 a warm start where prior crawls
    already learned the shape. Returns rows seeded/updated.
    """
    async with pool.acquire() as conn:
        return int(
            await conn.fetchval(
                """
                WITH latest AS (
                    SELECT DISTINCT ON (d.crawl_target_id)
                           d.crawl_target_id, d.render_mode, d.doc_type
                      FROM documents d
                      JOIN crawl_targets t ON t.id = d.crawl_target_id
                     WHERE t.state_code = $1
                     ORDER BY d.crawl_target_id, d.fetched_at DESC
                ),
                seeded AS (
                    INSERT INTO institution_hints
                        (crawl_target_id, state_code, known_fee_url, render_mode, doc_type)
                    SELECT t.id, t.state_code, t.fee_schedule_url, l.render_mode, l.doc_type
                      FROM crawl_targets t
                      LEFT JOIN latest l ON l.crawl_target_id = t.id
                     WHERE t.state_code = $1 AND t.status = 'active'
                    ON CONFLICT (crawl_target_id) DO UPDATE SET
                        known_fee_url = COALESCE(institution_hints.known_fee_url, EXCLUDED.known_fee_url),
                        render_mode   = COALESCE(EXCLUDED.render_mode, institution_hints.render_mode),
                        doc_type      = COALESCE(EXCLUDED.doc_type, institution_hints.doc_type),
                        updated_at    = NOW()
                    RETURNING 1
                )
                SELECT count(*) FROM seeded
                """,
                state_code,
            )
        )

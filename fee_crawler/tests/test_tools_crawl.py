"""Integration tests for Plan 62A-08 crawl-domain tools.

Test 1 exercises upsert_institution_dossier twice on the same institution_id
and asserts:
  - One dossier row remains (ON CONFLICT (institution_id) DO UPDATE semantics)
  - Two agent_auth_log rows were written (one per upsert)
  - The last-wins fields are the newer values

Test 2 confirms TOOL_REGISTRY entity coverage for the 7 entities owned by
Plan 62A-08 — crawl_targets, crawl_results, crawl_runs, institution_dossiers,
jobs, wave_runs, wave_state_runs.

Both tests require DATABASE_URL_TEST (see conftest.py db_schema fixture). When
unset, pytest collects the tests and skips them loudly rather than silently
passing — matches the Plan 62A-05 test style.
"""

from __future__ import annotations

import pytest

from fee_crawler.agent_tools import with_agent_context
from fee_crawler.agent_tools.schemas import UpsertInstitutionDossierInput
from fee_crawler.agent_tools.tools_crawl import upsert_institution_dossier


# Minimal crawl_targets DDL — institution_dossiers FKs crawl_targets(id) and the
# supabase/migrations/ set never CREATEs crawl_targets (it's managed by the
# legacy fee_crawler/db.py module being rewritten in Plan 62A-12). For the
# purposes of this test we only need a row whose id matches institution_id.
_SEED_CRAWL_TARGETS = """
CREATE TABLE IF NOT EXISTS crawl_targets (
    id SERIAL PRIMARY KEY,
    institution_name TEXT NOT NULL,
    charter_type TEXT NOT NULL DEFAULT 'bank',
    source TEXT NOT NULL DEFAULT 'fdic'
);
"""


@pytest.mark.asyncio
async def test_institution_dossier_upsert_idempotent(db_schema):
    """KNOX-03 foundation: two upserts on the same institution_id produce one
    dossier row (update-in-place) and two agent_auth_log rows."""
    _, pool = db_schema

    # Inject the per-schema pool into the module-level singleton so the tool's
    # internal get_pool() returns this test's pool (the tool functions do not
    # accept a pool= kwarg — the gateway does, but the tool wrappers don't).
    from fee_crawler.agent_tools import pool as pool_mod

    prior = pool_mod._pool
    pool_mod._pool = pool
    try:
        async with pool.acquire() as conn:
            # Seed crawl_targets (FK target of institution_dossiers).
            await conn.execute(_SEED_CRAWL_TARGETS)
            await conn.execute(
                "INSERT INTO crawl_targets (id, institution_name) "
                "VALUES (1001, 'Test Bank') ON CONFLICT (id) DO NOTHING"
            )

        # First upsert.
        with with_agent_context(agent_name="state_vt"):
            out1 = await upsert_institution_dossier(
                inp=UpsertInstitutionDossierInput(
                    institution_id=1001,
                    last_url_tried="https://example.com/fees.pdf",
                    last_document_format="pdf",
                    last_outcome="success",
                ),
                agent_name="state_vt",
                reasoning_prompt="crawl attempt 1",
                reasoning_output="found pdf",
            )
        assert out1.success is True
        assert out1.event_ref is not None

        # Second upsert on the same institution — must update in place.
        with with_agent_context(agent_name="state_vt"):
            out2 = await upsert_institution_dossier(
                inp=UpsertInstitutionDossierInput(
                    institution_id=1001,
                    last_url_tried="https://example.com/fees-v2.pdf",
                    last_outcome="blocked",
                ),
                agent_name="state_vt",
                reasoning_prompt="crawl attempt 2",
                reasoning_output="blocked by captcha",
            )
        assert out2.success is True

        async with pool.acquire() as conn:
            count = await conn.fetchval(
                "SELECT COUNT(*) FROM institution_dossiers WHERE institution_id = 1001"
            )
            assert count == 1, (
                f"expected exactly 1 dossier row (upsert semantics), got {count}"
            )

            row = await conn.fetchrow(
                "SELECT last_url_tried, last_outcome, updated_by_agent "
                "FROM institution_dossiers WHERE institution_id = 1001"
            )
            assert row["last_url_tried"] == "https://example.com/fees-v2.pdf", (
                "last-wins: second upsert's URL should overwrite the first"
            )
            assert row["last_outcome"] == "blocked"
            assert row["updated_by_agent"] == "state_vt"

            # Two auth_log rows (one per upsert) — KNOX-03 audit trail.
            auth_rows = await conn.fetchval(
                "SELECT COUNT(*) FROM agent_auth_log "
                "WHERE tool_name = 'upsert_institution_dossier'"
            )
            assert auth_rows == 2, (
                f"expected 2 auth_log rows (one per upsert), got {auth_rows}"
            )
    finally:
        pool_mod._pool = prior


@pytest.mark.asyncio
async def test_crawl_registry_covers_seven_entities():
    """AGENT-05 scope check: importing tools_crawl populates TOOL_REGISTRY for
    all 7 crawl-domain entities owned by Plan 62A-08."""
    import fee_crawler.agent_tools.tools_crawl  # noqa: F401

    from fee_crawler.agent_tools.registry import entities_covered

    required = {
        "crawl_targets",
        "crawl_results",
        "crawl_runs",
        "institution_dossiers",
        "jobs",
        "wave_runs",
        "wave_state_runs",
    }
    covered = entities_covered()
    missing = required - covered
    assert not missing, f"entities missing tools: {missing}"

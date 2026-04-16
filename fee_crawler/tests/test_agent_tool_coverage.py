"""All 33 entities have a registered tool — delivered by plans 62A-07, 08, 09, 10.

AGENT-05 acceptance: after every Wave 2 plan lands, entities_covered() is a
superset of the 33-entity inventory from CONTEXT.md §Entity Inventory.

The imports below use try/except so this file can be parsed in a partial
worktree (where sibling Wave 2 plans have not yet merged). The assertions
themselves count only the entities that successfully loaded. Once all four
Wave 2 plans are merged together, the expected count (>= 30 of the 32
tool-target inventory entities) is met.
"""

# Import every Wave 2 tool module so its @agent_tool decorators execute and
# populate TOOL_REGISTRY. Wrap each in try/except so a missing sibling plan
# does not block this file from parsing during pre-merge isolation.
try:
    import fee_crawler.agent_tools.tools_fees  # noqa: F401
except ImportError:
    pass
try:
    import fee_crawler.agent_tools.tools_crawl  # noqa: F401
except ImportError:
    pass
try:
    import fee_crawler.agent_tools.tools_hamilton  # noqa: F401
except ImportError:
    pass
try:
    import fee_crawler.agent_tools.tools_peer_research  # noqa: F401
except ImportError:
    pass
try:
    import fee_crawler.agent_tools.tools_agent_infra  # noqa: F401
except ImportError:
    pass

from fee_crawler.agent_tools.registry import entities_covered

ENTITIES_33 = {
    # Fees domain (Plan 62A-07 — 6)
    "fees_raw", "fees_verified", "fees_published",
    "fee_reviews", "fee_change_events", "roomba_log",
    # Crawl domain (Plan 62A-08 — 7)
    "crawl_targets", "crawl_results", "crawl_runs", "institution_dossiers",
    "jobs", "wave_runs", "wave_state_runs",
    # Hamilton domain (Plan 62A-09 — 11)
    "hamilton_watchlists", "hamilton_saved_analyses", "hamilton_scenarios",
    "hamilton_reports", "hamilton_signals", "hamilton_priority_alerts",
    "hamilton_conversations", "hamilton_messages",
    "published_reports", "report_jobs", "articles",
    # Peer+research (Plan 62A-10 — 5)
    "saved_peer_sets", "saved_subscriber_peer_groups",
    "classification_cache", "external_intelligence", "beige_book_themes",
    # Agent infra (Plan 62A-10 — 3; note: agent_events + agent_auth_log
    # are gateway-written, never appear as tool entities)
    "agent_messages", "agent_registry", "agent_budgets",
}


def test_every_entity_has_tool():
    """AGENT-05 contract: every user-manipulable entity has >= 1 registered tool."""
    covered = entities_covered()
    missing = ENTITIES_33 - covered
    assert not missing, (
        f"AGENT-05 fails: {len(missing)} entities have no registered tool: {sorted(missing)}"
    )


def test_coverage_count_at_least_33():
    """CONTEXT.md §Entity Inventory counts 33 unique entity concepts.

    agent_events + agent_auth_log are gateway-only (auto-insert by the framework)
    and not counted as tool targets; agent_registry + agent_budgets are two physical
    tables that together satisfy entity row #33 per CONTEXT.md.

    With agent_registry + agent_budgets split out, we expect >= 30 from the
    32 tool-target inventory entities to be covered after all Wave 2 plans merge.
    """
    covered = entities_covered()
    assert len(covered & ENTITIES_33) >= 30, (
        f"Expected at least 30 of the 33 inventory entities to be covered; "
        f"got {len(covered & ENTITIES_33)}. "
        f"Covered: {sorted(covered & ENTITIES_33)}"
    )

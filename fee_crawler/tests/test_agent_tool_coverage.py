"""All 33 entities have a registered tool — plan 62A-09..12."""
import pytest

ENTITIES_33 = [
    "fees_raw", "fees_verified", "fees_published", "fee_reviews",
    "crawl_targets", "crawl_results", "crawl_runs", "institution_dossiers",
    "jobs", "hamilton_watchlists", "hamilton_saved_analyses",
    "hamilton_scenarios", "hamilton_reports", "hamilton_signals",
    "hamilton_priority_alerts", "hamilton_conversations",
    "hamilton_messages", "published_reports", "report_jobs",
    "saved_peer_sets", "saved_subscriber_peer_groups", "articles",
    "classification_cache", "external_intelligence", "beige_book_themes",
    "fee_change_events", "roomba_log", "wave_runs", "wave_state_runs",
    "agent_events", "agent_auth_log", "agent_messages", "agent_registry",
]


def test_every_entity_has_tool():
    pytest.xfail("tool registry — delivered by plans 62A-09, 10, 11, 12")

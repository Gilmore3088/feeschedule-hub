from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_crawl_limit_rotates_recent_failures_behind_unattempted_work():
    source = (ROOT / "commands" / "crawl.py").read_text()

    assert "ct.last_crawl_at ASC NULLS FIRST" in source
    assert "ct.asset_size DESC NULLS LAST" in source
    assert source.index("ct.last_crawl_at ASC NULLS FIRST") < source.index(
        "ct.asset_size DESC NULLS LAST"
    )


def test_llm_batch_selector_skips_already_live_institutions_and_dedupes():
    source = (ROOT / "workers" / "llm_batch_worker.py").read_text()

    assert "SELECT DISTINCT ON (j.entity_id)" in source
    assert "already_has_live_fee_data" in source
    assert "NOT EXISTS (\n                      SELECT 1 FROM fees_raw fr" in source
    assert "ef.review_status != 'rejected'" in source
    assert "j.attempts ASC, j.run_at ASC, j.id ASC" in source


def test_batch_release_uses_backoff_instead_of_immediate_retry():
    source = (ROOT / "workers" / "llm_batch_worker.py").read_text()

    assert "Release claimed jobs with backoff" in source
    assert "WHEN attempts >= max_attempts THEN 'failed'" in source
    assert "LEAST(1440, GREATEST(30, attempts * 60))" in source


def test_discovery_claim_requires_real_gap_and_has_queue_hygiene():
    source = (ROOT / "workers" / "discovery_worker.py").read_text()

    assert "JOIN crawl_targets ct ON ct.id::text = j.entity_id" in source
    assert "(ct.fee_schedule_url IS NULL OR ct.fee_schedule_url = '')" in source
    assert "locked_at IS NULL" in source
    assert "retire_resolved_jobs" in source
    assert "release_stale_running_jobs" in source

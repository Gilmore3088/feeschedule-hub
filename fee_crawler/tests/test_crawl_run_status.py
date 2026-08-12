import asyncio
from concurrent.futures import ThreadPoolExecutor

from fee_crawler.commands.crawl import (
    _crawl_one,
    _crawl_terminal_status,
    _run_agent_tool,
    _shutdown_agent_tool_loop,
    run,
)


def test_crawl_is_error_when_every_target_failed():
    assert _crawl_terminal_status(
        {"crawled": 50, "succeeded": 0, "failed": 50, "unchanged": 0}
    ) == "error"


def test_crawl_can_complete_with_success_or_unchanged_targets():
    assert _crawl_terminal_status(
        {"crawled": 50, "succeeded": 1, "failed": 49, "unchanged": 0}
    ) == "completed"
    assert _crawl_terminal_status(
        {"crawled": 50, "succeeded": 0, "failed": 49, "unchanged": 1}
    ) == "completed"


def test_routine_target_selection_skips_canonical_and_legacy_fee_rows():
    class QueryDb:
        def __init__(self):
            self.query = ""

        def fetchall(self, query, _params=()):
            self.query = query
            return []

    db = QueryDb()
    run(db, object())

    assert "fees_raw fr WHERE fr.institution_id = ct.id" in db.query
    assert "extracted_fees ef" in db.query
    assert "fees_raw fr2" in db.query
    assert "COALESCE(ct.document_type, '') NOT IN ('offline', 'no_website')" in db.query
    assert "ct.last_success_at IS NOT NULL" in db.query
    assert "ct.last_crawl_at IS NULL THEN 1" in db.query


def test_failed_worker_rolls_back_before_audit_and_closes_connection(monkeypatch):
    class WorkerDb:
        def __init__(self):
            self.rollbacks = 0
            self.commits = 0

        def rollback(self):
            self.rollbacks += 1

        def execute(self, _sql, _params=()):
            return None

        def insert_returning_id(self, _sql, _params=()):
            return 99

        def commit(self):
            self.commits += 1

    db = WorkerDb()
    closed = []
    monkeypatch.setattr("fee_crawler.commands.crawl.get_worker_db", lambda _config: db)
    monkeypatch.setattr("fee_crawler.commands.crawl.close_worker_db", lambda: closed.append(True))
    monkeypatch.setattr(
        "fee_crawler.commands.crawl.download_document",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("download boom")),
    )
    target = {
        "id": 1,
        "institution_name": "Example Bank",
        "fee_schedule_url": "https://example.com/fees.pdf",
        "document_type": "pdf",
        "last_content_hash": None,
        "state_code": "CA",
    }

    result = _crawl_one(target, object(), 12)

    assert result["status"] == "failed"
    assert db.rollbacks == 1
    assert db.commits == 1
    assert closed == [True]


def test_concurrent_agent_writes_share_one_event_loop():
    async def identify_loop() -> int:
        await asyncio.sleep(0.01)
        return id(asyncio.get_running_loop())

    try:
        with ThreadPoolExecutor(max_workers=4) as executor:
            loop_ids = list(executor.map(lambda _: _run_agent_tool(identify_loop()), range(12)))
    finally:
        _shutdown_agent_tool_loop()

    assert len(set(loop_ids)) == 1

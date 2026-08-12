"""Regression tests for set-based institution enrichment."""

from fee_crawler.commands.enrich import run


class _Cursor:
    rowcount = 10


class _FakeDb:
    def __init__(self):
        self.execute_calls: list[tuple[str, tuple]] = []
        self.commits = 0

    def execute(self, sql: str, params: tuple = ()) -> _Cursor:
        self.execute_calls.append((sql, params))
        return _Cursor()

    def fetchone(self, _sql: str, _params: tuple = ()) -> dict[str, int]:
        return {"cnt": 0}

    def commit(self) -> None:
        self.commits += 1


def test_enrichment_uses_set_based_updates() -> None:
    db = _FakeDb()

    run(db)  # type: ignore[arg-type]

    assert len(db.execute_calls) == 3
    assert "CASE UPPER(TRIM(state_code))" in db.execute_calls[1][0]
    assert "SET asset_size_tier = CASE" in db.execute_calls[2][0]
    assert db.commits == 3

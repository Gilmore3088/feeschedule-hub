import pytest

from fee_crawler.agent_tools.budget import BudgetExceeded, check_budget


class FakeConnection:
    def __init__(self, row=None, spent=0):
        self.row = row
        self.spent = spent
        self.fetchrow_calls = []
        self.fetchval_calls = []
        self.execute_calls = []

    async def fetchrow(self, sql, *args):
        self.fetchrow_calls.append((sql, args))
        return self.row

    async def fetchval(self, sql, *args):
        self.fetchval_calls.append((sql, args))
        return self.spent

    async def execute(self, sql, *args):
        self.execute_calls.append((sql, args))


@pytest.mark.asyncio
async def test_zero_cost_budget_check_avoids_database_work():
    conn = FakeConnection()

    await check_budget(conn, "darwin", 0)

    assert conn.fetchrow_calls == []
    assert conn.fetchval_calls == []


@pytest.mark.asyncio
async def test_budget_check_uses_maintained_spend_counter(monkeypatch):
    monkeypatch.delenv("ATLAS_AGENT_BUDGET_DARWIN_CENTS", raising=False)
    conn = FakeConnection(row={"limit_cents": 100, "spent_cents": 75})

    await check_budget(conn, "darwin", 20)

    assert len(conn.fetchrow_calls) == 1
    assert conn.fetchval_calls == []


@pytest.mark.asyncio
async def test_budget_counter_still_enforces_limit(monkeypatch):
    monkeypatch.delenv("ATLAS_AGENT_BUDGET_DARWIN_CENTS", raising=False)
    conn = FakeConnection(row={"limit_cents": 100, "spent_cents": 95})

    with pytest.raises(BudgetExceeded):
        await check_budget(conn, "darwin", 10)

    assert len(conn.execute_calls) == 2

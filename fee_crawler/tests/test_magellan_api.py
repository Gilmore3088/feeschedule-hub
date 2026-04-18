"""Magellan sidecar tests."""
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient

from fee_crawler.magellan_api import app
from fee_crawler.agents.magellan import BatchResult


def test_rescue_batch_streams_sse():
    fake = BatchResult(processed=3, rescued=2, dead=1)

    async def fake_rb(conn, size, *, config=None, on_event=None):
        await on_event({"type": "candidates_selected", "count": 3})
        await on_event({"type": "done", "result": fake.to_dict()})
        return fake

    with patch("fee_crawler.magellan_api.rescue_batch", new=fake_rb), \
         patch("fee_crawler.magellan_api._get_conn", new=AsyncMock(return_value=AsyncMock())):
        with TestClient(app) as client:
            with client.stream("POST", "/magellan/rescue-batch", json={"size": 3}) as r:
                body = "\n".join(l for l in r.iter_lines())
    assert "candidates_selected" in body
    assert "done" in body


def test_status_returns_json():
    with patch("fee_crawler.magellan_api._collect_status",
               new=AsyncMock(return_value={
                   "pending": 965, "rescued": 0, "dead": 0,
                   "needs_human": 0, "retry_after": 0,
                   "today_cost_usd": 0.0, "circuit": {"halted": False},
               })):
        with TestClient(app) as client:
            r = client.get("/magellan/status")
    assert r.status_code == 200
    assert r.json()["pending"] == 965


def test_reset_endpoint():
    calls = {}

    async def fake_reset(actor):
        calls["actor"] = actor
        return {"ok": True}

    with patch("fee_crawler.magellan_api._reset_circuit", new=fake_reset):
        with TestClient(app) as client:
            r = client.post("/magellan/reset", json={"actor": "jgmbp"})
    assert r.status_code == 200
    assert calls["actor"] == "jgmbp"

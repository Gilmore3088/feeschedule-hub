"""Sidecar API tests. Uses FastAPI TestClient + mocked orchestrator."""
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from fee_crawler.darwin_api import app
from fee_crawler.agents.darwin.orchestrator import BatchResult


def test_classify_batch_streams_sse():
    fake_result = BatchResult(
        processed=5, promoted=4, cached_low_conf=1, duration_s=1.2,
    )

    async def fake_classify(conn, size, *, config=None, on_event=None):
        await on_event({"type": "batch_start", "size": size})
        await on_event({"type": "candidates_selected", "count": 5})
        await on_event({"type": "done", "result": fake_result.to_dict()})
        return fake_result

    with patch("fee_crawler.darwin_api.classify_batch", new=fake_classify):
        with patch("fee_crawler.darwin_api._get_conn", new=AsyncMock(return_value=AsyncMock())):
            with TestClient(app) as client:
                with client.stream("POST", "/darwin/classify-batch", json={"size": 5}) as r:
                    lines = [l for l in r.iter_lines()]
    body = "\n".join(lines)
    assert "batch_start" in body
    assert "candidates_selected" in body
    assert "done" in body


def test_status_endpoint_returns_json():
    with patch("fee_crawler.darwin_api._collect_status", new=AsyncMock(return_value={
        "pending": 50000, "today_promoted": 0, "today_cost_usd": 0.0,
        "circuit": {"halted": False}, "recent_run_avg_tokens_per_row": None,
    })):
        with TestClient(app) as client:
            r = client.get("/darwin/status")
    assert r.status_code == 200
    assert r.json()["pending"] == 50000


def test_reset_endpoint_clears_halt():
    calls = {}

    async def fake_reset(actor):
        calls["actor"] = actor
        return {"ok": True}

    with patch("fee_crawler.darwin_api._reset_circuit", new=fake_reset):
        with TestClient(app) as client:
            r = client.post("/darwin/reset", json={"actor": "jgmbp"})
    assert r.status_code == 200
    assert calls["actor"] == "jgmbp"

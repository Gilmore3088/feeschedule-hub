"""Historical backfill unit tests (S-03 + C-01 skeleton).

Verifies the orchestrator's enumerate + dry-run behavior with the
stub ingesters. NO network, no DB. Real ingest implementations are
operator follow-up.
"""

from datetime import date

import pytest

from fee_crawler.commands.historical_backfill import (
    INGESTERS,
    BackfillResult,
    FdicSdpIngester,
    WaybackIngester,
    run_backfill,
)


def test_ingester_registry_has_known_sources():
    assert "fdic_sdp" in INGESTERS
    assert "wayback_machine" in INGESTERS


def test_fdic_lists_quarter_ends_in_window():
    ing = FdicSdpIngester()
    out = list(ing.list_available(date(2020, 1, 1), date(2020, 12, 31)))
    dates = [d for d, _ in out]
    # Q1..Q4 ends: Mar 31, Jun 30, Sep 30, Dec 31
    assert date(2020, 3, 31) in dates
    assert date(2020, 6, 30) in dates
    assert date(2020, 9, 30) in dates
    assert date(2020, 12, 31) in dates


def test_fdic_list_excludes_dates_outside_window():
    ing = FdicSdpIngester()
    # Window is exactly Q2 2021 → should yield exactly one date.
    out = list(ing.list_available(date(2021, 4, 1), date(2021, 6, 30)))
    assert len(out) == 1
    assert out[0][0] == date(2021, 6, 30)


def test_fdic_fetch_raises_not_implemented_with_clear_msg():
    """Stubbed sources must fail loudly on --apply so operators don't
    silently insert empty rows."""
    ing = FdicSdpIngester()
    with pytest.raises(NotImplementedError) as exc:
        ing.fetch(date(2024, 12, 31), "https://example.com/fee.csv")
    assert "FDIC SDP" in str(exc.value)
    assert "operator action required" in str(exc.value).lower()


def test_wayback_fetch_raises_not_implemented_with_clear_msg():
    ing = WaybackIngester()
    with pytest.raises(NotImplementedError) as exc:
        ing.fetch(date(2024, 1, 1), "https://example.com/")
    assert "Wayback" in str(exc.value)


def test_run_backfill_unknown_source_raises():
    with pytest.raises(ValueError, match="unknown source"):
        run_backfill("not_a_source", since=date(2020, 1, 1), until=date(2020, 12, 31))


def test_run_backfill_dry_run_returns_count_without_fetch():
    result = run_backfill(
        "fdic_sdp",
        since=date(2023, 1, 1),
        until=date(2023, 12, 31),
        apply=False,
    )
    assert isinstance(result, BackfillResult)
    assert result.dry_run is True
    assert result.enumerated == 4          # 4 quarter-ends in 2023
    assert result.fetched == 0
    assert result.rows_inserted == 0
    assert result.failed == 0


def test_run_backfill_apply_raises_on_stub():
    """Calling --apply against a stubbed source must raise so the
    operator knows the ingester isn't implemented yet."""
    with pytest.raises(NotImplementedError):
        run_backfill(
            "fdic_sdp",
            since=date(2024, 1, 1),
            until=date(2024, 3, 31),
            apply=True,
        )


def test_backfill_result_to_dict_serializes_dates():
    """to_dict must produce JSON-safe values (dates → ISO strings)."""
    import json
    r = BackfillResult(
        source="fdic_sdp",
        window_since=date(2020, 1, 1),
        window_until=date(2024, 12, 31),
        enumerated=20, fetched=18, rows_inserted=540, failed=2,
        dry_run=False,
    )
    json.dumps(r.to_dict())   # must not raise
    assert r.to_dict()["window_since"] == "2020-01-01"

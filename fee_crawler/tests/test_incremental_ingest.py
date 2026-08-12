from datetime import date
from types import SimpleNamespace

from fee_crawler.commands import (
    ingest_bls,
    ingest_call_reports,
    ingest_census_acs,
    ingest_cfpb,
    ingest_fdic,
    ingest_fred,
    ingest_nyfed,
    ingest_ncua,
    ingest_ofr,
    ingest_sod,
)


class FakeDb:
    def __init__(self, latest: str | None):
        self.latest = latest
        self.bulk_calls = []

    def fetchone(self, sql, _params=()):
        if "MAX(" in sql:
            return {"latest": self.latest}
        if "COUNT(" in sql:
            return {"cnt": 0}
        return None

    def execute_values(self, sql, params, *, page_size=1000):
        self.bulk_calls.append((sql, params, page_size))

    def commit(self):
        return None


def test_fred_ingest_uses_revision_window_and_bulk_upsert(monkeypatch):
    seen = {}
    monkeypatch.setattr(
        ingest_fred,
        "_fetch_series_info",
        lambda *_args, **_kwargs: {
            "title": "Series",
            "units": "Percent",
            "frequency": "Monthly",
        },
    )

    def fetch(*_args, **kwargs):
        seen["from_date"] = kwargs["from_date"]
        return [{"date": "2026-08-01", "value": "4.2"}]

    monkeypatch.setattr(ingest_fred, "_fetch_series", fetch)
    db = FakeDb("2026-08-01")

    count = ingest_fred.ingest_series(db, "key", "UNRATE")

    assert count == 1
    assert seen["from_date"] == "2026-05-03"
    assert len(db.bulk_calls) == 1
    assert "ON CONFLICT (series_id, observation_date)" in db.bulk_calls[0][0]
    assert db.bulk_calls[0][1][0][0] == "UNRATE"


def test_nyfed_ingest_uses_revision_window_and_updates_existing_rows(monkeypatch):
    seen = {}

    def fetch(*_args, **kwargs):
        seen["start_date"] = kwargs["start_date"]
        return [{"effectiveDate": "2026-08-01", "percentRate": 5.1}]

    monkeypatch.setattr(ingest_nyfed, "_fetch_rates", fetch)
    db = FakeDb("2026-08-01")

    count = ingest_nyfed.ingest_rate_type(
        db,
        "EFFR",
        ingest_nyfed.RATE_TYPES["EFFR"],
    )

    assert count == 1
    assert seen["start_date"] == "2026-07-18"
    assert len(db.bulk_calls) == 1
    assert "DO UPDATE SET" in db.bulk_calls[0][0]
    assert db.bulk_calls[0][1][0][0] == "NYFED_EFFR"


def test_bls_ingest_batches_observations(monkeypatch):
    monkeypatch.setattr(
        ingest_bls,
        "_fetch_series_batch",
        lambda *_args: {
            "CUUR0000SEMC": [
                {"year": "2026", "period": "M01", "value": "118.5"},
                {"year": "2026", "period": "M13", "value": "118.5"},
            ]
        },
    )
    db = FakeDb(None)

    count = ingest_bls.ingest_bls_series(
        db,
        "key",
        {"CUUR0000SEMC": "Bank services"},
        start_year=2025,
        end_year=2026,
    )

    assert count == 1
    assert len(db.bulk_calls) == 1
    assert db.bulk_calls[0][1][0][3] == "2026-01-01"


def test_ofr_ingest_uses_revision_window_and_bulk_upsert(monkeypatch):
    epoch_ms = int(
        ingest_ofr.datetime(2026, 8, 1, tzinfo=ingest_ofr.timezone.utc).timestamp()
        * 1000
    )

    class Response:
        def raise_for_status(self):
            return None

        def json(self):
            return {"OFRFSI": {"data": [[epoch_ms, 1.25]]}}

    monkeypatch.setattr(ingest_ofr.requests, "get", lambda *_args, **_kwargs: Response())
    db = FakeDb("2026-08-01")

    ingest_ofr.run(db, object())

    assert len(db.bulk_calls) == 1
    assert db.bulk_calls[0][1][0][3] == "2026-08-01"


def test_fdic_default_window_tracks_recent_completed_quarters():
    assert ingest_fdic._recent_report_dates(3, today=date(2026, 8, 10)) == [
        "20260630",
        "20260331",
        "20251231",
    ]


def test_fdic_ingest_bulk_upserts_each_api_page(monkeypatch):
    class FdicDb(FakeDb):
        def fetchall(self, _sql, _params=()):
            return [{"id": 7, "cert_number": "123"}]

    class Response:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "data": [
                    {
                        "data": {
                            "CERT": "123",
                            "REPDTE": "20260630",
                            "ASSET": "250000",
                            "SC": "45000",
                            "NONII": "500",
                            "INTINC": "1000",
                            "EINTEXP": "250",
                        }
                    }
                ],
                "meta": {"total": 1},
            }

    monkeypatch.setattr(ingest_fdic.requests, "get", lambda *_args, **_kwargs: Response())
    db = FdicDb(None)
    config = SimpleNamespace(
        fdic_api=SimpleNamespace(base_url="https://example.test", page_size=1000)
    )

    count = ingest_fdic.ingest_fdic_financials(db, config, report_date="20260630")

    assert count == 1
    assert len(db.bulk_calls) == 1
    assert db.bulk_calls[0][1][0][0:3] == (7, "2026-06-30", "fdic")
    assert "DO UPDATE SET" in db.bulk_calls[0][0]


def test_ncua_default_quarter_respects_release_lag():
    assert ingest_ncua._latest_released_quarter(today=date(2026, 8, 10)) == (2026, 3)
    assert ingest_ncua._latest_released_quarter(today=date(2026, 8, 15)) == (2026, 6)


def test_call_report_page_bulk_upsert_preserves_dollar_scaling(monkeypatch):
    calls = []
    monkeypatch.setattr(
        ingest_call_reports.psycopg2.extras,
        "execute_values",
        lambda cursor, sql, rows, page_size: calls.append(
            (cursor, sql, rows, page_size)
        ),
    )
    cursor = object()
    row = ingest_call_reports._financial_values(
        7,
        "123",
        "2026-03-31",
        {"ASSET": "250000", "DEP": "150000", "LNLSNET": "100000"},
        45_000_000,
        500_000,
        46_000_000,
        0.9783,
    )

    ingest_call_reports._bulk_upsert_financials(cursor, [row], [])

    assert len(calls) == 1
    assert "ON CONFLICT (crawl_target_id, report_date, source)" in calls[0][1]
    assert calls[0][2][0][4:7] == (250_000_000, 150_000_000, 100_000_000)
    assert calls[0][2][0][7:9] == (45_000_000, 500_000)


def test_cfpb_reuses_aggregation_response_and_bulk_upserts(monkeypatch):
    class Cursor:
        pass

    class Connection:
        def __init__(self):
            self.commits = 0

        def cursor(self):
            return Cursor()

        def commit(self):
            self.commits += 1

    calls = []
    bulk_calls = []
    payload = {
        "aggregations": {
            "company": {
                "company": {
                    "buckets": [
                        {"key": "Example Bank", "doc_count": 4},
                        {"key": "Example Bancorp", "doc_count": 3},
                    ]
                }
            },
            "issue": {"issue": {"buckets": [{"key": "Fees or interest", "doc_count": 3}]}},
        }
    }
    monkeypatch.setattr(ingest_cfpb, "_build_name_index", lambda _conn: {"EXAMPLE": 7})
    monkeypatch.setattr(
        ingest_cfpb,
        "_fetch_with_retry",
        lambda *_args, **_kwargs: calls.append(True) or payload,
    )
    monkeypatch.setattr(
        ingest_cfpb.psycopg2.extras,
        "execute_values",
        lambda cursor, sql, rows, page_size: bulk_calls.append((cursor, sql, rows, page_size)),
    )

    count = ingest_cfpb.ingest_cfpb_complaints(Connection(), object(), years=["2025"])

    assert count == len(ingest_cfpb.RELEVANT_PRODUCTS)
    assert len(calls) == len(ingest_cfpb.RELEVANT_PRODUCTS)
    assert len(bulk_calls) == len(ingest_cfpb.RELEVANT_PRODUCTS)
    assert bulk_calls[0][2][0][0:2] == (7, "2025")
    assert bulk_calls[0][2][0][-1] == 7


def test_census_acs_bulk_upserts_each_api_response(monkeypatch):
    monkeypatch.setattr(
        ingest_census_acs,
        "_fetch_acs",
        lambda *_args, **_kwargs: [
            ["NAME", "B19013_001E", "B17001_002E", "B01003_001E", "state"],
            ["Example", "70000", "100", "1000", "06"],
        ],
    )
    db = FakeDb(None)

    count = ingest_census_acs.ingest_demographics(
        db,
        None,
        year=2024,
        level="state",
    )

    assert count == 1
    assert len(db.bulk_calls) == 1
    assert "ON CONFLICT (geo_id, geo_type, year) DO UPDATE" in db.bulk_calls[0][0]
    assert db.bulk_calls[0][1][0] == (
        "state:06",
        "state",
        "Example",
        "06",
        None,
        70000,
        100,
        1000,
        2024,
    )


def test_census_acs_fails_fast_without_api_key(monkeypatch):
    monkeypatch.delenv("CENSUS_API_KEY", raising=False)

    try:
        ingest_census_acs.run(FakeDb(None), object())
    except RuntimeError as exc:
        assert "CENSUS_API_KEY is required" in str(exc)
    else:
        raise AssertionError("missing Census credentials must not be false-green")


def test_sod_uses_latest_complete_year_and_bulk_upserts(monkeypatch):
    assert ingest_sod._default_sod_year(today=date(2026, 8, 10)) == 2025

    class SodDb(FakeDb):
        def fetchall(self, _sql, _params=()):
            return [{"id": 7, "cert_number": "123"}]

    class Response:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "data": [
                    {
                        "data": {
                            "CERT": "123",
                            "YEAR": "2025",
                            "BRNUM": "1",
                            "BKMO": "1",
                            "DEPSUMBR": "5000",
                            "MSABR": "12345",
                            "MSANAMB": "Example MSA",
                        }
                    }
                ],
                "meta": {"total": 1},
            }

    monkeypatch.setattr(ingest_sod.requests, "get", lambda *_args, **_kwargs: Response())
    db = SodDb(None)
    config = SimpleNamespace(
        fdic_api=SimpleNamespace(base_url="https://example.test", page_size=1000)
    )

    count = ingest_sod.ingest_sod(db, config, year=2025)

    assert count == 1
    assert len(db.bulk_calls) == 2
    assert "INSERT INTO branch_deposits" in db.bulk_calls[0][0]
    assert db.bulk_calls[0][1][0][0:5] == (123, 7, 2025, 1, True)
    assert "INSERT INTO market_concentration" in db.bulk_calls[1][0]

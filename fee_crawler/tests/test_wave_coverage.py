"""
Tests for wave DB models and coverage/recommendation engine.

Uses unittest.mock to avoid requiring a live DB connection.
"""
import unittest
from unittest.mock import MagicMock, patch, call
from datetime import datetime, timezone


# ─── Task 1: Wave DB model tests ─────────────────────────────────────────────

class TestCreateWaveRun(unittest.TestCase):
    """create_wave_run inserts wave_runs + wave_state_runs rows."""

    def _make_conn(self, wave_run_id=1):
        """Build a mock psycopg2 connection that simulates INSERT RETURNING."""
        conn = MagicMock()
        cur = MagicMock()
        conn.cursor.return_value = cur
        # fetchone() returns the inserted id for the wave_runs INSERT
        cur.fetchone.return_value = {"id": wave_run_id}
        return conn, cur

    def test_create_wave_run_returns_wave_run(self):
        from fee_crawler.wave.models import create_wave_run, WaveRun
        conn, cur = self._make_conn(wave_run_id=5)
        result = create_wave_run(conn, states=["WY", "MT", "TX"], wave_size=3)
        self.assertIsInstance(result, WaveRun)
        self.assertEqual(result.id, 5)

    def test_create_wave_run_inserts_wave_runs_row(self):
        from fee_crawler.wave.models import create_wave_run
        conn, cur = self._make_conn()
        create_wave_run(conn, states=["WY", "MT"], wave_size=2)
        # First execute call should be the wave_runs INSERT
        first_call_sql = cur.execute.call_args_list[0][0][0]
        self.assertIn("wave_runs", first_call_sql.lower())
        self.assertIn("insert", first_call_sql.lower())

    def test_create_wave_run_inserts_state_rows(self):
        from fee_crawler.wave.models import create_wave_run
        conn, cur = self._make_conn()
        states = ["WY", "MT", "TX"]
        create_wave_run(conn, states=states, wave_size=3)
        # Should have at least len(states) state row inserts
        all_calls = [c[0][0].lower() for c in cur.execute.call_args_list]
        state_inserts = [c for c in all_calls if "wave_state_runs" in c and "insert" in c]
        # Either one batch insert or one per state
        total_state_inserts = sum(
            c[0][1].count("WY") + c[0][1].count("MT") + c[0][1].count("TX")
            if len(c[0]) > 1 and isinstance(c[0][1], str)
            else 0
            for c in cur.execute.call_args_list
        )
        self.assertGreaterEqual(len(state_inserts), 1)

    def test_create_wave_run_state_list(self):
        from fee_crawler.wave.models import create_wave_run
        conn, cur = self._make_conn()
        states = ["WY", "MT", "TX"]
        result = create_wave_run(conn, states=states, wave_size=3)
        self.assertEqual(result.states, states)

    def test_create_wave_run_with_campaign_id(self):
        from fee_crawler.wave.models import create_wave_run
        conn, cur = self._make_conn()
        result = create_wave_run(conn, states=["WY"], wave_size=1, campaign_id="Q1-2026")
        self.assertEqual(result.campaign_id, "Q1-2026")

    def test_create_wave_run_commits(self):
        from fee_crawler.wave.models import create_wave_run
        conn, cur = self._make_conn()
        create_wave_run(conn, states=["WY"], wave_size=1)
        conn.commit.assert_called()


class TestUpdateWaveState(unittest.TestCase):
    """update_wave_state sets status, agent_run_id, error on wave_state_runs."""

    def _make_conn(self):
        conn = MagicMock()
        cur = MagicMock()
        conn.cursor.return_value = cur
        return conn, cur

    def test_update_wave_state_complete(self):
        from fee_crawler.wave.models import update_wave_state
        conn, cur = self._make_conn()
        update_wave_state(conn, wave_run_id=1, state_code="WY", status="complete", agent_run_id=42)
        all_sql = " ".join(c[0][0].lower() for c in cur.execute.call_args_list)
        self.assertIn("wave_state_runs", all_sql)
        self.assertIn("update", all_sql)
        # Verify commit was called
        conn.commit.assert_called()

    def test_update_wave_state_sets_agent_run_id(self):
        from fee_crawler.wave.models import update_wave_state
        conn, cur = self._make_conn()
        update_wave_state(conn, wave_run_id=1, state_code="WY", status="complete", agent_run_id=42)
        # agent_run_id=42 should appear in the params
        all_params = [c[0][1] for c in cur.execute.call_args_list if len(c[0]) > 1]
        flat_params = [p for params in all_params for p in (params if isinstance(params, (list, tuple)) else [params])]
        self.assertIn(42, flat_params)

    def test_update_wave_state_with_error(self):
        from fee_crawler.wave.models import update_wave_state
        conn, cur = self._make_conn()
        update_wave_state(conn, wave_run_id=1, state_code="MT", status="failed", error="timeout")
        all_params = [c[0][1] for c in cur.execute.call_args_list if len(c[0]) > 1]
        flat_params = [p for params in all_params for p in (params if isinstance(params, (list, tuple)) else [params])]
        self.assertIn("timeout", flat_params)


class TestGetIncompleteStates(unittest.TestCase):
    """get_incomplete_states returns states not in complete/skipped."""

    def _make_conn(self, rows):
        conn = MagicMock()
        cur = MagicMock()
        conn.cursor.return_value = cur
        cur.fetchall.return_value = rows
        return conn, cur

    def test_get_incomplete_states_excludes_complete(self):
        from fee_crawler.wave.models import get_incomplete_states
        # Simulate DB returning 2 incomplete states
        conn, cur = self._make_conn([{"state_code": "WY"}, {"state_code": "MT"}])
        result = get_incomplete_states(conn, wave_run_id=1)
        self.assertEqual(result, ["WY", "MT"])

    def test_get_incomplete_states_uses_correct_query(self):
        from fee_crawler.wave.models import get_incomplete_states
        conn, cur = self._make_conn([])
        get_incomplete_states(conn, wave_run_id=99)
        sql = cur.execute.call_args[0][0].lower()
        self.assertIn("wave_state_runs", sql)
        self.assertIn("wave_run_id", sql)
        # Should exclude complete and skipped
        self.assertTrue("complete" in sql or "not in" in sql)

    def test_get_incomplete_states_empty_when_all_done(self):
        from fee_crawler.wave.models import get_incomplete_states
        conn, cur = self._make_conn([])
        result = get_incomplete_states(conn, wave_run_id=1)
        self.assertEqual(result, [])


class TestGetWaveRun(unittest.TestCase):
    """get_wave_run returns WaveRun or None."""

    def _make_conn(self, row):
        conn = MagicMock()
        cur = MagicMock()
        conn.cursor.return_value = cur
        cur.fetchone.return_value = row
        return conn, cur

    def test_get_wave_run_returns_wave_run(self):
        from fee_crawler.wave.models import get_wave_run, WaveRun
        row = {
            "id": 7,
            "states": ["WY", "MT"],
            "wave_size": 2,
            "total_states": 2,
            "completed_states": 1,
            "failed_states": 0,
            "status": "running",
            "created_at": datetime.now(timezone.utc),
            "completed_at": None,
            "campaign_id": None,
        }
        conn, cur = self._make_conn(row)
        result = get_wave_run(conn, wave_run_id=7)
        self.assertIsInstance(result, WaveRun)
        self.assertEqual(result.id, 7)
        self.assertEqual(result.status, "running")

    def test_get_wave_run_returns_none_when_missing(self):
        from fee_crawler.wave.models import get_wave_run
        conn, cur = self._make_conn(None)
        result = get_wave_run(conn, wave_run_id=999)
        self.assertIsNone(result)


# ─── Task 2: Coverage and recommendation tests ────────────────────────────────

class TestGetStateCoverage(unittest.TestCase):
    """get_state_coverage computes per-state coverage from crawl_targets."""

    def _make_conn(self, rows):
        conn = MagicMock()
        cur = MagicMock()
        conn.cursor.return_value = cur
        cur.fetchall.return_value = rows
        return conn, cur

    def test_get_state_coverage_returns_list(self):
        from fee_crawler.wave.coverage import get_state_coverage, StateCoverage
        rows = [
            {"state_code": "WY", "total_institutions": 10, "institutions_with_fees": 3},
            {"state_code": "MT", "total_institutions": 20, "institutions_with_fees": 10},
        ]
        conn, cur = self._make_conn(rows)
        result = get_state_coverage(conn)
        self.assertIsInstance(result, list)
        self.assertEqual(len(result), 2)
        self.assertIsInstance(result[0], StateCoverage)

    def test_get_state_coverage_computes_pct(self):
        from fee_crawler.wave.coverage import get_state_coverage
        rows = [{"state_code": "WY", "total_institutions": 10, "institutions_with_fees": 3}]
        conn, cur = self._make_conn(rows)
        result = get_state_coverage(conn)
        self.assertAlmostEqual(result[0].coverage_pct, 30.0)

    def test_get_state_coverage_100_pct(self):
        from fee_crawler.wave.coverage import get_state_coverage
        rows = [{"state_code": "TX", "total_institutions": 100, "institutions_with_fees": 100}]
        conn, cur = self._make_conn(rows)
        result = get_state_coverage(conn)
        self.assertAlmostEqual(result[0].coverage_pct, 100.0)

    def test_get_state_coverage_0_pct(self):
        from fee_crawler.wave.coverage import get_state_coverage
        rows = [{"state_code": "ND", "total_institutions": 50, "institutions_with_fees": 0}]
        conn, cur = self._make_conn(rows)
        result = get_state_coverage(conn)
        self.assertAlmostEqual(result[0].coverage_pct, 0.0)

    def test_get_state_coverage_fields(self):
        from fee_crawler.wave.coverage import get_state_coverage, StateCoverage
        rows = [{"state_code": "CA", "total_institutions": 500, "institutions_with_fees": 250}]
        conn, cur = self._make_conn(rows)
        result = get_state_coverage(conn)
        sc = result[0]
        self.assertEqual(sc.state_code, "CA")
        self.assertEqual(sc.total_institutions, 500)
        self.assertEqual(sc.institutions_with_fees, 250)


class TestRecommendStates(unittest.TestCase):
    """recommend_states returns states sorted by coverage_pct ascending."""

    def _make_coverage(self, state_code, total, with_fees):
        from fee_crawler.wave.coverage import StateCoverage
        pct = (with_fees / total) * 100.0 if total > 0 else 0.0
        return StateCoverage(
            state_code=state_code,
            total_institutions=total,
            institutions_with_fees=with_fees,
            coverage_pct=pct,
        )

    def test_recommend_states_sorted_by_coverage_asc(self):
        from fee_crawler.wave.recommend import recommend_states
        coverage_rows = [
            {"state_code": "WY", "total_institutions": 45, "institutions_with_fees": 2},
            {"state_code": "MT", "total_institutions": 62, "institutions_with_fees": 5},
            {"state_code": "TX", "total_institutions": 500, "institutions_with_fees": 300},
        ]
        conn = MagicMock()
        cur = MagicMock()
        conn.cursor.return_value = cur
        cur.fetchall.return_value = coverage_rows
        result = recommend_states(conn, wave_size=3)
        # Lowest coverage first
        self.assertEqual(result[0].state_code, "WY")  # 4.4%
        self.assertEqual(result[1].state_code, "MT")  # 8.1%
        self.assertEqual(result[2].state_code, "TX")  # 60%

    def test_recommend_states_wave_size_limits_results(self):
        from fee_crawler.wave.recommend import recommend_states
        coverage_rows = [
            {"state_code": f"S{i}", "total_institutions": 100, "institutions_with_fees": i}
            for i in range(10)
        ]
        conn = MagicMock()
        cur = MagicMock()
        conn.cursor.return_value = cur
        cur.fetchall.return_value = coverage_rows
        result = recommend_states(conn, wave_size=5)
        self.assertEqual(len(result), 5)

    def test_recommend_states_excludes_zero_institution_states(self):
        from fee_crawler.wave.recommend import recommend_states
        coverage_rows = [
            {"state_code": "WY", "total_institutions": 0, "institutions_with_fees": 0},
            {"state_code": "MT", "total_institutions": 62, "institutions_with_fees": 5},
        ]
        conn = MagicMock()
        cur = MagicMock()
        conn.cursor.return_value = cur
        cur.fetchall.return_value = coverage_rows
        result = recommend_states(conn, wave_size=5)
        state_codes = [r.state_code for r in result]
        self.assertNotIn("WY", state_codes)

    def test_recommend_states_excludes_given_states(self):
        from fee_crawler.wave.recommend import recommend_states
        coverage_rows = [
            {"state_code": "WY", "total_institutions": 45, "institutions_with_fees": 2},
            {"state_code": "MT", "total_institutions": 62, "institutions_with_fees": 5},
        ]
        conn = MagicMock()
        cur = MagicMock()
        conn.cursor.return_value = cur
        cur.fetchall.return_value = coverage_rows
        result = recommend_states(conn, wave_size=5, exclude=["WY"])
        state_codes = [r.state_code for r in result]
        self.assertNotIn("WY", state_codes)


class TestPrintRecommendations(unittest.TestCase):
    """print_recommendations outputs a formatted table."""

    def _make_coverage(self, state_code, total, with_fees):
        from fee_crawler.wave.coverage import StateCoverage
        pct = (with_fees / total) * 100.0 if total > 0 else 0.0
        return StateCoverage(
            state_code=state_code,
            total_institutions=total,
            institutions_with_fees=with_fees,
            coverage_pct=pct,
        )

    def test_print_recommendations_outputs_to_stdout(self):
        import io
        import sys
        from fee_crawler.wave.recommend import print_recommendations

        states = [
            self._make_coverage("WY", 45, 2),
            self._make_coverage("MT", 62, 5),
        ]
        captured = io.StringIO()
        sys.stdout = captured
        try:
            print_recommendations(states, wave_size=2)
        finally:
            sys.stdout = sys.__stdout__

        output = captured.getvalue()
        self.assertIn("WY", output)
        self.assertIn("MT", output)

    def test_print_recommendations_has_headers(self):
        import io
        import sys
        from fee_crawler.wave.recommend import print_recommendations

        states = [self._make_coverage("WY", 45, 2)]
        captured = io.StringIO()
        sys.stdout = captured
        try:
            print_recommendations(states, wave_size=1)
        finally:
            sys.stdout = sys.__stdout__

        output = captured.getvalue()
        # Should contain column headers
        output_lower = output.lower()
        self.assertTrue(
            "rank" in output_lower or "state" in output_lower or "coverage" in output_lower
        )


if __name__ == "__main__":
    unittest.main()

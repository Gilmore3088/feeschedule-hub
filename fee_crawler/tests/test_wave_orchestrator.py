"""
Unit tests for fee_crawler/wave/orchestrator.py.

Uses unittest.mock to avoid live DB and state agent calls.
Tests verify sequential execution, per-state error handling,
hard error propagation, resume support, and campaign chunking.
"""
from __future__ import annotations

import unittest
from unittest.mock import MagicMock, call, patch
import psycopg2

from fee_crawler.wave.orchestrator import (
    MAX_CONCURRENT_STATES,
    run_wave,
    resume_wave,
    run_campaign,
)


def _make_conn():
    """Return a minimal mock connection."""
    return MagicMock()


def _make_wave_run(wave_id: int, states: list[str]):
    """Return a mock WaveRun dataclass."""
    wr = MagicMock()
    wr.id = wave_id
    wr.states = states
    wr.total_states = len(states)
    return wr


class TestMaxConcurrentStates(unittest.TestCase):
    """MAX_CONCURRENT_STATES constant must be 1 (cron slot budget enforcement)."""

    def test_max_concurrent_states_is_one(self):
        self.assertEqual(MAX_CONCURRENT_STATES, 1)


class TestRunWave(unittest.TestCase):
    """run_wave() creates a wave, runs each state sequentially, updates statuses."""

    def setUp(self):
        self.conn = _make_conn()

    @patch("fee_crawler.wave.orchestrator.run_state_agent")
    @patch("fee_crawler.wave.orchestrator.update_wave_run")
    @patch("fee_crawler.wave.orchestrator.update_wave_state")
    @patch("fee_crawler.wave.orchestrator.update_wave_state_pass")
    @patch("fee_crawler.wave.orchestrator._get_coverage_pct")
    @patch("fee_crawler.wave.orchestrator.create_wave_run")
    @patch("fee_crawler.wave.orchestrator.ensure_tables")
    def test_run_wave_creates_wave_run_and_runs_states(
        self,
        mock_ensure,
        mock_create,
        mock_coverage,
        mock_update_pass,
        mock_update_state,
        mock_update_run,
        mock_run_agent,
    ):
        states = ["WY", "MT"]
        wave = _make_wave_run(7, states)
        mock_create.return_value = wave
        mock_coverage.return_value = 50.0
        mock_run_agent.return_value = {"run_id": 101, "discovered": 5, "classified": 5, "extracted": 5, "validated": 5, "failed": 0}

        result = run_wave(self.conn, states=states)

        mock_ensure.assert_called_once_with(self.conn)
        mock_create.assert_called_once_with(self.conn, states, len(states), None)
        # 2 states x 3 passes = 6 agent calls
        self.assertEqual(mock_run_agent.call_count, 6)
        self.assertEqual(result, 7)

    @patch("fee_crawler.wave.orchestrator.run_state_agent")
    @patch("fee_crawler.wave.orchestrator.update_wave_run")
    @patch("fee_crawler.wave.orchestrator.update_wave_state")
    @patch("fee_crawler.wave.orchestrator.update_wave_state_pass")
    @patch("fee_crawler.wave.orchestrator._get_coverage_pct")
    @patch("fee_crawler.wave.orchestrator.create_wave_run")
    @patch("fee_crawler.wave.orchestrator.ensure_tables")
    def test_run_wave_calls_states_sequentially(
        self,
        mock_ensure,
        mock_create,
        mock_coverage,
        mock_update_pass,
        mock_update_state,
        mock_update_run,
        mock_run_agent,
    ):
        """States run in order: all WY passes then all MT passes, not interleaved."""
        states = ["WY", "MT"]
        wave = _make_wave_run(1, states)
        mock_create.return_value = wave
        mock_coverage.return_value = 50.0
        call_order = []

        def capture_state(state_code, pass_number=1, strategy=None):
            call_order.append(state_code)
            return {"run_id": pass_number, "discovered": 1, "classified": 1, "extracted": 1, "validated": 1, "failed": 0}

        mock_run_agent.side_effect = capture_state

        run_wave(self.conn, states=states)

        # WY runs all 3 passes, then MT runs all 3 passes
        self.assertEqual(call_order, ["WY", "WY", "WY", "MT", "MT", "MT"])

    @patch("fee_crawler.wave.orchestrator.run_state_agent")
    @patch("fee_crawler.wave.orchestrator.update_wave_run")
    @patch("fee_crawler.wave.orchestrator.update_wave_state")
    @patch("fee_crawler.wave.orchestrator.update_wave_state_pass")
    @patch("fee_crawler.wave.orchestrator._get_coverage_pct")
    @patch("fee_crawler.wave.orchestrator.create_wave_run")
    @patch("fee_crawler.wave.orchestrator.ensure_tables")
    def test_per_state_error_marks_failed_and_continues(
        self,
        mock_ensure,
        mock_create,
        mock_coverage,
        mock_update_pass,
        mock_update_state,
        mock_update_run,
        mock_run_agent,
    ):
        """When all passes for MT raise soft exceptions, wave continues to ID."""
        states = ["WY", "MT", "ID"]
        wave = _make_wave_run(2, states)
        mock_create.return_value = wave
        mock_coverage.return_value = 50.0

        def agent_side_effect(state_code, pass_number=1, strategy=None):
            if state_code == "MT":
                raise ValueError("Connection timeout")
            return {"run_id": pass_number, "discovered": 1, "classified": 1, "extracted": 1, "validated": 1, "failed": 0}

        mock_run_agent.side_effect = agent_side_effect

        # Should not raise — all MT passes are soft errors, WY and ID succeed
        run_wave(self.conn, states=states)

        # WY (3 passes) + MT (3 passes, all fail) + ID (3 passes) = 9 agent calls
        self.assertEqual(mock_run_agent.call_count, 9)

        # MT was marked failed via update_wave_state
        failed_calls = [
            c for c in mock_update_state.call_args_list
            if len(c.args) >= 3 and c.args[2] == "MT" and c.kwargs.get("status") == "failed"
        ]
        self.assertEqual(len(failed_calls), 1)

    @patch("fee_crawler.wave.orchestrator.run_state_agent")
    @patch("fee_crawler.wave.orchestrator.update_wave_run")
    @patch("fee_crawler.wave.orchestrator.update_wave_state")
    @patch("fee_crawler.wave.orchestrator.update_wave_state_pass")
    @patch("fee_crawler.wave.orchestrator._get_coverage_pct")
    @patch("fee_crawler.wave.orchestrator.create_wave_run")
    @patch("fee_crawler.wave.orchestrator.ensure_tables")
    def test_hard_failure_stops_campaign(
        self,
        mock_ensure,
        mock_create,
        mock_coverage,
        mock_update_pass,
        mock_update_state,
        mock_update_run,
        mock_run_agent,
    ):
        """psycopg2.OperationalError is a hard failure — campaign stops immediately."""
        states = ["WY", "MT"]
        wave = _make_wave_run(3, states)
        mock_create.return_value = wave
        mock_coverage.return_value = 50.0
        mock_run_agent.side_effect = psycopg2.OperationalError("DB connection lost")

        with self.assertRaises(psycopg2.OperationalError):
            run_wave(self.conn, states=states)

        # Only WY pass 1 was attempted (hard failure stops immediately)
        self.assertEqual(mock_run_agent.call_count, 1)

    @patch("fee_crawler.wave.orchestrator.run_state_agent")
    @patch("fee_crawler.wave.orchestrator.update_wave_run")
    @patch("fee_crawler.wave.orchestrator.update_wave_state")
    @patch("fee_crawler.wave.orchestrator.update_wave_state_pass")
    @patch("fee_crawler.wave.orchestrator._get_coverage_pct")
    @patch("fee_crawler.wave.orchestrator.create_wave_run")
    @patch("fee_crawler.wave.orchestrator.ensure_tables")
    def test_wave_run_status_set_to_running_then_complete(
        self,
        mock_ensure,
        mock_create,
        mock_coverage,
        mock_update_pass,
        mock_update_state,
        mock_update_run,
        mock_run_agent,
    ):
        states = ["WY"]
        wave = _make_wave_run(4, states)
        mock_create.return_value = wave
        mock_coverage.return_value = 50.0
        mock_run_agent.return_value = {"run_id": 1, "discovered": 1, "classified": 1, "extracted": 1, "validated": 1, "failed": 0}

        run_wave(self.conn, states=states)

        # status was set to "running" at start
        running_calls = [c for c in mock_update_run.call_args_list if c.kwargs.get("status") == "running"]
        self.assertTrue(len(running_calls) >= 1)

        # status was eventually set to "complete"
        complete_calls = [c for c in mock_update_run.call_args_list if c.kwargs.get("status") == "complete"]
        self.assertTrue(len(complete_calls) >= 1)


class TestResumeWave(unittest.TestCase):
    """resume_wave() fetches incomplete states and only runs those."""

    def setUp(self):
        self.conn = _make_conn()

    @patch("fee_crawler.wave.orchestrator.run_state_agent")
    @patch("fee_crawler.wave.orchestrator.update_wave_run")
    @patch("fee_crawler.wave.orchestrator.update_wave_state")
    @patch("fee_crawler.wave.orchestrator.update_wave_state_pass")
    @patch("fee_crawler.wave.orchestrator._get_coverage_pct")
    @patch("fee_crawler.wave.orchestrator.get_last_completed_pass")
    @patch("fee_crawler.wave.orchestrator.get_incomplete_states")
    def test_resume_only_runs_incomplete_states(
        self,
        mock_incomplete,
        mock_last_pass,
        mock_coverage,
        mock_update_pass,
        mock_update_state,
        mock_update_run,
        mock_run_agent,
    ):
        """WY completed before crash — only MT and ID are resumed from their last pass."""
        mock_incomplete.return_value = ["MT", "ID"]
        mock_last_pass.return_value = 0  # no passes completed yet for these states
        mock_coverage.return_value = 50.0
        mock_run_agent.return_value = {"run_id": 2, "discovered": 1, "classified": 1, "extracted": 1, "validated": 1, "failed": 0}

        result = resume_wave(self.conn, wave_run_id=5)

        mock_incomplete.assert_called_once_with(self.conn, 5)
        # MT (3 passes) + ID (3 passes) = 6 agent calls; WY was already complete
        self.assertEqual(mock_run_agent.call_count, 6)
        called_states = [c.args[0] for c in mock_run_agent.call_args_list]
        self.assertNotIn("WY", called_states)
        self.assertIn("MT", called_states)
        self.assertIn("ID", called_states)
        self.assertEqual(result, 5)

    @patch("fee_crawler.wave.orchestrator.run_state_agent")
    @patch("fee_crawler.wave.orchestrator.update_wave_run")
    @patch("fee_crawler.wave.orchestrator.update_wave_state")
    @patch("fee_crawler.wave.orchestrator.get_incomplete_states")
    def test_resume_when_all_complete_does_not_run_agents(
        self,
        mock_incomplete,
        mock_update_state,
        mock_update_run,
        mock_run_agent,
    ):
        """If all states are complete, resume is a no-op."""
        mock_incomplete.return_value = []

        result = resume_wave(self.conn, wave_run_id=6)

        mock_run_agent.assert_not_called()
        self.assertEqual(result, 6)


class TestRunCampaign(unittest.TestCase):
    """run_campaign() chunks states into waves and auto-advances."""

    def setUp(self):
        self.conn = _make_conn()

    @patch("fee_crawler.wave.orchestrator.run_wave")
    @patch("fee_crawler.wave.orchestrator.recommend_states")
    def test_campaign_chunks_states_into_waves(
        self,
        mock_recommend,
        mock_run_wave,
    ):
        """10 states / wave_size=3 → 4 waves (3, 3, 3, 1)."""
        from fee_crawler.wave.coverage import StateCoverage

        states_10 = [
            StateCoverage(sc, 100, 0, 0.0)
            for sc in ["AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA"]
        ]
        mock_recommend.return_value = states_10
        mock_run_wave.side_effect = [1, 2, 3, 4]

        wave_ids = run_campaign(self.conn, wave_size=3)

        # 4 run_wave calls with correct chunk sizes
        self.assertEqual(mock_run_wave.call_count, 4)
        call_chunks = [c.args[1] for c in mock_run_wave.call_args_list]
        self.assertEqual(len(call_chunks[0]), 3)
        self.assertEqual(len(call_chunks[1]), 3)
        self.assertEqual(len(call_chunks[2]), 3)
        self.assertEqual(len(call_chunks[3]), 1)
        self.assertEqual(wave_ids, [1, 2, 3, 4])

    @patch("fee_crawler.wave.orchestrator.run_wave")
    @patch("fee_crawler.wave.orchestrator.recommend_states")
    def test_campaign_uses_provided_states_override(
        self,
        mock_recommend,
        mock_run_wave,
    ):
        """When states list is provided, recommend_states is NOT called."""
        mock_run_wave.return_value = 1

        wave_ids = run_campaign(self.conn, wave_size=5, states=["WY", "MT", "ID"])

        mock_recommend.assert_not_called()
        self.assertEqual(mock_run_wave.call_count, 1)

    @patch("fee_crawler.wave.orchestrator.run_wave")
    @patch("fee_crawler.wave.orchestrator.recommend_states")
    def test_campaign_stops_on_hard_failure(
        self,
        mock_recommend,
        mock_run_wave,
    ):
        """If a wave raises OperationalError, campaign stops — remaining waves not run."""
        from fee_crawler.wave.coverage import StateCoverage

        states_6 = [
            StateCoverage(sc, 100, 0, 0.0)
            for sc in ["AL", "AK", "AZ", "AR", "CA", "CO"]
        ]
        mock_recommend.return_value = states_6
        mock_run_wave.side_effect = [1, psycopg2.OperationalError("DB gone")]

        with self.assertRaises(psycopg2.OperationalError):
            run_campaign(self.conn, wave_size=2)

        # First wave succeeded, second raised, third was never called
        self.assertEqual(mock_run_wave.call_count, 2)

    @patch("fee_crawler.wave.orchestrator.run_wave")
    def test_campaign_with_empty_states_runs_nothing(
        self,
        mock_run_wave,
    ):
        """An explicit empty states list means no waves are run."""
        wave_ids = run_campaign(self.conn, wave_size=8, states=[])
        mock_run_wave.assert_not_called()
        self.assertEqual(wave_ids, [])


if __name__ == "__main__":
    unittest.main()

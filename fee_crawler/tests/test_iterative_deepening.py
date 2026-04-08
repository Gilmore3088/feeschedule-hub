"""
Tests for iterative deepening: strategy tiers, parameterized state agent,
pass-level knowledge logging.

Phase: 20-iterative-deepening
Plans: 20-01 (this file), 20-02 (orchestrator pass loop added later)
"""
import unittest
from unittest.mock import MagicMock, patch, call


# ─── Task 1: StrategyTier module tests ───────────────────────────────────────

class TestStrategyTierDefinitions(unittest.TestCase):
    """TIER1/TIER2/TIER3 constants have correct escalating boolean fields."""

    def test_strategy_tier_definitions(self):
        from fee_crawler.agents.strategy import TIER1, TIER2, TIER3

        # TIER1: fast/cheap — no deep crawl, no PDF hunt, no keyword search
        self.assertEqual(TIER1.name, "tier1")
        self.assertTrue(TIER1.use_sitemap)
        self.assertTrue(TIER1.use_common_paths)
        self.assertFalse(TIER1.use_deep_crawl)
        self.assertFalse(TIER1.use_pdf_hunt)
        self.assertFalse(TIER1.use_keyword_search)

        # TIER2: medium — deep crawl + PDF hunt, no keyword search
        self.assertEqual(TIER2.name, "tier2")
        self.assertTrue(TIER2.use_sitemap)
        self.assertTrue(TIER2.use_common_paths)
        self.assertTrue(TIER2.use_deep_crawl)
        self.assertTrue(TIER2.use_pdf_hunt)
        self.assertFalse(TIER2.use_keyword_search)

        # TIER3: aggressive — all strategies active
        self.assertEqual(TIER3.name, "tier3")
        self.assertTrue(TIER3.use_sitemap)
        self.assertTrue(TIER3.use_common_paths)
        self.assertTrue(TIER3.use_deep_crawl)
        self.assertTrue(TIER3.use_pdf_hunt)
        self.assertTrue(TIER3.use_keyword_search)


class TestTierForPassMapping(unittest.TestCase):
    """tier_for_pass() maps pass numbers to correct strategy tiers."""

    def test_tier_for_pass_mapping(self):
        from fee_crawler.agents.strategy import tier_for_pass, TIER1, TIER2, TIER3

        self.assertEqual(tier_for_pass(1), TIER1)
        self.assertEqual(tier_for_pass(2), TIER2)
        self.assertEqual(tier_for_pass(3), TIER3)
        # Any pass >= 3 returns TIER3
        self.assertEqual(tier_for_pass(5), TIER3)
        self.assertEqual(tier_for_pass(10), TIER3)


class TestStrategyTierFrozen(unittest.TestCase):
    """StrategyTier is a frozen dataclass — immutable."""

    def test_strategy_tier_frozen(self):
        from fee_crawler.agents.strategy import TIER1

        with self.assertRaises((AttributeError, TypeError)):
            TIER1.use_deep_crawl = True  # type: ignore[misc]


class TestDiscoverUrlStrategySignature(unittest.TestCase):
    """discover_url() accepts strategy kwarg without breaking."""

    def test_discover_url_accepts_strategy_kwarg(self):
        import inspect
        from fee_crawler.agents.discover import discover_url

        sig = inspect.signature(discover_url)
        params = sig.parameters
        self.assertIn("strategy", params,
                      "discover_url() must accept a 'strategy' keyword argument")

    def test_discover_url_strategy_defaults_to_none(self):
        import inspect
        from fee_crawler.agents.discover import discover_url

        sig = inspect.signature(discover_url)
        strategy_param = sig.parameters["strategy"]
        self.assertIsNone(strategy_param.default,
                          "strategy parameter default must be None for backward compat")


# ─── Task 2: DB schema + parameterized state agent tests ─────────────────────

class TestStateAgentDefaultParams(unittest.TestCase):
    """run_state_agent() defaults to pass_number=1, strategy='tier1'."""

    def _make_conn(self):
        conn = MagicMock()
        cur = MagicMock()
        conn.cursor.return_value = cur
        # Stage 1 inventory returns empty list (no institutions)
        cur.fetchall.return_value = []
        # agent_runs INSERT RETURNING id
        cur.fetchone.return_value = {"id": 99}
        return conn, cur

    def test_state_agent_default_params(self):
        """Default call inserts pass_number=1 and strategy='tier1' into agent_runs."""
        conn, cur = self._make_conn()

        with patch("fee_crawler.agents.state_agent._connect", return_value=conn), \
             patch("fee_crawler.agents.state_agent.load_knowledge", return_value=""), \
             patch("fee_crawler.agents.state_agent.get_known_failures", return_value=[]), \
             patch("fee_crawler.agents.state_agent._generate_learnings", return_value=[]), \
             patch("fee_crawler.agents.state_agent.write_learnings"), \
             patch("fee_crawler.agents.state_agent.should_prune_state", return_value=False):

            from fee_crawler.agents.state_agent import run_state_agent
            result = run_state_agent("XX")

        # Find the INSERT INTO agent_runs call
        all_calls = cur.execute.call_args_list
        insert_calls = [
            c for c in all_calls
            if len(c[0]) >= 1 and "insert into agent_runs" in c[0][0].lower()
        ]
        self.assertTrue(insert_calls, "Expected INSERT INTO agent_runs call")
        params = insert_calls[0][0][1]
        # pass_number=1 and strategy='tier1' must appear in params
        self.assertIn(1, params, "pass_number=1 expected in INSERT params")
        self.assertIn("tier1", params, "strategy='tier1' expected in INSERT params")

    def test_state_agent_returns_pass_and_strategy_keys(self):
        """Return dict includes pass_number and strategy keys."""
        conn, cur = self._make_conn()

        with patch("fee_crawler.agents.state_agent._connect", return_value=conn), \
             patch("fee_crawler.agents.state_agent.load_knowledge", return_value=""), \
             patch("fee_crawler.agents.state_agent.get_known_failures", return_value=[]), \
             patch("fee_crawler.agents.state_agent._generate_learnings", return_value=[]), \
             patch("fee_crawler.agents.state_agent.write_learnings"), \
             patch("fee_crawler.agents.state_agent.should_prune_state", return_value=False):

            from fee_crawler.agents.state_agent import run_state_agent
            result = run_state_agent("XX")

        self.assertIn("pass_number", result)
        self.assertIn("strategy", result)
        self.assertEqual(result["pass_number"], 1)
        self.assertEqual(result["strategy"], "tier1")


class TestStateAgentPass2NarrowsInventory(unittest.TestCase):
    """Pass 2+ inventory query uses NOT EXISTS to exclude already-extracted institutions."""

    def _make_conn(self):
        conn = MagicMock()
        cur = MagicMock()
        conn.cursor.return_value = cur
        cur.fetchall.return_value = []
        cur.fetchone.return_value = {"id": 100}
        return conn, cur

    def test_state_agent_pass2_narrows_inventory(self):
        """Pass 2 inventory SQL includes NOT EXISTS (SELECT 1 FROM extracted_fees ...)."""
        conn, cur = self._make_conn()

        with patch("fee_crawler.agents.state_agent._connect", return_value=conn), \
             patch("fee_crawler.agents.state_agent.load_knowledge", return_value=""), \
             patch("fee_crawler.agents.state_agent.get_known_failures", return_value=[]), \
             patch("fee_crawler.agents.state_agent._generate_learnings", return_value=[]), \
             patch("fee_crawler.agents.state_agent.write_learnings"), \
             patch("fee_crawler.agents.state_agent.should_prune_state", return_value=False):

            from fee_crawler.agents.state_agent import run_state_agent
            run_state_agent("XX", pass_number=2)

        # Find the first SELECT FROM crawl_targets call (Stage 1 inventory)
        all_calls = cur.execute.call_args_list
        inventory_calls = [
            c for c in all_calls
            if len(c[0]) >= 1 and "crawl_targets" in c[0][0].lower()
            and "select" in c[0][0].lower()
        ]
        self.assertTrue(inventory_calls, "Expected SELECT FROM crawl_targets")
        inventory_sql = inventory_calls[0][0][0].lower()
        # Must contain NOT EXISTS referencing extracted_fees
        self.assertIn("not exists", inventory_sql,
                      "Pass 2+ query must use NOT EXISTS to narrow inventory")
        self.assertIn("extracted_fees", inventory_sql,
                      "Pass 2+ query must reference extracted_fees table")

    def test_state_agent_pass1_uses_full_inventory(self):
        """Pass 1 inventory query does NOT use NOT EXISTS narrowing."""
        conn, cur = self._make_conn()

        with patch("fee_crawler.agents.state_agent._connect", return_value=conn), \
             patch("fee_crawler.agents.state_agent.load_knowledge", return_value=""), \
             patch("fee_crawler.agents.state_agent.get_known_failures", return_value=[]), \
             patch("fee_crawler.agents.state_agent._generate_learnings", return_value=[]), \
             patch("fee_crawler.agents.state_agent.write_learnings"), \
             patch("fee_crawler.agents.state_agent.should_prune_state", return_value=False):

            from fee_crawler.agents.state_agent import run_state_agent
            run_state_agent("XX", pass_number=1)

        all_calls = cur.execute.call_args_list
        inventory_calls = [
            c for c in all_calls
            if len(c[0]) >= 1 and "crawl_targets" in c[0][0].lower()
            and "select" in c[0][0].lower()
        ]
        self.assertTrue(inventory_calls, "Expected SELECT FROM crawl_targets")
        inventory_sql = inventory_calls[0][0][0].lower()
        self.assertNotIn("not exists", inventory_sql,
                         "Pass 1 query must not use NOT EXISTS narrowing")


class TestWriteLearningsIncludesPassInfo(unittest.TestCase):
    """write_learnings() output block contains pass number and strategy name."""

    def test_write_learnings_includes_pass_info(self):
        import tempfile
        import os
        from pathlib import Path

        # Write to a temp directory to avoid polluting the real knowledge dir
        with tempfile.TemporaryDirectory() as tmpdir:
            with patch("fee_crawler.knowledge.loader.KNOWLEDGE_DIR", Path(tmpdir)):
                # Create the states subdir
                (Path(tmpdir) / "states").mkdir()

                from fee_crawler.knowledge.loader import write_learnings
                stats = {
                    "discovered": 5,
                    "extracted": 3,
                    "failed": 2,
                    "pass_number": 2,
                    "strategy": "tier2",
                    "coverage_pct": 45.5,
                }
                write_learnings("XX", run_id=42, stats=stats, learnings=[])

                # Read the file back
                state_file = Path(tmpdir) / "states" / "XX.md"
                content = state_file.read_text()

        # Block must mention pass info
        self.assertIn("Pass 2", content, "Block must include 'Pass 2'")
        self.assertIn("tier2", content, "Block must include strategy name 'tier2'")

    def test_write_learnings_includes_coverage_pct(self):
        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as tmpdir:
            with patch("fee_crawler.knowledge.loader.KNOWLEDGE_DIR", Path(tmpdir)):
                (Path(tmpdir) / "states").mkdir()

                from fee_crawler.knowledge.loader import write_learnings
                stats = {
                    "discovered": 5,
                    "extracted": 3,
                    "failed": 2,
                    "pass_number": 1,
                    "strategy": "tier1",
                    "coverage_pct": 33.3,
                }
                write_learnings("YY", run_id=10, stats=stats, learnings=[])

                state_file = Path(tmpdir) / "states" / "YY.md"
                content = state_file.read_text()

        self.assertIn("33.3", content, "Block must include coverage percentage")

    def test_write_learnings_without_pass_info_still_works(self):
        """Backward compat: write_learnings without pass_number in stats must not crash."""
        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as tmpdir:
            with patch("fee_crawler.knowledge.loader.KNOWLEDGE_DIR", Path(tmpdir)):
                (Path(tmpdir) / "states").mkdir()

                from fee_crawler.knowledge.loader import write_learnings
                # Old-style call without pass_number
                stats = {"discovered": 2, "extracted": 1, "failed": 1}
                write_learnings("ZZ", run_id=5, stats=stats, learnings=[])

                state_file = Path(tmpdir) / "states" / "ZZ.md"
                content = state_file.read_text()

        self.assertIn("Run #5", content)


# ─── Task 2: WaveStateRun last_completed_pass tests ──────────────────────────

class TestWaveStateRunLastCompletedPass(unittest.TestCase):
    """wave_state_runs supports last_completed_pass for resume."""

    def test_wave_state_run_has_last_completed_pass_field(self):
        from fee_crawler.wave.models import WaveStateRun
        wsr = WaveStateRun(id=1, wave_run_id=1, state_code="WY")
        # Field must exist and default to 0
        self.assertTrue(hasattr(wsr, "last_completed_pass"),
                        "WaveStateRun must have last_completed_pass field")
        self.assertEqual(wsr.last_completed_pass, 0)

    def test_update_wave_state_pass_function_exists(self):
        from fee_crawler.wave import models
        self.assertTrue(
            hasattr(models, "update_wave_state_pass"),
            "models module must export update_wave_state_pass()"
        )

    def test_get_last_completed_pass_function_exists(self):
        from fee_crawler.wave import models
        self.assertTrue(
            hasattr(models, "get_last_completed_pass"),
            "models module must export get_last_completed_pass()"
        )

    def test_update_wave_state_pass_issues_update(self):
        from fee_crawler.wave.models import update_wave_state_pass
        conn = MagicMock()
        cur = MagicMock()
        conn.cursor.return_value = cur

        update_wave_state_pass(conn, wave_run_id=1, state_code="WY", last_completed_pass=2)

        all_calls = cur.execute.call_args_list
        update_calls = [
            c for c in all_calls
            if len(c[0]) >= 1 and "wave_state_runs" in c[0][0].lower()
        ]
        self.assertTrue(update_calls, "Expected UPDATE on wave_state_runs")
        conn.commit.assert_called()

    def test_get_last_completed_pass_returns_int(self):
        from fee_crawler.wave.models import get_last_completed_pass
        conn = MagicMock()
        cur = MagicMock()
        conn.cursor.return_value = cur
        cur.fetchone.return_value = {"last_completed_pass": 2}

        result = get_last_completed_pass(conn, wave_run_id=1, state_code="WY")
        self.assertEqual(result, 2)

    def test_get_last_completed_pass_returns_zero_when_not_found(self):
        from fee_crawler.wave.models import get_last_completed_pass
        conn = MagicMock()
        cur = MagicMock()
        conn.cursor.return_value = cur
        cur.fetchone.return_value = None

        result = get_last_completed_pass(conn, wave_run_id=1, state_code="WY")
        self.assertEqual(result, 0)


# ─── Task 2 (Plan 02): Per-pass log format tests ─────────────────────────────

class TestPerPassLogFormat(unittest.TestCase):
    """write_learnings() per-pass block uses 'Pass N (tierN)' and 'Coverage: X.X%' format."""

    def test_per_pass_log_format(self):
        """Block header contains 'Pass 2 (tier2)' and 'Coverage: 45.3%'."""
        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as tmpdir:
            with patch("fee_crawler.knowledge.loader.KNOWLEDGE_DIR", Path(tmpdir)):
                (Path(tmpdir) / "states").mkdir()

                from fee_crawler.knowledge.loader import write_learnings
                stats = {
                    "discovered": 5,
                    "extracted": 3,
                    "failed": 2,
                    "pass_number": 2,
                    "strategy": "tier2",
                    "coverage_pct": 45.3,
                }
                write_learnings("AA", run_id=7, stats=stats, learnings=[])

                content = (Path(tmpdir) / "states" / "AA.md").read_text()

        self.assertIn("Pass 2 (tier2)", content, "Block must contain 'Pass 2 (tier2)'")
        self.assertIn("Coverage: 45.3%", content, "Block must contain 'Coverage: 45.3%'")

    def test_per_pass_log_without_pass_info(self):
        """write_learnings without pass_number produces valid output (backward compat)."""
        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as tmpdir:
            with patch("fee_crawler.knowledge.loader.KNOWLEDGE_DIR", Path(tmpdir)):
                (Path(tmpdir) / "states").mkdir()

                from fee_crawler.knowledge.loader import write_learnings
                stats = {"discovered": 2, "extracted": 1, "failed": 1}
                write_learnings("BB", run_id=3, stats=stats, learnings=[])

                content = (Path(tmpdir) / "states" / "BB.md").read_text()

        self.assertIn("Run #3", content, "Block must include run ID")
        # Must NOT crash and must not contain 'Pass' when no pass_number given
        self.assertNotIn("Pass None", content)
        self.assertNotIn("Coverage: None", content)


# ─── Task 1 (Plan 02): Orchestrator inner pass loop tests ────────────────────

class TestOrchestratorPassLoop(unittest.TestCase):
    """_run_single_state executes 3 passes with tier-escalating strategies."""

    def _make_conn(self):
        conn = MagicMock()
        cur = MagicMock()
        cur.fetchone.return_value = {"coverage_pct": 50.0}
        conn.cursor.return_value = cur
        return conn, cur

    def _make_agent_result(self, run_id: int, pass_number: int = 1):
        return {
            "run_id": run_id,
            "discovered": 5,
            "extracted": 3,
            "failed": 0,
            "pass_number": pass_number,
            "strategy": f"tier{pass_number}",
        }

    def test_three_passes_created(self):
        """_run_single_state calls run_state_agent 3 times with tier escalation."""
        from fee_crawler.wave.orchestrator import _run_single_state
        from fee_crawler.agents.strategy import TIER1, TIER2, TIER3

        conn, cur = self._make_conn()
        agent_results = [
            self._make_agent_result(1, 1),
            self._make_agent_result(2, 2),
            self._make_agent_result(3, 3),
        ]

        with patch("fee_crawler.wave.orchestrator.run_state_agent", side_effect=agent_results) as mock_agent, \
             patch("fee_crawler.wave.orchestrator.update_wave_state") as mock_update_state, \
             patch("fee_crawler.wave.orchestrator.update_wave_state_pass") as mock_update_pass, \
             patch("fee_crawler.wave.orchestrator._get_coverage_pct", return_value=50.0):

            _run_single_state(conn, wave_run_id=1, state_code="WY")

        self.assertEqual(mock_agent.call_count, 3)
        calls = mock_agent.call_args_list
        self.assertEqual(calls[0], call("WY", pass_number=1, strategy=TIER1))
        self.assertEqual(calls[1], call("WY", pass_number=2, strategy=TIER2))
        self.assertEqual(calls[2], call("WY", pass_number=3, strategy=TIER3))

        # update_wave_state_pass called 3 times with last_completed_pass=1,2,3
        pass_calls = mock_update_pass.call_args_list
        self.assertEqual(len(pass_calls), 3)
        self.assertEqual(pass_calls[0], call(conn, 1, "WY", last_completed_pass=1, agent_run_id=1))
        self.assertEqual(pass_calls[1], call(conn, 1, "WY", last_completed_pass=2, agent_run_id=2))
        self.assertEqual(pass_calls[2], call(conn, 1, "WY", last_completed_pass=3, agent_run_id=3))

    def test_early_stop_after_three_passes(self):
        """Early stop fires after pass 3 when coverage >= 90%, not before."""
        from fee_crawler.wave.orchestrator import _run_single_state

        conn, cur = self._make_conn()
        agent_results = [
            self._make_agent_result(1, 1),
            self._make_agent_result(2, 2),
            self._make_agent_result(3, 3),
            self._make_agent_result(4, 4),
            self._make_agent_result(5, 5),
        ]

        with patch("fee_crawler.wave.orchestrator.run_state_agent", side_effect=agent_results) as mock_agent, \
             patch("fee_crawler.wave.orchestrator.update_wave_state"), \
             patch("fee_crawler.wave.orchestrator.update_wave_state_pass"), \
             patch("fee_crawler.wave.orchestrator._get_coverage_pct", return_value=95.0):

            # Even with max_passes=5 and 95% coverage, minimum 3 passes must run
            _run_single_state(conn, wave_run_id=1, state_code="WY", max_passes=5)

        # Early stop after pass 3 (3 >= 3 AND coverage >= 90%)
        self.assertEqual(mock_agent.call_count, 3)

    def test_early_stop_not_before_three(self):
        """Early stop cannot fire before 3 passes even if coverage >= 90% after pass 1."""
        from fee_crawler.wave.orchestrator import _run_single_state

        conn, cur = self._make_conn()
        agent_results = [
            self._make_agent_result(1, 1),
            self._make_agent_result(2, 2),
            self._make_agent_result(3, 3),
        ]

        with patch("fee_crawler.wave.orchestrator.run_state_agent", side_effect=agent_results) as mock_agent, \
             patch("fee_crawler.wave.orchestrator.update_wave_state"), \
             patch("fee_crawler.wave.orchestrator.update_wave_state_pass"), \
             patch("fee_crawler.wave.orchestrator._get_coverage_pct", return_value=95.0):

            _run_single_state(conn, wave_run_id=1, state_code="WY", max_passes=5)

        # Must still run 3 passes despite high coverage
        self.assertEqual(mock_agent.call_count, 3)

    def test_resume_from_last_pass(self):
        """start_pass=2 causes run_state_agent to be called with pass_number=2 first."""
        from fee_crawler.wave.orchestrator import _run_single_state

        conn, cur = self._make_conn()
        agent_results = [
            self._make_agent_result(2, 2),
            self._make_agent_result(3, 3),
        ]

        with patch("fee_crawler.wave.orchestrator.run_state_agent", side_effect=agent_results) as mock_agent, \
             patch("fee_crawler.wave.orchestrator.update_wave_state"), \
             patch("fee_crawler.wave.orchestrator.update_wave_state_pass"), \
             patch("fee_crawler.wave.orchestrator._get_coverage_pct", return_value=50.0):

            _run_single_state(conn, wave_run_id=1, state_code="WY", start_pass=2)

        calls = mock_agent.call_args_list
        self.assertEqual(calls[0][1]["pass_number"], 2)
        self.assertEqual(mock_agent.call_count, 2)

    def test_last_pass_run_id_recorded(self):
        """wave_state_runs.agent_run_id is set to the LAST pass's run_id after loop."""
        from fee_crawler.wave.orchestrator import _run_single_state

        conn, cur = self._make_conn()
        agent_results = [
            self._make_agent_result(10, 1),
            self._make_agent_result(11, 2),
            self._make_agent_result(12, 3),
        ]

        final_update_state_calls = []

        def capture_update_state(c, wid, sc, status, agent_run_id=None, error=None):
            final_update_state_calls.append((status, agent_run_id))

        with patch("fee_crawler.wave.orchestrator.run_state_agent", side_effect=agent_results), \
             patch("fee_crawler.wave.orchestrator.update_wave_state", side_effect=capture_update_state), \
             patch("fee_crawler.wave.orchestrator.update_wave_state_pass"), \
             patch("fee_crawler.wave.orchestrator._get_coverage_pct", return_value=50.0):

            _run_single_state(conn, wave_run_id=1, state_code="WY")

        # The final update_wave_state("complete") call should use run_id=12 (last pass)
        complete_calls = [c for c in final_update_state_calls if c[0] == "complete"]
        self.assertTrue(complete_calls, "Expected a 'complete' update_wave_state call")
        self.assertEqual(complete_calls[-1][1], 12)

    def test_coverage_pct_query(self):
        """_get_coverage_pct queries crawl_targets and returns float."""
        from fee_crawler.wave.orchestrator import _get_coverage_pct

        conn = MagicMock()
        cur = MagicMock()
        conn.cursor.return_value = cur
        # Simulate dict cursor row
        cur.fetchone.return_value = {"coverage_pct": 67.5}

        result = _get_coverage_pct(conn, "WY")
        self.assertAlmostEqual(result, 67.5)
        cur.execute.assert_called_once()
        sql = cur.execute.call_args[0][0].lower()
        self.assertIn("crawl_targets", sql)

    def test_coverage_pct_tuple_row(self):
        """_get_coverage_pct handles tuple rows (not just dict cursor)."""
        from fee_crawler.wave.orchestrator import _get_coverage_pct

        conn = MagicMock()
        cur = MagicMock()
        conn.cursor.return_value = cur
        cur.fetchone.return_value = (42.0,)

        result = _get_coverage_pct(conn, "MT")
        self.assertAlmostEqual(result, 42.0)

    def test_coverage_pct_none_row(self):
        """_get_coverage_pct returns 0.0 when no rows found."""
        from fee_crawler.wave.orchestrator import _get_coverage_pct

        conn = MagicMock()
        cur = MagicMock()
        conn.cursor.return_value = cur
        cur.fetchone.return_value = None

        result = _get_coverage_pct(conn, "AK")
        self.assertEqual(result, 0.0)


if __name__ == "__main__":
    unittest.main()

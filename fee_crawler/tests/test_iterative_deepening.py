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


if __name__ == "__main__":
    unittest.main()

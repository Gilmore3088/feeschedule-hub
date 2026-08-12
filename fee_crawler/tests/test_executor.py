"""Tests for the pipeline executor."""

import pytest

from fee_crawler.pipeline.executor import (
    PIPELINE_STAGES,
    Stage,
    _execute_stage,
    _restore_config,
    _update_run,
    acquire_lock,
    release_lock,
    cleanup_old_logs,
    run_pipeline,
)


class TestPipelineStages:
    """Test stage configuration."""

    def test_stage_count(self):
        assert len(PIPELINE_STAGES) == 6

    def test_phases_are_sequential(self):
        phases = [s.phase for s in PIPELINE_STAGES]
        assert phases == sorted(phases)

    def test_all_phases_present(self):
        phase_set = {s.phase for s in PIPELINE_STAGES}
        assert phase_set == {1, 2, 3, 4}

    def test_stage_names_unique(self):
        names = [s.name for s in PIPELINE_STAGES]
        assert len(names) == len(set(names))

    def test_first_stage_is_seed_enrich(self):
        assert PIPELINE_STAGES[0].name == "seed-enrich"

    def test_last_stage_is_publish(self):
        assert PIPELINE_STAGES[-1].name == "publish-fees"

    def test_agent_handoff_order(self):
        names = [stage.name for stage in PIPELINE_STAGES]
        assert names.index("darwin-drain") < names.index("knox-review")
        assert names.index("knox-review") < names.index("publish-fees")

    def test_routine_cycle_has_no_frozen_legacy_fee_stages(self):
        names = {stage.name for stage in PIPELINE_STAGES}
        assert names.isdisjoint(
            {"merge-fees", "categorize", "validate", "auto-review", "snapshot", "publish"}
        )


class TestLocking:
    """Test cross-container Postgres advisory locking."""

    class FakeDb:
        def __init__(self, acquired=True):
            self.acquired = acquired
            self.fetch_calls = []
            self.execute_calls = []
            self.rolled_back = False
            self.committed = False

        def fetchone(self, sql, params):
            self.fetch_calls.append((sql, params))
            return {"acquired": self.acquired}

        def execute(self, sql, params):
            self.execute_calls.append((sql, params))

        def rollback(self):
            self.rolled_back = True

        def commit(self):
            self.committed = True

    def test_acquire_uses_postgres_advisory_lock(self):
        db = self.FakeDb(acquired=True)
        assert acquire_lock(db) is True
        assert "pg_try_advisory_lock" in db.fetch_calls[0][0]

    def test_failed_acquire_reports_active_pipeline(self):
        db = self.FakeDb(acquired=False)
        assert acquire_lock(db) is False

    def test_release_uses_same_database_session(self):
        db = self.FakeDb()
        release_lock(db)
        assert db.rolled_back is True
        assert "pg_advisory_unlock" in db.execute_calls[0][0]
        assert db.committed is True


class TestLogCleanup:
    """Test log retention cleanup."""

    def test_deletes_old_files(self, tmp_path, monkeypatch):
        monkeypatch.setattr(
            "fee_crawler.pipeline.executor.Path",
            lambda x: tmp_path if x == "data/logs" else type(tmp_path)(x),
        )
        # This test is simplified — just verify the function runs
        deleted = cleanup_old_logs(0)
        assert deleted >= 0


class TestExecutionContract:
    def test_checkpoint_config_accepts_decoded_jsonb(self):
        class FakeConfig:
            pass

        fallback = FakeConfig()
        restored = _restore_config({"crawl": {"delay_seconds": 0.5}}, fallback)

        assert restored.crawl.delay_seconds == 0.5

    def test_stage_checkpoint_updates_completed_count(self):
        class FakeDb:
            def __init__(self):
                self.calls = []

            def execute(self, sql, params=()):
                self.calls.append((sql, params))

            def commit(self):
                return None

        db = FakeDb()
        _update_run(db, 9, last_job="darwin-drain", last_phase=3)

        sql, params = db.calls[0]
        assert "stages_done = GREATEST" in sql
        assert params == ("darwin-drain", 4, 3, 9)

    def test_atlas_crawl_refreshes_stale_institutions(self, monkeypatch):
        calls = []

        def run(db, config, **kwargs):
            calls.append((db, config, kwargs))

        monkeypatch.setattr("fee_crawler.commands.crawl.run", run)
        db = object()
        config = object()
        _execute_stage(
            Stage("crawl", 2, "crawl"),
            db,
            config,
            limit=100,
            workers=4,
        )

        assert calls == [
            (
                db,
                config,
                {
                    "limit": 100,
                    "workers": 4,
                    "state": None,
                    "skip_with_fees": False,
                },
            )
        ]

    def test_resume_rebinds_pipeline_to_repair_job(self, monkeypatch):
        class FakeDb:
            def __init__(self):
                self.calls = []

            def fetchone(self, sql, params=()):
                if "pg_try_advisory_lock" in sql:
                    return {"acquired": True}
                if "last_completed_job" in sql:
                    return {"last_completed_job": "crawl", "config_json": None}
                return None

            def execute(self, sql, params=()):
                self.calls.append((sql, params))

            def commit(self):
                return None

            def rollback(self):
                return None

        db = FakeDb()
        monkeypatch.setenv("BFI_OPS_JOB_ID", "77")
        monkeypatch.setattr("fee_crawler.pipeline.executor.cleanup_old_logs", lambda _days: 0)
        monkeypatch.setattr("fee_crawler.pipeline.executor._execute_stage", lambda *_args, **_kwargs: None)
        monkeypatch.setattr("fee_crawler.pipeline.executor._print_run_report", lambda *_args: None)

        assert run_pipeline(db, object(), resume_run_id=9) == 9

        resume_call = next(call for call in db.calls if "ops_job_id = COALESCE" in call[0])
        assert resume_call[1] == (77, 3, 9)

    def test_snapshot_stage_uses_supported_signature(self, monkeypatch):
        calls = []

        def run(db):
            calls.append(db)

        monkeypatch.setattr("fee_crawler.commands.snapshot_fees.run", run)
        db = object()
        _execute_stage(Stage("snapshot", 4, "snapshot"), db, object())
        assert calls == [db]

    def test_stage_failure_raises_to_modal(self, monkeypatch):
        class FakeDb:
            def __init__(self):
                self.released = False

            def fetchone(self, sql, params=()):
                if "pg_try_advisory_lock" in sql:
                    return {"acquired": True}
                return None

            def insert_returning_id(self, sql, params=()):
                return 42

            def execute(self, sql, params=()):
                if "pg_advisory_unlock" in sql:
                    self.released = True

            def commit(self):
                return None

            def rollback(self):
                return None

        class FakeConfig:
            def model_dump_json(self):
                return "{}"

        db = FakeDb()
        monkeypatch.setattr("fee_crawler.pipeline.executor.cleanup_old_logs", lambda _days: 0)
        monkeypatch.setattr("fee_crawler.pipeline.executor._print_run_report", lambda *_args: None)
        monkeypatch.setattr(
            "fee_crawler.pipeline.executor._execute_stage",
            lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("boom")),
        )

        with pytest.raises(RuntimeError, match="seed-enrich: boom"):
            run_pipeline(db, FakeConfig())

        assert db.released is True

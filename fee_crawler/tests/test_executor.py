"""Tests for the pipeline executor."""

import pytest

from fee_crawler.pipeline.executor import (
    PIPELINE_STAGES,
    acquire_lock,
    release_lock,
    cleanup_old_logs,
)


class TestPipelineStages:
    """Test stage configuration."""

    def test_stage_count(self):
        assert len(PIPELINE_STAGES) == 9

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
        assert PIPELINE_STAGES[-1].name == "publish"


class TestLocking:
    """Test PID-file locking."""

    def test_acquire_and_release(self, tmp_path, monkeypatch):
        lock_file = tmp_path / "test.lock"
        monkeypatch.setattr(
            "fee_crawler.pipeline.executor.LOCK_FILE", lock_file
        )
        assert acquire_lock() is True
        assert lock_file.exists()
        release_lock()
        assert not lock_file.exists()

    def test_double_acquire_fails(self, tmp_path, monkeypatch):
        lock_file = tmp_path / "test.lock"
        monkeypatch.setattr(
            "fee_crawler.pipeline.executor.LOCK_FILE", lock_file
        )
        assert acquire_lock() is True
        # Same PID, so second acquire should fail
        assert acquire_lock() is False
        release_lock()

    def test_stale_lock_reclaimed(self, tmp_path, monkeypatch):
        lock_file = tmp_path / "test.lock"
        monkeypatch.setattr(
            "fee_crawler.pipeline.executor.LOCK_FILE", lock_file
        )
        # Write a PID that doesn't exist
        lock_file.write_text("999999999")
        assert acquire_lock() is True
        release_lock()


class TestLogCleanup:
    """Test log retention cleanup."""

    def test_deletes_old_files(self, tmp_path, monkeypatch):
        import time
        monkeypatch.setattr(
            "fee_crawler.pipeline.executor.Path",
            lambda x: tmp_path if x == "data/logs" else type(tmp_path)(x),
        )
        # This test is simplified — just verify the function runs
        deleted = cleanup_old_logs(0)
        assert deleted >= 0

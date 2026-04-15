"""Unit tests for the run_checked helper and SubprocessFailed exception.

These tests cover:
- Successful subprocess returns CompletedProcess with returncode 0
- Non-zero exit raises SubprocessFailed with correct returncode
- stdout and stderr tails are captured in the exception message
- tail_lines parameter bounds the captured output
- cwd and env kwargs are forwarded to the subprocess
"""

import os
import sys
import pytest

modal = pytest.importorskip("modal", reason="modal package not installed; skipping")

from fee_crawler.modal_app import run_checked, SubprocessFailed  # noqa: E402


class TestRunCheckedSuccess:
    def test_zero_exit_returns_completed_process(self):
        result = run_checked([sys.executable, "-c", "import sys; sys.exit(0)"])
        assert result.returncode == 0

    def test_accepts_cwd_kwarg(self, tmp_path):
        result = run_checked(
            [sys.executable, "-c", "import os; print(os.getcwd())"],
            cwd=str(tmp_path),
        )
        assert result.returncode == 0
        assert str(tmp_path) in result.stdout

    def test_accepts_env_kwarg(self):
        custom_env = {**os.environ, "_BFI_TEST_VAR": "hello"}
        result = run_checked(
            [sys.executable, "-c", "import os; print(os.environ['_BFI_TEST_VAR'])"],
            env=custom_env,
        )
        assert result.returncode == 0
        assert "hello" in result.stdout


class TestRunCheckedFailure:
    def test_nonzero_exit_raises_subprocess_failed(self):
        with pytest.raises(SubprocessFailed) as exc_info:
            run_checked([sys.executable, "-c", "import sys; sys.exit(1)"])
        assert exc_info.value.returncode == 1

    def test_exception_contains_stdout_and_stderr_tails(self):
        script = (
            "import sys; "
            "print('OUT_LINE'); "
            "sys.stderr.write('ERR_LINE\\n'); "
            "sys.exit(2)"
        )
        with pytest.raises(SubprocessFailed) as exc_info:
            run_checked([sys.executable, "-c", script])
        msg = str(exc_info.value)
        assert "OUT_LINE" in msg
        assert "ERR_LINE" in msg
        assert exc_info.value.returncode == 2

    def test_tail_lines_bounds_captured_output(self):
        # Emit 100 lines to stdout, set tail_lines=5 — only last 5 should appear
        script = (
            "import sys; "
            "[print(f'line {i}') for i in range(100)]; "
            "sys.exit(1)"
        )
        with pytest.raises(SubprocessFailed) as exc_info:
            run_checked([sys.executable, "-c", script], tail_lines=5)
        # Last 5 lines should be present
        assert "line 99" in exc_info.value.stdout_tail
        assert "line 95" in exc_info.value.stdout_tail
        # Earlier lines should NOT be present (bounded by tail_lines=5)
        assert "line 90" not in exc_info.value.stdout_tail

    def test_subprocess_failed_stores_cmd(self):
        cmd = [sys.executable, "-c", "import sys; sys.exit(3)"]
        with pytest.raises(SubprocessFailed) as exc_info:
            run_checked(cmd)
        assert exc_info.value.cmd == cmd
        assert exc_info.value.returncode == 3

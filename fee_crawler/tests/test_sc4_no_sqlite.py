"""SC4: grep production paths returns zero sqlite hits."""
import subprocess


def test_sc4_grep_returns_zero():
    result = subprocess.run(
        ["bash", "scripts/ci-guards.sh", "sqlite-kill"],
        capture_output=True, text=True,
    )
    assert result.returncode == 0, (
        f"sqlite-kill guard failed:\nSTDOUT:{result.stdout}\nSTDERR:{result.stderr}"
    )

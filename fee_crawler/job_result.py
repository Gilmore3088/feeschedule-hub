"""File-based IPC for communicating job results to the Node.js job runner.

Writes a JSON result file atomically (write to temp, then rename).
The job runner reads this file on process exit, falling back to the
legacy ##RESULT_JSON## stdout sentinel if the file is missing.

Usage in commands:
    from fee_crawler.job_result import emit_result
    emit_result(result_dict)
"""

from __future__ import annotations

import json
import os
from pathlib import Path

RESULT_DIR = Path("data/logs")


def write_result(job_id: int, result: dict) -> Path:
    """Write job result as an atomic JSON file. Returns the file path."""
    RESULT_DIR.mkdir(parents=True, exist_ok=True)
    target = RESULT_DIR / f"{job_id}_result.json"
    tmp = target.with_suffix(".json.tmp")
    try:
        tmp.write_text(json.dumps(result, indent=2))
        tmp.replace(target)
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise
    return target


def emit_result(result: dict) -> None:
    """Emit a job result via file IPC if JOB_ID is set, otherwise stdout sentinel.

    Commands call this instead of manually printing ##RESULT_JSON##.
    When spawned by the job runner, JOB_ID env var is set automatically.
    When run from CLI directly, falls back to stdout for human readability.
    """
    job_id = os.environ.get("BFI_JOB_ID")
    if job_id:
        write_result(int(job_id), result)
    else:
        print(f"##RESULT_JSON##{json.dumps(result)}")

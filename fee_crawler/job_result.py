"""File-based IPC for communicating job results to the Node.js job runner.

Writes a JSON result file atomically (write to temp, then rename).
The job runner reads this file on process exit, falling back to the
legacy ##RESULT_JSON## stdout sentinel if the file is missing.
"""

from __future__ import annotations

import json
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

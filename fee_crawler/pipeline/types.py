"""Pipeline types for the crawl pipeline.

Typed dataclasses for passing data between pipeline steps.
Steps return errors as data; the orchestrator decides side effects.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

StepStatus = Literal["continue", "skip", "fail"]


@dataclass(frozen=True)
class CrawlContext:
    """Immutable input threaded through the pipeline."""

    target_id: int
    institution_name: str
    url: str
    doc_type: str
    state_code: str
    last_content_hash: str | None
    run_id: int
    dry_run: bool = False


@dataclass
class DownloadResult:
    """Output of the download step."""

    status: StepStatus
    content: bytes | None = None
    content_hash: str | None = None
    content_type: str | None = None
    document_path: str | None = None
    unchanged: bool = False
    error: str | None = None


@dataclass
class ExtractionResult:
    """Output of the text extraction step."""

    status: StepStatus
    text: str | None = None
    error: str | None = None


@dataclass
class LLMResult:
    """Output of the LLM fee extraction step."""

    status: StepStatus
    fees: list = field(default_factory=list)
    error: str | None = None


@dataclass
class CrawlOutcome:
    """Final pipeline output for one institution."""

    target_id: int
    name: str
    state_code: str
    doc_type: str
    status: str  # success | failed | unchanged
    fees: int = 0
    staged: int = 0
    flagged: int = 0
    message: str = ""

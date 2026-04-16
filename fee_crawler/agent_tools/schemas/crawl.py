"""Pydantic v2 schemas for crawl-domain tools (Plan 62A-08).

Owned by tools_crawl.py. Re-exported through fee_crawler/agent_tools/schemas/__init__.py
so callers continue using `from fee_crawler.agent_tools.schemas import <ClassName>`.
"""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import Field

from fee_crawler.agent_tools.schemas._base import (
    AgentEventRef,
    BaseToolInput,
    BaseToolOutput,
)


# ----------------------------------------------------------------------
# crawl_targets
# ----------------------------------------------------------------------

class UpdateCrawlTargetInput(BaseToolInput):
    crawl_target_id: int = Field(gt=0)
    status: Optional[Literal["active", "paused", "offline", "archived"]] = None
    fee_schedule_url: Optional[str] = None
    last_content_hash: Optional[str] = None
    document_type: Optional[str] = None


class UpdateCrawlTargetOutput(BaseToolOutput):
    event_ref: Optional[AgentEventRef] = None


# ----------------------------------------------------------------------
# crawl_results
# ----------------------------------------------------------------------

class CreateCrawlResultInput(BaseToolInput):
    crawl_target_id: int = Field(gt=0)
    crawl_run_id: Optional[int] = None
    document_url: Optional[str] = None
    document_path: Optional[str] = None
    status: str  # 'success' | 'failed' | 'blocked' | '404'
    status_code: Optional[int] = None
    content_hash: Optional[str] = None


class CreateCrawlResultOutput(BaseToolOutput):
    crawl_result_id: Optional[int] = None
    event_ref: Optional[AgentEventRef] = None


# ----------------------------------------------------------------------
# crawl_runs
# ----------------------------------------------------------------------

class CreateCrawlRunInput(BaseToolInput):
    trigger: str  # 'scheduled' | 'manual' | 'preflight' | 'wave'
    targets_total: int = Field(ge=0)


class CreateCrawlRunOutput(BaseToolOutput):
    crawl_run_id: Optional[int] = None
    event_ref: Optional[AgentEventRef] = None


class UpdateCrawlRunInput(BaseToolInput):
    crawl_run_id: int = Field(gt=0)
    status: Optional[Literal["running", "succeeded", "failed", "cancelled"]] = None
    targets_crawled: Optional[int] = Field(default=None, ge=0)
    targets_succeeded: Optional[int] = Field(default=None, ge=0)
    targets_failed: Optional[int] = Field(default=None, ge=0)


class UpdateCrawlRunOutput(BaseToolOutput):
    event_ref: Optional[AgentEventRef] = None


# ----------------------------------------------------------------------
# institution_dossiers — upsert (KNOX-03)
# ----------------------------------------------------------------------

class UpsertInstitutionDossierInput(BaseToolInput):
    institution_id: int = Field(gt=0)
    last_url_tried: Optional[str] = None
    last_document_format: Optional[Literal[
        "pdf", "html", "js_rendered", "stealth_pass_1", "stealth_pass_2", "unknown"
    ]] = None
    last_strategy: Optional[str] = None
    last_outcome: Optional[Literal[
        "success", "blocked", "404", "no_fees", "captcha", "rate_limited", "unknown"
    ]] = None
    last_cost_cents: int = Field(default=0, ge=0)
    next_try_recommendation: Optional[Literal[
        "retry_same", "stealth_pass_1", "needs_playwright_stealth", "skip", "rediscover_url"
    ]] = None
    notes: Dict[str, Any] = Field(default_factory=dict)


class UpsertInstitutionDossierOutput(BaseToolOutput):
    event_ref: Optional[AgentEventRef] = None


# ----------------------------------------------------------------------
# jobs
# ----------------------------------------------------------------------

class CreateJobInput(BaseToolInput):
    job_type: str  # 'extract' | 'discover' | 'classify' | 'recrawl' | other
    target_id: Optional[int] = None
    payload: Dict[str, Any] = Field(default_factory=dict)


class CreateJobOutput(BaseToolOutput):
    job_id: Optional[int] = None
    event_ref: Optional[AgentEventRef] = None


class UpdateJobInput(BaseToolInput):
    job_id: int = Field(gt=0)
    status: Literal["pending", "running", "succeeded", "failed", "cancelled"]
    error: Optional[str] = None
    result: Optional[Dict[str, Any]] = None


class UpdateJobOutput(BaseToolOutput):
    event_ref: Optional[AgentEventRef] = None


# ----------------------------------------------------------------------
# wave_runs + wave_state_runs
# ----------------------------------------------------------------------

class CreateWaveRunInput(BaseToolInput):
    wave_type: str  # 'quarterly' | 'remediation' | 'manual'
    state_codes: List[str] = Field(default_factory=list)
    planned_targets: int = Field(default=0, ge=0)


class CreateWaveRunOutput(BaseToolOutput):
    wave_run_id: Optional[int] = None
    event_ref: Optional[AgentEventRef] = None


class UpdateWaveStateRunInput(BaseToolInput):
    wave_state_run_id: int = Field(gt=0)
    status: Literal["pending", "running", "succeeded", "failed"]
    extracted_count: Optional[int] = Field(default=None, ge=0)
    failure_reason: Optional[str] = None


class UpdateWaveStateRunOutput(BaseToolOutput):
    event_ref: Optional[AgentEventRef] = None


__all__ = [
    "UpdateCrawlTargetInput", "UpdateCrawlTargetOutput",
    "CreateCrawlResultInput", "CreateCrawlResultOutput",
    "CreateCrawlRunInput", "CreateCrawlRunOutput",
    "UpdateCrawlRunInput", "UpdateCrawlRunOutput",
    "UpsertInstitutionDossierInput", "UpsertInstitutionDossierOutput",
    "CreateJobInput", "CreateJobOutput",
    "UpdateJobInput", "UpdateJobOutput",
    "CreateWaveRunInput", "CreateWaveRunOutput",
    "UpdateWaveStateRunInput", "UpdateWaveStateRunOutput",
]

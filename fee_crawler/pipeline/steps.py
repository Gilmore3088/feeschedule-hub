"""Pipeline steps for crawling fee schedules.

Each step is a pure function that takes typed inputs and returns a typed result.
Steps never touch the database -- the orchestrator handles all side effects.
I/O dependencies (HTTP client) are injected as parameters for testability.
"""

from __future__ import annotations

import functools
import logging
import time

from fee_crawler.config import Config
from fee_crawler.fee_analysis import FEE_FAMILIES, get_fee_family, normalize_fee_name
from fee_crawler.pipeline.download import download_document
from fee_crawler.pipeline.extract_html import extract_text_from_html
from fee_crawler.pipeline.extract_llm import ExtractedFee, extract_fees_with_llm
from fee_crawler.pipeline.extract_pdf import extract_text_from_pdf
from fee_crawler.pipeline.types import (
    CrawlContext,
    DownloadResult,
    ExtractionResult,
    LLMResult,
)
from fee_crawler.validation import (
    ValidationFlag,
    flags_to_json,
    validate_and_classify_fees,
)

logger = logging.getLogger("fee_crawler.pipeline")

_CANONICAL_SET: set[str] = set()
for _members in FEE_FAMILIES.values():
    _CANONICAL_SET.update(_members)


def timed_step(step_name: str | None = None):
    """Decorator that logs step execution time."""

    def decorator(func):
        name = step_name or func.__name__

        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            start = time.perf_counter()
            result = func(*args, **kwargs)
            elapsed = time.perf_counter() - start
            status = getattr(result, "status", "ok")
            logger.info("step.%s status=%s elapsed=%.3fs", name, status, elapsed)
            return result

        return wrapper

    return decorator


@timed_step("download")
def step_download(ctx: CrawlContext, config: Config) -> DownloadResult:
    """Step 1: Download the fee schedule document."""
    dl = download_document(
        ctx.url, ctx.target_id, config, last_hash=ctx.last_content_hash,
    )

    if not dl["success"]:
        return DownloadResult(
            status="fail",
            error=f"DOWNLOAD FAILED: {dl['error']}",
        )

    if dl["unchanged"]:
        return DownloadResult(
            status="skip",
            unchanged=True,
            content_hash=dl["content_hash"],
            content_type=dl.get("content_type"),
        )

    return DownloadResult(
        status="continue",
        content=dl["content"],
        content_hash=dl["content_hash"],
        content_type=dl.get("content_type"),
        document_path=dl.get("path"),
    )


@timed_step("extract")
def step_extract_text(ctx: CrawlContext, dl: DownloadResult) -> ExtractionResult:
    """Step 2: Extract text from PDF or HTML content."""
    content = dl.content
    if not content:
        return ExtractionResult(status="fail", error="No content to extract")

    content_type = dl.content_type or ""
    is_pdf = "application/pdf" in content_type or ctx.doc_type == "pdf"

    try:
        if is_pdf:
            text = extract_text_from_pdf(content)
        else:
            text = extract_text_from_html(content)
    except Exception as e:
        return ExtractionResult(
            status="fail",
            error=f"{'PDF' if is_pdf else 'HTML'} EXTRACT FAILED: {e}",
        )

    if not text or len(text.strip()) < 50:
        return ExtractionResult(status="fail", error="NO TEXT EXTRACTED")

    return ExtractionResult(status="continue", text=text)


@timed_step("llm")
def step_llm_extract(extraction: ExtractionResult, config: Config) -> LLMResult:
    """Step 3: Send text to LLM for structured fee extraction."""
    if not extraction.text:
        return LLMResult(status="fail", error="No text for LLM")

    try:
        fees = extract_fees_with_llm(extraction.text, config)
    except Exception as e:
        return LLMResult(status="fail", error=f"LLM FAILED: {e}")

    return LLMResult(status="continue", fees=fees)


def categorize_fee(fee: ExtractedFee) -> tuple[str | None, str | None]:
    """Dual categorization: alias-based (deterministic) wins, LLM fallback.

    Returns (fee_category, fee_family) or (None, None).
    """
    canonical = normalize_fee_name(fee.fee_name)
    if canonical in _CANONICAL_SET:
        return canonical, get_fee_family(canonical)

    llm_cat = getattr(fee, "llm_category", None)
    if llm_cat and llm_cat in _CANONICAL_SET:
        return llm_cat, get_fee_family(llm_cat)

    return None, None


def step_classify_and_validate(
    fees: list[ExtractedFee], config: Config,
) -> list[tuple[ExtractedFee, str | None, str | None, list[ValidationFlag], str]]:
    """Step 4+5: Categorize and validate fees.

    Returns list of (fee, category, family, flags, review_status) tuples.
    """
    cat_families = [categorize_fee(fee) for fee in fees]
    categories = [cf[0] for cf in cat_families]

    validated = validate_and_classify_fees(fees, config, categories=categories)

    results = []
    for i, (fee, flags, review_status) in enumerate(validated):
        category, family = cat_families[i]
        results.append((fee, category, family, flags, review_status))

    return results

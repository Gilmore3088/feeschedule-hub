"""LLM-side of Darwin — batch call + retry + validation.

Lifts the system prompt, tool definition, and validation logic from the
legacy classify_nulls.py and adds explicit retry + backoff wrappers.
"""
from __future__ import annotations

import asyncio
import logging
import os
import random
from typing import Any, Awaitable, Callable, Optional

import anthropic

from fee_crawler.agents.darwin.config import DarwinConfig
from fee_crawler.fee_analysis import (
    CANONICAL_KEY_MAP,
    NEVER_MERGE_PAIRS,
)

log = logging.getLogger(__name__)

_SYSTEM_PROMPT = """\
You are a bank fee taxonomy specialist. For each fee name, identify the canonical
fee category from the approved taxonomy. Only use canonical keys from the provided list.
If a fee does not match any canonical category, respond with null and confidence 0.0.
Never infer NSF from overdraft or vice versa — they are distinct regulatory categories.
"""

_TOOL = {
    "name": "classify_fees",
    "description": (
        "Return classification results for each fee name provided. "
        "Use only canonical_fee_key values from the approved taxonomy list. "
        "Set canonical_fee_key to null and confidence to 0.0 if no match found."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "classifications": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "fee_name": {"type": "string"},
                        "canonical_fee_key": {"type": ["string", "null"]},
                        "confidence": {"type": "number", "minimum": 0.0, "maximum": 1.0},
                    },
                    "required": ["fee_name", "canonical_fee_key", "confidence"],
                },
            }
        },
        "required": ["classifications"],
    },
}


def validate_llm_result(normalized_name: str, suggested_key: str) -> bool:
    """Reject hallucinated keys and cross-category suggestions."""
    if suggested_key not in CANONICAL_KEY_MAP:
        return False
    for member_a, member_b in NEVER_MERGE_PAIRS:
        name_has_a = (member_a.replace("_", " ") in normalized_name
                      or member_a in normalized_name)
        name_has_b = (member_b.replace("_", " ") in normalized_name
                      or member_b in normalized_name)
        if name_has_a and suggested_key == member_b:
            return False
        if name_has_b and suggested_key == member_a:
            return False
    return True


def build_prompt(names: list[str]) -> tuple[str, str]:
    """Returns (system, user) prompts for a given batch of names."""
    valid_keys = sorted(CANONICAL_KEY_MAP.keys())
    keys_text = ", ".join(valid_keys)
    fee_list = "\n".join(f"- {n}" for n in names)
    user = (
        f"Classify each of the following bank fee names using only keys from the "
        f"approved taxonomy.\n\n"
        f"Approved canonical keys:\n{keys_text}\n\n"
        f"Fee names to classify:\n{fee_list}"
    )
    return _SYSTEM_PROMPT, user


async def _call_anthropic(names: list[str], config: DarwinConfig) -> list[dict]:
    """Single Anthropic call — no retry."""
    system, user = build_prompt(names)
    client = anthropic.AsyncAnthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
    resp = await client.messages.create(
        model=config.model,
        max_tokens=config.max_tokens,
        system=system,
        tools=[_TOOL],
        tool_choice={"type": "tool", "name": "classify_fees"},
        messages=[{"role": "user", "content": user}],
    )
    for block in resp.content:
        if block.type == "tool_use" and block.name == "classify_fees":
            return block.input.get("classifications", [])
    return []


async def classify_names_with_retry(
    names: list[str],
    *,
    config: DarwinConfig,
    _caller: Optional[Callable[[list[str]], Awaitable[list[dict]]]] = None,
) -> list[dict]:
    """Wraps one LLM call with exp-backoff retry on rate limits.

    Args:
        names: batch of normalized fee names (len <= config.llm_batch_size).
        _caller: override for tests. Default is _call_anthropic.

    Raises:
        anthropic.RateLimitError: after all retries exhausted.
        anthropic.APIConnectionError: same.
        anthropic.APIStatusError: on non-retryable 4xx (immediate re-raise).
    """
    caller = _caller or (lambda ns: _call_anthropic(ns, config))
    last_exc: Exception | None = None
    for attempt in range(config.max_retries + 1):
        try:
            return await caller(names)
        except anthropic.RateLimitError as e:
            last_exc = e
            retry_after = getattr(e, "retry_after", None) or 0
            wait = max(retry_after, config.backoff_base_seconds * (2 ** attempt) + random.random())
            log.warning("darwin rate limit attempt=%d wait=%.1fs", attempt, wait)
            if attempt == config.max_retries:
                raise
            await asyncio.sleep(min(wait, config.backoff_max_seconds))
        except anthropic.APIConnectionError as e:
            last_exc = e
            if attempt == config.max_retries:
                raise
            await asyncio.sleep(config.backoff_base_seconds * (2 ** attempt))
        except anthropic.APIStatusError:
            raise  # 4xx other than 429 is not retryable
    raise last_exc  # defensive; unreachable

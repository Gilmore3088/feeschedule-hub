"""LLM-side of Darwin — batch call + retry + validation.

Lifts the system prompt, tool definition, and validation logic from the
legacy classify_nulls.py and adds explicit retry + backoff wrappers.
"""
from __future__ import annotations

import asyncio
import logging
import os
import random
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Optional

import anthropic

from fee_crawler.agents.darwin.config import DarwinConfig
from fee_crawler.fee_analysis import (
    CANONICAL_KEY_MAP,
    NEVER_MERGE_PAIRS,
)


@dataclass
class FeeRow:
    """Context passed to the classifier. Richer than just a fee name."""
    fee_name: str
    amount: Optional[float] = None
    frequency: Optional[str] = None
    conditions: Optional[str] = None


# Common non-canonical names Darwin emits → map to the closest canonical key.
# Add new entries here when /admin/darwin shows recurring rejections for the
# same suggested_key. Each entry should be a safe, high-confidence mapping
# (e.g. "overdraft_privilege" ≡ "overdraft"); do NOT alias ambiguous names
# like "transfer_fee" or "debit_card_fee" that span multiple canonicals.
_CANONICAL_ALIASES: dict[str, str] = {
    # Only entries with empirical evidence in this session's row_complete data
    # belong here. Adding unverified aliases drives the LLM toward false matches
    # and was rolled back on 2026-06-06. New aliases must be backed by:
    # 1. agent_events row showing Darwin emitted the alias at >=0.85 conf, AND
    # 2. human or Knox confirmation that the alias maps to the canonical.
    "overdraft_privilege": "overdraft",
    "overdraft_protection": "overdraft",
    "dormant_fee": "dormant_account",
    "inactive_fee": "dormant_account",
    "all_other_atms": "atm_non_network",
    "non_network_atm": "atm_non_network",
    "out_of_network_atm": "atm_non_network",
    "international_atm": "atm_international",
    "return_item_charge": "nsf",
    "returned_item_charge": "nsf",
    "returned_deposited_item": "deposited_item_return",
    "deposited_item_returned": "deposited_item_return",
    "wire_outgoing": "wire_domestic_outgoing",
    "wire_incoming": "wire_domestic_incoming",
    "domestic_wire": "wire_domestic_outgoing",
    "rush_card_delivery": "rush_card",
}


def canonicalize_key(suggested_key: Optional[str]) -> Optional[str]:
    """Resolve an alias to its canonical key.

    CANONICAL_KEY_MAP is keyed by alias and its values ARE the canonical keys
    (many entries map a key to itself, others alias variants like
    "rush_card_delivery" -> "rush_card"). Local _CANONICAL_ALIASES covers
    extras Darwin has been observed to emit that the upstream map missed.
    """
    if suggested_key is None:
        return None
    if suggested_key in CANONICAL_KEY_MAP:
        return CANONICAL_KEY_MAP[suggested_key]
    aliased = _CANONICAL_ALIASES.get(suggested_key)
    if aliased and aliased in CANONICAL_KEY_MAP:
        return CANONICAL_KEY_MAP[aliased]
    return suggested_key

log = logging.getLogger(__name__)

_SYSTEM_PROMPT = """\
You are a bank fee taxonomy specialist. For each fee in the input list, identify
the canonical fee category from the approved taxonomy. Only use canonical keys
from the provided list. If a fee does not match any canonical category, respond
with null and confidence 0.0.

When the input has the form `- fee_name  (amount=$X, frequency=Y, conditions="…")`,
treat the bare token before the parenthesis as the fee_name and use the parenthetical
context to disambiguate. In your response, echo the bare fee_name exactly as it
appeared before the parenthesis (without the context).

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
    """Reject hallucinated keys and cross-category suggestions.

    Aliases are canonicalized first via canonicalize_key(), so common Darwin
    variants like 'overdraft_privilege' resolve to 'overdraft' before the
    NEVER_MERGE check runs.

    Daily-cap NEVER_MERGE pairs (nsf_daily_cap vs nsf, od_daily_cap vs overdraft)
    are bypassed when the fee name explicitly signals a cap/limit/maximum/daily
    structure — otherwise correctly-classified cap fees get rejected for sharing
    the parent keyword (e.g. "NSF Return Fee Daily Cap" -> nsf_daily_cap was
    being rejected because name contains "nsf").
    """
    canonical = canonicalize_key(suggested_key)
    if canonical not in CANONICAL_KEY_MAP:
        return False
    _CAP_SIGNAL_TOKENS = ("daily", "cap", "max", "maximum", "limit", "per day", "per_day")
    name_has_cap_signal = any(tok in normalized_name for tok in _CAP_SIGNAL_TOKENS)
    for member_a, member_b in NEVER_MERGE_PAIRS:
        # Skip cap-vs-parent pairs when name clearly says "cap/daily/max" —
        # those are exactly the cases where the cap key is correct.
        if member_a.endswith("_daily_cap") and name_has_cap_signal:
            continue
        name_has_a = (member_a.replace("_", " ") in normalized_name
                      or member_a in normalized_name)
        name_has_b = (member_b.replace("_", " ") in normalized_name
                      or member_b in normalized_name)
        if name_has_a and suggested_key == member_b:
            return False
        if name_has_b and suggested_key == member_a:
            return False
    return True


def _render_row(row: FeeRow) -> str:
    """Render one fee row as a contextual line for the LLM.

    The fee name is rendered first as the bare token so the LLM's tool-output
    `fee_name` field echoes the exact normalized name (used by the orchestrator
    to match the LLM response back to the candidate). Disambiguating context
    follows in parentheses as hints.
    """
    extras = []
    if row.amount is not None:
        extras.append(f"amount=${row.amount:.2f}")
    if row.frequency:
        extras.append(f"frequency={row.frequency}")
    if row.conditions:
        cond = row.conditions[:200].strip().replace('"', "'")
        extras.append(f'conditions="{cond}"')
    suffix = f"  ({', '.join(extras)})" if extras else ""
    return f"- {row.fee_name}{suffix}"


def build_prompt(rows: list[FeeRow] | list[str]) -> tuple[str, str]:
    """Returns (system, user) prompts for a given batch.

    Accepts either a list[FeeRow] (preferred — includes amount/frequency/conditions
    for better disambiguation) or a list[str] (legacy name-only, kept for tests).
    """
    valid_keys = sorted(CANONICAL_KEY_MAP.keys())
    keys_text = ", ".join(valid_keys)

    if rows and isinstance(rows[0], FeeRow):
        fee_list = "\n".join(_render_row(r) for r in rows)
        guidance = (
            "Each entry includes the fee name plus any available amount, "
            "frequency, and conditions text — use this context to disambiguate "
            "similar names (e.g. a $15 monthly fee with a balance-below condition "
            "is monthly_maintenance, not a generic transfer or service fee). "
            "Higher amounts that recur monthly almost always indicate "
            "monthly_maintenance or overdraft; one-off $5 amounts often indicate "
            "service fees like money_order or notary_fee."
        )
    else:
        fee_list = "\n".join(f"- {n}" for n in rows)
        guidance = ""

    user = (
        f"Classify each of the following bank fees using only keys from the "
        f"approved taxonomy.\n\n"
        f"Approved canonical keys:\n{keys_text}\n\n"
        + (f"{guidance}\n\n" if guidance else "")
        + f"Fees to classify:\n{fee_list}"
    )
    return _SYSTEM_PROMPT, user


# Per-1M-token pricing (USD) by model — keep in sync with vendor pricing.
# Source: https://www.anthropic.com/pricing#anthropic-api as of 2026-05.
_PRICING_USD_PER_MTOK: dict[str, tuple[float, float]] = {
    # model_id: (input_per_mtok, output_per_mtok)
    "claude-haiku-4-5-20251001":  (0.80,  4.00),
    "claude-sonnet-4-5-20250929": (3.00, 15.00),
    "claude-sonnet-4-6":          (3.00, 15.00),
    "claude-opus-4-7":            (15.00, 75.00),
}


def _cost_cents_from_usage(model: str, in_tokens: int, out_tokens: int) -> int:
    """Convert token counts to cents using model pricing. Unknown models fall
    back to a conservative Sonnet-class estimate so unaccounted spend is
    over-reported, not under-reported."""
    in_per, out_per = _PRICING_USD_PER_MTOK.get(model, (3.00, 15.00))
    dollars = (in_tokens / 1_000_000) * in_per + (out_tokens / 1_000_000) * out_per
    return int(round(dollars * 100))


async def _call_anthropic(
    rows: list[FeeRow] | list[str], config: DarwinConfig,
) -> tuple[list[dict], int]:
    """Single Anthropic call. Returns (classifications, cost_cents).

    Token usage from `resp.usage` is converted to cents using _PRICING table.
    The cost is propagated up to `classify_batch` which debits it against
    `agent_budgets`. This was the gap that allowed the 2026-04 runaway:
    cost_cents was always 0 in the gateway so spent_cents never moved.

    Accepts list[FeeRow] (preferred) or list[str] (legacy name-only).
    """
    system, user = build_prompt(rows)
    client = anthropic.AsyncAnthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
    resp = await client.messages.create(
        model=config.model,
        max_tokens=config.max_tokens,
        system=system,
        tools=[_TOOL],
        tool_choice={"type": "tool", "name": "classify_fees"},
        messages=[{"role": "user", "content": user}],
    )

    in_tokens = getattr(resp.usage, "input_tokens", 0) or 0
    out_tokens = getattr(resp.usage, "output_tokens", 0) or 0
    cost_cents = _cost_cents_from_usage(config.model, in_tokens, out_tokens)

    classifications: list[dict] = []
    for block in resp.content:
        if block.type == "tool_use" and block.name == "classify_fees":
            classifications = block.input.get("classifications", [])
            break
    return classifications, cost_cents


async def classify_names_with_retry(
    names: list[str],
    *,
    config: DarwinConfig,
    _caller: Optional[Callable[[list[str]], Awaitable[tuple[list[dict], int]]]] = None,
) -> tuple[list[dict], int]:
    """Wraps one LLM call with exp-backoff retry on rate limits.

    Returns (classifications, cost_cents). cost_cents reflects only the
    successful call; failed attempts before the success aren't billed
    (Anthropic doesn't charge for failed/retried requests).

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

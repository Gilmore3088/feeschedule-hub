"""Meta-tests for the Phase 62b testing harness (D-19).

Covers:
  1. FakeAnthropicClient duck-types anthropic.Anthropic().messages.create.
  2. Every call is recorded.
  3. ``tool_calls`` property flattens tool_use blocks across recorded messages.
  4. Exhausted script raises RuntimeError.
  5. CanaryCorpus pydantic validation (happy + missing fields).
  6. ``shadow_run_context`` sets shadow_run_id in the agent context dict.
  7. ``assert_tool_call_sequence`` happy + mismatch paths.
"""

from __future__ import annotations

import asyncio
import types

import pytest

from fee_crawler.agent_tools.context import get_agent_context
from fee_crawler.testing import (
    FakeAnthropicClient,
    FakeResponse,
    TextBlock,
    ToolUseBlock,
)
from fee_crawler.testing.canary_schema import CanaryCorpus, CanaryExpectation
from fee_crawler.testing.contract_test_base import assert_tool_call_sequence
from fee_crawler.testing.shadow_helpers import (
    make_shadow_run_id,
    shadow_run_context,
)


def _synthetic_recorded_call(messages: list) -> types.SimpleNamespace:
    """Build a RecordedCall-shaped object without going through messages.create."""
    return types.SimpleNamespace(
        model="x", system=None, tools=None, messages=messages
    )


@pytest.mark.asyncio
async def test_fake_client_records_and_returns_scripted():
    """Test 1 + 2: async messages.create returns scripted FakeResponse and records calls."""
    client = FakeAnthropicClient(
        scripted=[
            FakeResponse(
                stop_reason="tool_use",
                content=[
                    ToolUseBlock(name="list_recent_events", input={"hours": 24})
                ],
            ),
            FakeResponse(stop_reason="end_turn", content=[TextBlock(text="done")]),
        ]
    )
    r1 = await client.messages.create(
        model="claude", messages=[{"role": "user", "content": "review"}]
    )
    r2 = await client.messages.create(
        model="claude",
        messages=[
            {"role": "user", "content": "review"},
            {
                "role": "assistant",
                "content": [
                    {
                        "type": "tool_use",
                        "name": "list_recent_events",
                        "input": {"hours": 24},
                    }
                ],
            },
        ],
    )
    assert r1.stop_reason == "tool_use"
    assert r2.stop_reason == "end_turn"
    assert len(client.recorded_calls) == 2
    assert client.recorded_calls[0].model == "claude"


def test_tool_calls_property_flattens_tool_use_blocks():
    """Test 3: .tool_calls extracts only tool_use blocks, ignores text blocks."""
    client = FakeAnthropicClient(scripted=[FakeResponse()])
    client.recorded_calls.append(
        _synthetic_recorded_call(
            [
                {
                    "role": "assistant",
                    "content": [{"type": "tool_use", "name": "t1"}],
                },
                {
                    "role": "assistant",
                    "content": [{"type": "text", "text": "hi"}],
                },
            ]
        )
    )
    assert len(client.tool_calls) == 1
    assert client.tool_calls[0]["name"] == "t1"


def test_scripted_exhausted_raises_runtime_error():
    """Test 4: second create() with only one scripted response raises RuntimeError."""
    client = FakeAnthropicClient(scripted=[FakeResponse()])
    asyncio.run(client.messages.create(model="m", messages=[]))
    with pytest.raises(RuntimeError, match="ran out"):
        asyncio.run(client.messages.create(model="m", messages=[]))


def test_canary_corpus_accepts_valid():
    """Test 5a: CanaryCorpus pydantic model accepts well-formed JSON."""
    c = CanaryCorpus(
        version="v1",
        description="smoke",
        expectations=[
            CanaryExpectation(
                institution_id=1, expected_fees=[{"canonical_fee_key": "od"}]
            ),
        ],
    )
    assert c.version == "v1"
    assert len(c.expectations) == 1
    assert c.expectations[0].institution_id == 1


def test_canary_corpus_rejects_missing_version():
    """Test 5b: CanaryCorpus rejects JSON missing the required `version` field."""
    with pytest.raises(Exception):  # pydantic.ValidationError
        CanaryCorpus(description="no version")


def test_shadow_run_context_sets_context_dict():
    """Test 6: shadow_run_context() puts shadow_run_id + agent_name in the ctx."""
    captured: dict = {}
    with shadow_run_context(agent_name="knox") as rid:
        ctx = get_agent_context()
        captured["shadow_run_id"] = ctx.get("shadow_run_id")
        captured["agent_name"] = ctx.get("agent_name")
    assert captured["shadow_run_id"] == rid
    assert captured["agent_name"] == "knox"
    # After the block exits, ctx is reset.
    assert get_agent_context().get("shadow_run_id") is None


def test_shadow_run_context_accepts_provided_rid():
    """shadow_run_context with an explicit shadow_run_id yields that same value."""
    rid = make_shadow_run_id()
    with shadow_run_context(agent_name="knox", shadow_run_id=rid) as yielded:
        assert yielded == rid


def test_assert_tool_call_sequence_mismatch_raises():
    """Test 7a: mismatch raises AssertionError."""
    client = FakeAnthropicClient(scripted=[])
    client.recorded_calls.append(
        _synthetic_recorded_call(
            [{"role": "assistant", "content": [{"type": "tool_use", "name": "a"}]}]
        )
    )
    with pytest.raises(AssertionError, match="sequence mismatch"):
        assert_tool_call_sequence(client, ["b"])


def test_assert_tool_call_sequence_match_passes():
    """Test 7b: matching sequence does not raise."""
    client = FakeAnthropicClient(scripted=[])
    client.recorded_calls.append(
        _synthetic_recorded_call(
            [{"role": "assistant", "content": [{"type": "tool_use", "name": "a"}]}]
        )
    )
    assert_tool_call_sequence(client, ["a"])  # must not raise

"""Helpers for contract tests that use FakeAnthropicClient.

Typical usage (Phase 63 and beyond):

    @pytest.mark.asyncio
    async def test_knox_review_sequence(fake_anthropic, db_schema):
        fake_anthropic._scripted = [
            FakeResponse(stop_reason='tool_use', content=[
                ToolUseBlock(name='list_recent_events', input={'hours': 24}),
            ]),
            FakeResponse(stop_reason='end_turn', content=[TextBlock(text='ok')]),
        ]
        await KnoxAgent(client=fake_anthropic, pool=pool).review()
        assert_tool_call_sequence(fake_anthropic, ['list_recent_events'])
"""

from __future__ import annotations

from fee_crawler.testing.fake_anthropic import FakeAnthropicClient


def assert_tool_call_sequence(
    client: FakeAnthropicClient,
    expected_names: list[str],
) -> None:
    """Assert the exact ordered sequence of tool names the agent invoked.

    Raises AssertionError with a readable diff on mismatch.
    """
    actual = [c.get("name") for c in client.tool_calls]
    if actual != expected_names:
        raise AssertionError(
            "Tool call sequence mismatch.\n"
            f"  expected: {expected_names}\n"
            f"  actual:   {actual}"
        )


def recorded_system_prompts(client: FakeAnthropicClient) -> list[str]:
    """Return every non-empty system prompt the agent sent via this client.

    Useful for context-injection tests where the agent is expected to wrap
    a specific system prompt around its call.
    """
    return [c.system for c in client.recorded_calls if c.system]


__all__ = ["assert_tool_call_sequence", "recorded_system_prompts"]

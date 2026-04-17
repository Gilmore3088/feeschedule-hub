"""Deterministic fake for anthropic.Anthropic() in tests (D-19).

Usage:
    client = FakeAnthropicClient(scripted=[
        FakeResponse(stop_reason='tool_use', content=[
            ToolUseBlock(name='list_recent_events', input={"hours": 24}),
        ]),
        FakeResponse(stop_reason='end_turn', content=[
            TextBlock(text='Done.'),
        ]),
    ])
    agent.client = client  # injected
    await agent.run_turn(...)
    assert [c['name'] for c in client.tool_calls] == ['list_recent_events']

Duck-types anthropic.Anthropic (or AsyncAnthropic) on the one method the
fee_crawler call sites actually use: ``messages.create(...)``. Records every
call for assertion and drains scripted FakeResponse instances FIFO. When the
script is exhausted a loud RuntimeError is raised — tests should not
accidentally fall through to the real SDK.

Both async and sync call shapes are supported so existing sync sites (see
``fee_crawler/agents/*``) and new async agent code can share the same fake.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class ToolUseBlock:
    """anthropic-compatible tool_use content block."""

    type: str = "tool_use"
    name: str = ""
    input: dict = field(default_factory=dict)
    id: str = "toolu_fake"


@dataclass
class TextBlock:
    """anthropic-compatible text content block."""

    type: str = "text"
    text: str = ""


@dataclass
class FakeResponse:
    """Shape mirrors anthropic Messages.create() response (.stop_reason, .content, .usage)."""

    stop_reason: str = "end_turn"  # 'end_turn' | 'tool_use' | 'max_tokens'
    content: list = field(default_factory=list)
    usage: dict = field(
        default_factory=lambda: {"input_tokens": 0, "output_tokens": 0}
    )


@dataclass
class RecordedCall:
    """Snapshot of a single messages.create() invocation."""

    model: str
    messages: list
    tools: Optional[list] = None
    system: Optional[str] = None


class FakeAnthropicClient:
    """Duck-typed anthropic.Anthropic client — fully in-memory.

    Args:
        scripted: ordered list of FakeResponse returned FIFO from messages.create().
        mode: "async" (default) exposes awaitable messages.create; "sync" exposes
            a synchronous messages.create(). Both call shapes can also be reached
            via the ``create`` + ``create_sync`` methods.
    """

    def __init__(self, scripted: list[FakeResponse], mode: str = "async"):
        self._scripted: list[FakeResponse] = list(scripted)
        self.recorded_calls: list[RecordedCall] = []
        self._mode = mode

    class _Messages:
        """Implements both async ``create`` and sync ``create_sync`` paths."""

        def __init__(self, outer: "FakeAnthropicClient", is_async: bool = True):
            self._outer = outer
            self._is_async = is_async

        async def create(self, **kw: Any) -> FakeResponse:
            return self._do(**kw)

        def create_sync(self, **kw: Any) -> FakeResponse:
            return self._do(**kw)

        def _do(self, **kw: Any) -> FakeResponse:
            call = RecordedCall(
                model=kw.get("model", ""),
                messages=kw.get("messages", []),
                tools=kw.get("tools"),
                system=kw.get("system"),
            )
            self._outer.recorded_calls.append(call)
            if not self._outer._scripted:
                raise RuntimeError(
                    "FakeAnthropicClient ran out of scripted responses "
                    f"(call #{len(self._outer.recorded_calls)}). "
                    "Pre-load more FakeResponse entries or check your test path."
                )
            return self._outer._scripted.pop(0)

    @property
    def messages(self) -> "FakeAnthropicClient._Messages":
        return FakeAnthropicClient._Messages(self, is_async=(self._mode == "async"))

    @property
    def tool_calls(self) -> list[dict]:
        """Flatten every tool_use block recorded across all calls' message history.

        Returns tool_use block dicts (with ``type``, ``name``, ``input``) in the
        order they were sent. Useful for contract-test assertions on the
        sequence of tool invocations an agent produced.
        """
        result: list[dict] = []
        for call in self.recorded_calls:
            for msg in call.messages or []:
                content = msg.get("content") if isinstance(msg, dict) else None
                if isinstance(content, list):
                    for block in content:
                        if (
                            isinstance(block, dict)
                            and block.get("type") == "tool_use"
                        ):
                            result.append(block)
        return result


__all__ = [
    "FakeAnthropicClient",
    "FakeResponse",
    "RecordedCall",
    "TextBlock",
    "ToolUseBlock",
]

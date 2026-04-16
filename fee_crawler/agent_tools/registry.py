"""Tool registry: decorator + module-level dict.

Plans 62A-09..12 register CRUD tools via:

    @agent_tool(name='approve_fee_raw', entity='fees_raw', action='update')
    async def approve_fee_raw(input: ApproveFeeRawInput, ...) -> ApproveFeeRawOutput:
        ...

Plan 62A-13 (MCP) reads TOOL_REGISTRY to expose read-only tools externally.
Plan 62A-13 acceptance test asserts every one of the 33 entities has >=1 registered tool.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Dict, Literal, Optional

CrudAction = Literal["create", "read", "update", "delete", "upsert", "list"]


@dataclass
class ToolMeta:
    name: str
    entity: str
    action: CrudAction
    func: Callable[..., Any]
    input_schema: Optional[type] = None
    output_schema: Optional[type] = None
    description: str = ""


TOOL_REGISTRY: Dict[str, ToolMeta] = {}


def agent_tool(
    name: str,
    entity: str,
    action: CrudAction,
    input_schema: Optional[type] = None,
    output_schema: Optional[type] = None,
    description: str = "",
) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    """Decorator: registers an async function as an agent-callable CRUD tool."""

    def _decorator(func: Callable[..., Any]) -> Callable[..., Any]:
        if name in TOOL_REGISTRY:
            raise RuntimeError(f"agent_tool name collision: {name}")
        TOOL_REGISTRY[name] = ToolMeta(
            name=name, entity=entity, action=action, func=func,
            input_schema=input_schema, output_schema=output_schema,
            description=description or (func.__doc__ or "").strip().split("\n")[0],
        )
        return func

    return _decorator


def entities_covered() -> set[str]:
    """Unique set of entities with >=1 registered tool (used by test_agent_tool_coverage)."""
    return {meta.entity for meta in TOOL_REGISTRY.values()}


def reset_registry_for_testing() -> None:
    """Clear TOOL_REGISTRY — test-only helper."""
    TOOL_REGISTRY.clear()

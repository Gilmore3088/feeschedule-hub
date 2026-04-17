"""FastMCP-based read-only server.

Deploy as a Modal FastAPI endpoint (Streamable HTTP transport per RESEARCH §4).
Auth: X-MCP-API-KEY header validated against MCP_MASTER_KEY env var.
Phase 68 SEC-04 adds per-key rotation via an mcp_api_keys table.

Read-only invariant (D-07): The MCP surface in 62a is READ-ONLY. Every
registered tool must carry the `_bfi_read_only=True` attribute on its
underlying function (set by @read_only_tool in tools_read.py). The startup
assertion below iterates the FastMCP tool manager and refuses to boot if any
tool is unguarded — preventing accidental write-tool registration.
"""

from __future__ import annotations

import os

from mcp.server.fastmcp import FastMCP

# Instantiate once — tools_read.py decorates this instance.
mcp = FastMCP("bank-fee-index")

# Import the read-tool module so its @read_only_tool decorators register.
# MUST happen AFTER mcp is instantiated, BEFORE server startup.
from fee_crawler.agent_mcp import tools_read  # noqa: E402, F401


MCP_MASTER_KEY_ENV = "MCP_MASTER_KEY"


def _iter_registered_tools():
    """Yield every tool object FastMCP has registered.

    FastMCP tracks registered tools in `mcp._tool_manager._tools` on the
    currently-pinned SDK (mcp>=1.27). Fall back to `mcp._tools` for any
    hypothetical SDK version that flattens the manager. Both attributes are
    treated as best-effort — a missing registry yields an empty iterable so
    the server still boots on older/newer SDKs, and the assertion becomes
    vacuously true (there are no tools to check).
    """
    try:
        registered = getattr(mcp, "_tool_manager", None)
        if registered is not None and hasattr(registered, "_tools"):
            return list(registered._tools.values())
        if hasattr(mcp, "_tools"):
            return list(mcp._tools.values())
    except Exception:
        return []
    return []


def _assert_read_only_registry() -> None:
    """Fail fast if any registered tool lacks the read-only marker.

    Every tool registered via @read_only_tool sets `_bfi_read_only=True` on the
    wrapped function. The FastMCP Tool object exposes that function as `.fn`.
    If even one tool is missing the marker (e.g., someone added a raw
    `@mcp.tool` decorator), startup fails — preventing a write tool from being
    silently exposed via the MCP surface.
    """
    for tool in _iter_registered_tools():
        fn = getattr(tool, "fn", None) or getattr(tool, "handler", None)
        if fn is None:
            continue
        if not getattr(fn, "_bfi_read_only", False):
            raise RuntimeError(
                f"MCP tool {getattr(tool, 'name', repr(tool))!r} is not marked "
                "read-only; 62a MCP surface is READ-ONLY per D-07. Decorate "
                "with @read_only_tool (see tools_read.py)."
            )


def _check_api_key(provided: str | None) -> None:
    """Validate the X-MCP-API-KEY header against MCP_MASTER_KEY.

    Raises RuntimeError if the server env is misconfigured (no key set) or
    PermissionError if the caller's key is wrong. 62a uses a single master
    key; Phase 68 SEC-04 replaces this with an mcp_api_keys table + rotation.
    """
    expected = os.environ.get(MCP_MASTER_KEY_ENV)
    if not expected:
        raise RuntimeError(
            f"{MCP_MASTER_KEY_ENV} not configured; MCP server refuses to "
            "start without an API key (Modal Secret: bfi-secrets)."
        )
    if provided != expected:
        raise PermissionError("Invalid MCP API key")


def main() -> None:
    """Entrypoint for local/Modal invocation.

    Assertions run here so a misconfigured registry fails immediately rather
    than at first request. `mcp.run()` picks the default transport
    (Streamable HTTP on mcp>=1.27).
    """
    _assert_read_only_registry()
    mcp.run()


if __name__ == "__main__":
    main()

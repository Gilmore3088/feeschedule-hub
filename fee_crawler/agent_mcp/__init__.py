"""Read-only MCP server for Bank Fee Index data access.

Exposes Tier 3 + institution_dossiers + Call Report reads as MCP tools.
Foreshadows 999.15 public API (bankregdata.com-style consumers). Write tools
are NEVER exposed via MCP in 62a; they stay behind the service-role gateway
(D-07). A startup-time assertion in server.py refuses to boot if any tool in
the registry is not explicitly marked read-only.
"""

from fee_crawler.agent_mcp.server import main, mcp

__all__ = ["mcp", "main"]

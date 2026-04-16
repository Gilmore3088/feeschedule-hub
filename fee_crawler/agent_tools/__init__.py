"""Phase 62a agent_tools package.

Exposes the public surface:
  - get_pool / close_pool: asyncpg connection pool singleton
  - with_agent_tool: transactional gateway context manager
  - agent_tool: decorator for registering CRUD tools
  - TOOL_REGISTRY: module-level dict of registered tools
  - with_agent_context: sets per-call correlation_id + cost_cents
  - BudgetExceeded, AgentUnknown: gateway exceptions

Downstream plans (62A-09..12) register tools via @agent_tool(...); the read-only MCP
server (Plan 62A-13) imports the registry to expose read tools.
"""

from fee_crawler.agent_tools.pool import get_pool, close_pool
from fee_crawler.agent_tools.registry import agent_tool, TOOL_REGISTRY, ToolMeta
from fee_crawler.agent_tools.context import with_agent_context, get_agent_context
from fee_crawler.agent_tools.gateway import with_agent_tool, AgentUnknown
from fee_crawler.agent_tools.budget import BudgetExceeded

__all__ = [
    "get_pool", "close_pool",
    "agent_tool", "TOOL_REGISTRY", "ToolMeta",
    "with_agent_context", "get_agent_context",
    "with_agent_tool", "BudgetExceeded", "AgentUnknown",
]

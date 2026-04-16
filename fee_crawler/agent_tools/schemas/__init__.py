"""Public re-export surface for the agent-tool schemas package.

Plan 62A-05 ships the shared base classes (from ._base) PLUS conditional
wildcard imports for every per-domain module that Plans 62A-07/08/09/10
add. The imports use try/except ImportError so Plan 05 can pre-wire them
in Wave 1 without requiring the per-domain modules to exist yet — each
wave 2 plan only adds its own module file (no __init__.py edit required),
so parallel execution has zero shared-file writes.

After all Wave 2 plans land, every schema is importable via:

    from fee_crawler.agent_tools.schemas import <ClassName>

The TS codegen pipeline (scripts/gen-agent-tool-types.sh) points at this
package path (`fee_crawler.agent_tools.schemas`) so pydantic2ts walks
every re-exported class automatically — no updates to the codegen script
are needed when a new per-domain module appears.
"""

from ._base import (
    AgentEventRef,
    AgentName,
    BaseToolInput,
    BaseToolOutput,
)

# Per-domain re-exports. Each try/except block activates as soon as the
# corresponding plan lands its module; until then ImportError is swallowed.
# Plan 62A-07 adds schemas/fees.py.
# Plan 62A-08 adds schemas/crawl.py.
# Plan 62A-09 adds schemas/hamilton.py.
# Plan 62A-10 adds schemas/peer_research.py + schemas/agent_infra.py.

try:
    from fee_crawler.agent_tools.schemas.fees import *            # noqa: F401,F403
except ImportError:
    pass

try:
    from fee_crawler.agent_tools.schemas.crawl import *           # noqa: F401,F403
except ImportError:
    pass

try:
    from fee_crawler.agent_tools.schemas.hamilton import *        # noqa: F401,F403
except ImportError:
    pass

try:
    from fee_crawler.agent_tools.schemas.peer_research import *   # noqa: F401,F403
except ImportError:
    pass

try:
    from fee_crawler.agent_tools.schemas.agent_infra import *     # noqa: F401,F403
except ImportError:
    pass

__all__ = ["AgentEventRef", "AgentName", "BaseToolInput", "BaseToolOutput"]

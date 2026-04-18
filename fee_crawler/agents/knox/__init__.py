"""Knox — adversarial reviewer agent.

Knox reviews each fees_verified row (Darwin's output) and decides:
- intent=accept: amount looks reasonable
- intent=reject: amount seems wrong (outlier or invalid)

Both Darwin-accept AND Knox-accept messages must exist (via agent_messages
handshake in promote_to_tier3) before a fee_verified row can be published.
"""

from fee_crawler.agents.knox.orchestrator import review_batch, ReviewResult

__all__ = ["review_batch", "ReviewResult"]

"""Phase 62b inter-agent messaging runtime (COMMS-01..04).

Provides:
  - send_message: gateway-audited publisher that wraps insert_agent_message.
  - run_listener: long-lived LISTEN/NOTIFY loop on per-recipient channel.
  - scan_for_escalations: flips open handshakes to escalated when gate trips.
  - Pydantic schemas for per-intent payload validation (D-09).

Downstream:
  - Phase 63 Knox / Phase 64 Darwin call send_message for cross-agent handshakes.
  - Phase 65 Atlas schedules scan_for_escalations via pg_cron and surfaces
    escalated rows in the daily digest.
"""

from fee_crawler.agent_messaging.publisher import send_message
from fee_crawler.agent_messaging.listener import run_listener
from fee_crawler.agent_messaging.escalation import (
    scan_for_escalations,
    list_escalated_threads,
)
from fee_crawler.agent_messaging.schemas import (
    AcceptPayload,
    ChallengePayload,
    EscalatePayload,
    ProvePayload,
    RejectPayload,
    validate_payload_for_intent,
)

__all__ = [
    "send_message",
    "run_listener",
    "scan_for_escalations",
    "list_escalated_threads",
    "ChallengePayload",
    "ProvePayload",
    "AcceptPayload",
    "RejectPayload",
    "EscalatePayload",
    "validate_payload_for_intent",
]

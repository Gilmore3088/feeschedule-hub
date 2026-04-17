"""Publisher: wraps insert_agent_message tool so every message-send is
gateway-audited AND fires the AFTER INSERT NOTIFY trigger.

Phase 62b COMMS-01. Every message produced by a Python agent flows through
this function; the gateway (fee_crawler/agent_tools/gateway.py) writes the
agent_events + agent_auth_log rows, and the AFTER INSERT trigger on
agent_messages (migration 20260508) sends pg_notify('agent_msg_<recipient>',
message_id::text) on the per-recipient channel.

Threat: sender spoofing (T-62B-05-01). sender_agent in the DB row comes from
the gateway's agent_name header via insert_agent_message, NOT from this
wrapper's sender kwarg. The sender kwarg is a developer hint; gateway
reality wins. Phase 68 SEC-04 hardens to JWT-bound agent_name.
"""

from __future__ import annotations

import uuid
from typing import Optional

from fee_crawler.agent_messaging.schemas import validate_payload_for_intent
from fee_crawler.agent_tools import with_agent_context
from fee_crawler.agent_tools.schemas import InsertAgentMessageInput
from fee_crawler.agent_tools.tools_agent_infra import insert_agent_message


async def send_message(
    *,
    sender: str,
    recipient: str,
    intent: str,
    payload: Optional[dict] = None,
    correlation_id: Optional[str] = None,
    parent_message_id: Optional[str] = None,
    parent_event_id: Optional[str] = None,
    round_number: int = 1,
    expires_at: Optional[str] = None,
    reasoning_prompt: str = "send_message",
    reasoning_output: str = "",
) -> str:
    """Publish an inter-agent message. Returns the new message_id UUID as string.

    Validates payload shape against intent schema BEFORE any DB write.
    """
    # Fail fast on bad payload shape (ValidationError) so the gateway never
    # accepts a structurally invalid message.
    validate_payload_for_intent(intent, payload or {})

    corr = correlation_id or str(uuid.uuid4())

    # The insert_agent_message tool reads agent_name from its kwarg (gateway
    # identity) and writes it as sender_agent on the agent_messages row. The
    # `sender` arg to send_message maps 1:1 onto agent_name so that tests and
    # agent code share one identity hand-off.
    # with_agent_context propagates correlation_id to the gateway so the
    # agent_events row lands on the same correlation as the INSERT.
    with with_agent_context(agent_name=sender, correlation_id=corr):
        result = await insert_agent_message(
            inp=InsertAgentMessageInput(
                recipient_agent=recipient,
                intent=intent,
                correlation_id=corr,
                parent_message_id=parent_message_id,
                parent_event_id=parent_event_id,
                payload=payload or {},
                round_number=round_number,
                expires_at=expires_at,
            ),
            agent_name=sender,
            reasoning_prompt=reasoning_prompt,
            reasoning_output=reasoning_output,
            parent_event_id=parent_event_id,
        )

    if not result.success or not result.message_id:
        raise RuntimeError(
            f"send_message failed: success={result.success} error={result.error!r}"
        )
    return result.message_id

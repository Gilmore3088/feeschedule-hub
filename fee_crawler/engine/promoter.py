"""FeesVerifiedPromoter — the real verify-stage sink.

Promotes a clean, classified raw fee from fees_raw into fees_verified (Tier 2),
or flags it in place via outlier_flags. Implements the Promoter protocol so the
VerifyHandler logic (tested with a fake) runs unchanged in production.

Idempotent: promotion is keyed on fee_raw_id (a raw fee is promoted at most
once); flagging merges the new flags into the existing outlier_flags set.
"""

from __future__ import annotations

import uuid
from typing import Any

import asyncpg

# Deterministic namespace so re-verifying the same raw fee yields the same
# verification event id.
_VERIFY_NS = uuid.UUID("5f3d1b64-0000-4000-8000-000000000002")


class FeesVerifiedPromoter:
    async def promote(self, conn: asyncpg.Connection, raw_fee: dict[str, Any], canonical_key: str) -> None:
        verify_event = uuid.uuid5(_VERIFY_NS, str(raw_fee["fee_raw_id"]))
        await conn.execute(
            """
            INSERT INTO fees_verified (
                fee_raw_id, institution_id, source_url, document_r2_key,
                extraction_confidence, canonical_fee_key, verified_by_agent_event_id,
                fee_name, amount, frequency, review_status
            )
            SELECT r.fee_raw_id, r.institution_id, r.source_url, r.document_r2_key,
                   r.extraction_confidence, $2, $3,
                   r.fee_name, r.amount, r.frequency, 'verified'
              FROM fees_raw r
             WHERE r.fee_raw_id = $1
               AND NOT EXISTS (
                   SELECT 1 FROM fees_verified v WHERE v.fee_raw_id = r.fee_raw_id
               )
            """,
            raw_fee["fee_raw_id"],
            canonical_key,
            verify_event,
        )

    async def flag(self, conn: asyncpg.Connection, raw_fee: dict[str, Any], flags: list[str]) -> None:
        # Merge new flags into the existing outlier_flags array (dedup).
        await conn.execute(
            """
            UPDATE fees_raw
               SET outlier_flags = (
                   SELECT COALESCE(jsonb_agg(DISTINCT f), '[]'::jsonb)
                     FROM (
                         SELECT jsonb_array_elements_text(outlier_flags) AS f
                         UNION
                         SELECT unnest($2::text[])
                     ) s
               )
             WHERE fee_raw_id = $1
            """,
            raw_fee["fee_raw_id"],
            flags,
        )

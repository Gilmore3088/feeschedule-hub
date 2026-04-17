"""Phase 62b testing harness — BOOT-03 (D-18..D-21).

Layers:
  - Contract tests: FakeAnthropicClient (D-19) + contract_test_base helpers
  - Fixture replay: reuses FakeAnthropicClient with saved scripted paths (Phase 63)
  - Canary: canary_schema + canary_runner (D-20)
  - Shadow mode: shadow_helpers + gateway branch (D-21)
"""
from fee_crawler.testing.fake_anthropic import (
    FakeAnthropicClient,
    FakeResponse,
    RecordedCall,
    TextBlock,
    ToolUseBlock,
)
from fee_crawler.testing.canary_schema import (
    CanaryCorpus,
    CanaryExpectation,
    CanaryVerdict,
)
from fee_crawler.testing.shadow_helpers import (
    make_shadow_run_id,
    shadow_run_context,
    shadow_diff_report,
)

__all__ = [
    "FakeAnthropicClient",
    "FakeResponse",
    "RecordedCall",
    "TextBlock",
    "ToolUseBlock",
    "CanaryCorpus",
    "CanaryExpectation",
    "CanaryVerdict",
    "make_shadow_run_id",
    "shadow_run_context",
    "shadow_diff_report",
]

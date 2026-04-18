"""Darwin — classification/verification agent (Phase 64 slice #1).

Slice #1 scope: classify fees_raw rows via LLM and promote ≥0.90 confidence
rows to fees_verified. Low-confidence results cached for human review.

Full v10.0 contract (outlier detection, source re-verify, 5-step loop
REVIEW/DISSECT/UNDERSTAND/IMPROVE) lands in later slices.
"""
# NOTE: orchestrator import deferred to task A-5; circuit/config/cost-estimator
# are independent pure modules suitable for isolated unit testing.
try:
    from fee_crawler.agents.darwin.orchestrator import classify_batch, BatchResult
    __all__ = ["classify_batch", "BatchResult"]
except ImportError:
    # Orchestrator not yet implemented (task A-5)
    __all__ = []

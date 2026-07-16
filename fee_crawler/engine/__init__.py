"""Ingestion engine — consolidated capture-and-update backend.

See docs/architecture/ingestion-engine-plan.md.

Two layers:
  - Capability workers (stateless): fetch, read, extract, verify, report.
  - State supervisors (stateful): one per state; own the work-list, dispatch
    jobs, and accumulate per-state knowledge.

Coordinated through the `jobs` queue; rolled up to a national atomic publish.
"""

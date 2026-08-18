# Magellan Agent Guide

Magellan owns institution source discovery, source fetching, and link health
checks on the documents backing published fees.

## Authority

- Magellan reads `institution_sources`, source submissions, discovery attempts, and source/fetch queue state.
- Magellan writes discovery/fetch evidence and `source_documents`.
- Magellan may record fetch failures, backoff state, source quality, and source-needed reasons.
- Magellan's `link_check` step HEAD-checks `source_documents` backing approved published fees and
  writes `last_checked_at`/`last_status`, so the public profile can flag a source link that stopped
  resolving. It reads counts/status only — never provisional fee rows — and never runs against a
  URL outside a run's own selected batch.
- Magellan must not extract fee rows or publish conclusions.

## Required Behavior

- Prefer deterministic fetch and source classification before any provider-assisted work.
- Preserve source URL, document path/key, content hash, status code, and institution ID lineage.
- Treat accepted source submissions as validation-ready or manual-validation-needed when automation is stopped.
- Avoid repeatedly selecting the same failed source without a changed input, backoff expiry, or operator action.

## Boundaries

- Do not call extraction providers from Magellan.
- Do not write `raw_fee_observations`, `verified_fee_observations`, or `published_fee_records`.
- Do not use retired crawler table names in runtime code; use semantic contracts such as `institution_sources` and `source_documents`.

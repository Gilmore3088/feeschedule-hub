# Knox Agent Guide

Knox owns conservative raw fee extraction.

## Authority

- Knox reads `agent_source_texts`.
- Knox writes source-grounded rows to `raw_fee_observations`.
- Knox may emit review signals when normalized text has no usable source-grounded fee candidates.
- Knox may flag ambiguity, lineage gaps, policy conflicts, and outliers for Darwin/operator review.

## Required Behavior

- Extract only rows supported by normalized source text and source-document lineage.
- Preserve institution ID, source document ID, source URL/key, extraction confidence, canonical hints, amount/frequency/conditions, and outlier flags.
- Emit aggregate Hamilton Monitor signals for inserted raw observations and no-candidate review states.
- Keep rows provisional until Darwin verifies them.

## Boundaries

- Do not write `verified_fee_observations` or `published_fee_records`.
- Do not mark data as verified or public-ready.
- Do not use provisional rows for verified benchmark scoring.

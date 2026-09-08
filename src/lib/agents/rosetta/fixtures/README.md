# SCCU consumer schedule regression

`sccu-consumer-2025-03-12.pdf` is an unchanged copy of the official Space Coast Credit Union consumer fee schedule, retrieved September 8, 2026 from:

https://www.sccu.com/getmedia/5c409f02-961e-4902-95a0-acd33bd4eca0/Fee-Schedule.pdf

Discovery page: https://www.sccu.com/fees-forms-disclosures

Printed document update: March 12, 2025. No effective date is stated.

SHA-256: `933fe958b2a7ad57749e10b14d1991c4eb0fc40ca31811d5c0478beb514b166f`

The one-page, two-column PDF exercises actual Rosetta parsing and a Knox dry run. The regression distinguishes $1,500/$2,500 balance conditions from $15 monthly charges, preserves domestic/international wire direction, and avoids inventing a generic NSF charge from a restricted returned-check label. This fixture is test evidence, not a production ingestion or publication receipt.

Production follow-through must use the existing institution-scoped run envelope for institution 8109, after review and deployment. Resolve the actual PDF through source intake/Magellan, then run Rosetta, Knox, Darwin, and Hamilton through their existing steps. Confirm source lineage and review unmapped variants and explicit free services before publication. Do not insert fixture observations directly into production tables.

# Milestone 2: Compounding Pipeline Intelligence

**Captured:** 2026-04-06 during Milestone 1 planning

## Vision

The pipeline should get smarter with each crawl cycle. Three pillars:

### 1. Re-crawl Rotation
- Institutions revisited on 3-6 month cadence (configurable)
- Store source document, URL, extraction method for each crawl
- Compare fees across time to detect real changes vs extraction drift
- Example: Space Coast CU crawled Apr 2025, re-crawled Jul 2025, Oct 2025

### 2. Discovery Resilience (Compounding URL Intelligence)
- When URL discovery fails, record what was tried and why it failed
- Next attempt starts with institutional memory (e.g., "last known URL was /documents/fees.pdf")
- Failed patterns feed into smarter heuristics over time
- Track URL stability per institution (some change quarterly, some never)

### 3. Extraction Accuracy (Self-Correcting)
- Compare new extraction against previous for same institution
- Flag anomalies: if overdraft fee goes from $35 to $350, likely extraction error
- Analyst corrections feed back into confidence model
- Learn from corrections: what document formats cause errors, which institutions have unusual layouts

## Dependencies on Milestone 1
- E2E test suite validates the base pipeline works
- Audit trail from M1 provides the data substrate for compounding
- Stage timing from M1 establishes performance baselines

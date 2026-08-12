---
module: State Agent
date: 2026-04-06
problem_type: data_integrity
component: state_agent
symptoms:
  - "Fees saved to wrong institution ID during manual extraction"
  - "Institution shows 0 fees despite successful extraction"
  - "Another institution gains unexpected fees"
root_cause: hardcoded_id
severity: critical
tags: [data-integrity, institution-id, manual-extraction, kansas]
---

# Wrong Institution ID During Manual Fee Extraction

## Symptom
When manually extracting fees for CommunityAmerica Federal Credit Union (KS), fees were saved to institution ID 5238 instead of the correct ID 8241. The institution page showed 0 fees despite a successful 43-fee extraction.

## Root Cause
During manual extraction via Python script, the institution ID was hardcoded as `5238` based on an assumption, rather than looked up from the database by name + state. The actual ID was `8241`.

Multiple institutions can have similar names across states. The ID must always be verified against the database.

## Investigation
1. Extracted 43 fees — extraction succeeded
2. Checked institution page — showed 0 fees
3. Queried DB: `SELECT id FROM crawl_targets WHERE institution_name ILIKE '%communityamerica%' AND state_code = 'KS'` — returned ID 8241
4. Found fees were saved to ID 5238 (wrong institution)

## Solution
1. Deleted fees from wrong ID: `DELETE FROM extracted_fees WHERE crawl_target_id = 5238 AND extracted_by = 'agent_v1'`
2. Re-extracted to correct ID 8241
3. Always look up ID from DB before manual extraction

## Prevention

**NEVER hardcode institution IDs in manual extraction scripts.** Always query by name + state:

```python
# WRONG
inst_id = 5238  # guessed

# RIGHT
cur.execute('SELECT id FROM crawl_targets WHERE institution_name ILIKE %s AND state_code = %s', ('%communityamerica%', 'KS'))
inst_id = cur.fetchone()['id']
```

When running manual extractions, always use the pattern:
```python
cur.execute('SELECT id, institution_name FROM crawl_targets WHERE institution_name ILIKE %s AND state_code = %s', (f'%{name}%', state))
row = cur.fetchone()
print(f'Matched: {row["institution_name"]} (ID: {row["id"]})')  # Verify before proceeding
```

## Related Issues
- Same issue occurred with Central National Bank but was caught and verified correct (ID 856)
- The state agent (`state_agent.py`) does this correctly — it reads IDs from the DB query. Only manual scripts had this bug.

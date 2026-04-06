# Phase 5: Categorization Stage Tests - Context

**Gathered:** 2026-04-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Test that the categorization stage assigns valid fee_family and fee_category from the 49-category taxonomy to extracted fees, and normalizes fee names via alias matching. This phase can use pre-populated extracted_fees rows (no need for real LLM calls).

</domain>

<decisions>
## Implementation Decisions

### Test Strategy
- **D-01:** Unlike Phases 3-4, categorization does NOT require live APIs or LLM calls. Pre-populate `extracted_fees` rows with known fee names (including aliases) and run the categorize command against them.
- **D-02:** Mark tests `@pytest.mark.e2e` only (no `@pytest.mark.llm` or `@pytest.mark.slow` needed — categorization is pure in-memory taxonomy matching).

### Taxonomy Validation
- **D-03:** Assert every categorized fee has `fee_family` and `fee_category` matching values from the Python taxonomy (`fee_crawler/fee_analysis.py`). Cross-reference against the 9 families and 49 categories.
- **D-04:** Insert test fees with known alias names (e.g., "NSF Charge" → should map to "nsf" category, "Monthly Service Fee" → "monthly_maintenance"). Assert the canonical category is assigned.

### Fixture Design
- **D-05:** Create a `categorized_db` fixture that pre-populates `crawl_targets` + `extracted_fees` with synthetic data, then runs the categorize command. No seeding or discovery needed.
- **D-06:** Use function-scoped fixtures since categorization is fast (< 1 second).

### Claude's Discretion
- Test file organization
- Which specific fee names/aliases to test
- How many synthetic rows to insert

</decisions>

<canonical_refs>
## Canonical References

### Categorization Implementation
- `fee_crawler/fee_analysis.py` — `categorize_fee()`, alias matching, 9 families / 49 categories
- `fee_crawler/commands/categorize.py` — CLI command that runs categorization

### Taxonomy
- `fee_crawler/fee_analysis.py` — `TAXONOMY`, `ALIASES`, `_get_sorted_aliases()`

### Test Infrastructure
- `fee_crawler/tests/e2e/conftest.py` — `test_db`, `test_config` fixtures

</canonical_refs>

<code_context>
## Existing Code Insights

### Key Difference from Prior Phases
- No network calls needed — categorization is pure Python
- Can use synthetic data instead of real institution data
- Fast execution — function-scoped fixtures are fine

### Integration Points
- Categorization reads `extracted_fees.fee_name`
- Categorization writes `extracted_fees.fee_family` and `extracted_fees.fee_category`

</code_context>

<specifics>
## Specific Ideas

No specific requirements — straightforward taxonomy matching test.

</specifics>

<deferred>
## Deferred Ideas

None

</deferred>

---

*Phase: 05-categorization-stage-tests*
*Context gathered: 2026-04-06*

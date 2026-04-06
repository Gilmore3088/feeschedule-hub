# Phase 6: Validation Stage Tests - Context

**Gathered:** 2026-04-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Test that the validation stage transitions `review_status` based on confidence thresholds and flags statistical outliers in `validation_flags`. Uses synthetic pre-populated `extracted_fees` rows with known confidence values.

</domain>

<decisions>
## Implementation Decisions

### Test Strategy
- **D-01:** Use synthetic data with known confidence values spanning all three threshold ranges: >=0.85 (staged), [0.7, 0.85) (pending), <0.7 (extracted). No API/LLM calls needed.
- **D-02:** Mark tests `@pytest.mark.e2e` only — validation is pure Python computation.
- **D-03:** For outlier detection (VALD-02), insert multiple fees in the same category with one extreme outlier (3+ std dev). Assert `validation_flags` is populated for the outlier.

### Confidence Thresholds
- **D-04:** Test exact boundary values: 0.85 (staged), 0.849 (pending), 0.70 (pending), 0.699 (extracted). Edge cases matter.
- **D-05:** Assert `validation_flags` parses as valid JSON for all rows where it's non-null.

### Fixture Design
- **D-06:** Function-scoped `validated_db` fixture: insert synthetic `extracted_fees` with predetermined confidence scores, run the validate + auto-review commands, then assert outcomes.
- **D-07:** Insert fees across multiple categories to test outlier detection properly (need enough peers for std dev calculation).

### Claude's Discretion
- Specific fee amounts and categories for synthetic data
- Number of synthetic rows needed for meaningful std dev
- Test file organization

</decisions>

<canonical_refs>
## Canonical References

### Validation Implementation
- `fee_crawler/fee_analysis.py` — `evaluate_accuracy()`, outlier detection, confidence thresholds
- `fee_crawler/commands/validate.py` — validate CLI command
- `fee_crawler/commands/auto_review.py` — auto-review CLI command (transitions review_status)
- `fee_crawler/config.py` — `ExtractionConfig.confidence_auto_stage_threshold` (0.85), `outlier_std_dev_threshold` (3.0)

### Test Infrastructure
- `fee_crawler/tests/e2e/conftest.py` — `test_db`, `test_config` fixtures
- `fee_crawler/tests/e2e/test_categorization_stage.py` — synthetic data fixture pattern

</canonical_refs>

<code_context>
## Existing Code Insights

### Key Difference
- Same synthetic data pattern as Phase 5 — no network calls
- Need to understand the exact validation pipeline: validate → auto-review
- Confidence thresholds defined in Config (0.85 auto-stage, 3.0 std dev outlier)

### Integration Points
- Validation reads `extracted_fees.extraction_confidence`
- Validation writes `extracted_fees.review_status` and `extracted_fees.validation_flags`

</code_context>

<specifics>
## Specific Ideas

No specific requirements beyond standard approach.

</specifics>

<deferred>
## Deferred Ideas

None

</deferred>

---

*Phase: 06-validation-stage-tests*
*Context gathered: 2026-04-06*

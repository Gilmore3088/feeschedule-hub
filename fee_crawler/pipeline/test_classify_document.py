"""Tests for document classifier."""

from fee_crawler.pipeline.classify_document import classify_document, is_likely_fee_schedule_quick


def test_definitive_title():
    result = classify_document("Schedule of Fees\nFirst National Bank\nEffective January 1, 2026\nMonthly Maintenance Fee: $10.00\nOverdraft Fee: $35.00")
    assert result["is_fee_schedule"] is True
    assert result["confidence"] >= 0.9
    assert result["doc_type_guess"] == "fee_schedule"


def test_fee_schedule_with_amounts():
    text = """
    Consumer Fee Schedule
    Overdraft Fee: $35.00 per item
    NSF Fee: $30.00 per occurrence
    Wire Transfer Fee: $25.00
    ATM Non-Network Fee: $3.00
    Monthly Maintenance Fee: $12.00
    Stop Payment Fee: $30.00
    Cashier's Check: $10.00
    Money Order: $5.00
    """
    result = classify_document(text)
    assert result["is_fee_schedule"] is True
    assert result["confidence"] >= 0.5


def test_loan_agreement():
    text = """
    LOAN AGREEMENT
    Annual Percentage Rate: 5.99%
    Truth in Lending Disclosure
    Credit Agreement Terms and Conditions
    The borrower agrees to repay the principal amount of $50,000.
    """
    result = classify_document(text)
    assert result["is_fee_schedule"] is False
    assert result["doc_type_guess"] in ("rate_sheet", "account_agreement")


def test_truth_in_savings():
    text = """
    Truth in Savings Disclosure
    Annual Percentage Yield: 0.05% APY
    Minimum balance to open: $500
    Interest compounded daily, credited monthly.
    """
    result = classify_document(text)
    assert result["is_fee_schedule"] is False
    assert result["doc_type_guess"] == "tis_disclosure"


def test_privacy_notice():
    text = """
    Privacy Notice
    Privacy Policy for Online Banking
    We collect personal information to provide financial services.
    Governing law applies in accordance with federal regulations.
    """
    result = classify_document(text)
    assert result["is_fee_schedule"] is False


def test_empty_text():
    result = classify_document("")
    assert result["is_fee_schedule"] is False
    assert result["confidence"] == 0.0


def test_short_text():
    result = classify_document("Hello world")
    assert result["is_fee_schedule"] is False


def test_quick_prescreen_passes_fee_doc():
    text = "First National Bank Fee Schedule\nOverdraft fee: $35.00 per item\nNSF fee: $30.00 per occurrence\nMonthly maintenance: $12.00"
    assert is_likely_fee_schedule_quick(text) is True


def test_quick_prescreen_rejects_empty():
    assert is_likely_fee_schedule_quick("") is False


def test_quick_prescreen_rejects_no_fees():
    assert is_likely_fee_schedule_quick("This is a general web page about banking services and customer support.") is False


def test_definitive_title_in_prescreen():
    text = "Schedule of Fees - First National Bank\nEffective January 1, 2026\nThe following fees apply to consumer deposit accounts."
    assert is_likely_fee_schedule_quick(text) is True


if __name__ == "__main__":
    import sys
    test_funcs = [v for k, v in globals().items() if k.startswith("test_")]
    passed = 0
    for fn in test_funcs:
        try:
            fn()
            passed += 1
            print(f"  PASS {fn.__name__}")
        except AssertionError as e:
            print(f"  FAIL {fn.__name__}: {e}")
    print(f"\n{passed}/{len(test_funcs)} tests passed")
    sys.exit(0 if passed == len(test_funcs) else 1)

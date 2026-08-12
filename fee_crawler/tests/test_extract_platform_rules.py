from fee_crawler.pipeline.extract_platform import (
    extract_explicit_fee_lines,
    try_platform_extraction,
)


def test_generic_html_tables_extract_without_llm():
    html = """
    <table>
      <tr><th>Service fee</th><th>Amount</th></tr>
      <tr><td>Overdraft Fee</td><td>$35.00</td></tr>
      <tr><td>Wire Transfer Fee</td><td>$25.00</td></tr>
      <tr><td>Stop Payment Fee</td><td>$30.00</td></tr>
    </table>
    """

    fees = try_platform_extraction("generic", html, True)

    assert fees is not None
    assert [(fee.fee_name, fee.amount) for fee in fees] == [
        ("Overdraft Fee", 35.0),
        ("Wire Transfer Fee", 25.0),
        ("Stop Payment Fee", 30.0),
    ]


def test_explicit_text_rule_is_conservative():
    fees = extract_explicit_fee_lines(
        """
        Overdraft Fee ........ $35.00
        Monthly Maintenance Charge: $12
        Stop Payment Fee - $30.00
        Minimum balance to open $500
        ATM daily limit $600
        """
    )

    assert [(fee.fee_name, fee.amount) for fee in fees] == [
        ("Overdraft Fee", 35.0),
        ("Monthly Maintenance Charge", 12.0),
        ("Stop Payment Fee", 30.0),
    ]
    assert all(fee.extracted_by == "explicit_text_rule" for fee in fees)


def test_explicit_text_rule_supports_pdf_table_layouts():
    fees = extract_explicit_fee_lines(
        """
        Monthly maintenance fee

        $0.00 - $3.00
        Other account fees

        $2.50* per ATM transaction. In addition to our fee, an ATM owner may charge a fee.
        $20.00* per outbound transfer or rollover to another HSA custodian.
        $1.50 printed statement fee. If you choose paper delivery, we may charge this fee.

        Monthly investment fee | Investment threshold
        $0.00 - $3.00 $500.00 - $2000.00 - account balance threshold
        """
    )

    assert [(fee.fee_name, fee.amount) for fee in fees] == [
        ("Monthly maintenance fee", 3.0),
        ("ATM transaction", 2.5),
        ("outbound transfer or rollover to another HSA custodian", 20.0),
        ("printed statement fee", 1.5),
        ("Monthly investment fee", 3.0),
    ]


def test_explicit_text_rule_rejects_non_fee_financial_amounts():
    fees = extract_explicit_fee_lines(
        """
        Median Housing Value $347,355
        Required opening deposit
        $500.00
        Daily withdrawal limit $1,000
        Originated a $12.0 million loan
        Schwab Health Savings Brokerage Account: $0.00. There is no monthly maintenance fee.
        """
    )

    assert fees == []

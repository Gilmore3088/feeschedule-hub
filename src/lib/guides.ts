import { GUIDE_SOURCES, type GuideSource } from "./guides-sources";

export interface Guide {
  slug: string;
  title: string;
  description: string;
  /** The fee category this guide's live stat cards, chart, and hero lead with. */
  primaryCategory: string;
  /** All fee categories shown in this guide's live data cards and sidebar. */
  feeCategories: string[];
  sections: GuideSection[];
  /** 2-4 real external citations backing this guide's claims. */
  sources: GuideSource[];
}

export interface GuideSection {
  /** Phrased as a question — feeds the page's FAQPage JSON-LD verbatim. */
  heading: string;
  /**
   * May contain `{{median}}`, `{{p25}}`, `{{p75}}`, `{{n}}` tokens, filled
   * from `primaryCategory`'s live canonical benchmark by renderGuideProse
   * so this prose can never drift from the index shown on the same page.
   */
  content: string;
}

export const GUIDES: Guide[] = [
  {
    slug: "overdraft-fees",
    title: "Understanding Overdraft Fees: What Banks Charge and How to Avoid Them",
    description:
      "A complete guide to overdraft fees at US banks and credit unions. National benchmarks, how to compare institutions, and strategies to minimize costs.",
    primaryCategory: "overdraft",
    feeCategories: ["overdraft", "od_daily_cap", "od_protection_transfer"],
    sections: [
      {
        heading: "What is an overdraft fee?",
        content:
          "An overdraft fee is charged when a transaction exceeds your available balance and the bank covers the difference. Overdraft fees at the institutions we track have a median of {{median}}; the middle half fall between {{p25}} and {{p75}} across {{n}} institutions. Overdraft fees remain one of the most significant sources of non-interest income for banks and credit unions.",
      },
      {
        heading: "How do overdraft fees vary by institution?",
        content:
          "Overdraft fees vary significantly by institution type, size, and geography. Credit unions generally charge less than banks, and some institutions have eliminated the fee entirely or introduced tiered pricing based on the transaction amount. Some also cap how many overdraft fees they charge per day (see the OD Daily Fee Cap card above) and separately charge for automatic protection transfers from a linked savings account.",
      },
      {
        heading: "How can I avoid overdraft fees?",
        content:
          "Link a savings account for automatic overdraft protection transfers, usually far cheaper than a standard overdraft fee (see the OD Protection Transfer card above). Set up low balance alerts, opt out of debit card overdraft coverage for point-of-sale transactions, and consider institutions that offer grace periods or have eliminated overdraft fees outright.",
      },
    ],
    sources: GUIDE_SOURCES.overdraftFees,
  },
  {
    slug: "nsf-fees",
    title: "NSF Fees Explained: Non-Sufficient Funds Charges at US Banks",
    description:
      "What are NSF fees, how much do banks charge, and how do they differ from overdraft fees? National data and tips for consumers.",
    primaryCategory: "nsf",
    feeCategories: ["nsf", "nsf_daily_cap"],
    sections: [
      {
        heading: "What is an NSF fee?",
        content:
          "A non-sufficient funds (NSF) fee is charged when a transaction is declined because your account lacks the funds to cover it — the bank does not cover the transaction, and the check or payment bounces back to the payee. NSF fees at the institutions we track have a median of {{median}}, with the middle half between {{p25}} and {{p75}} across {{n}} institutions.",
      },
      {
        heading: "How does an NSF fee differ from an overdraft fee?",
        content:
          "With an overdraft, the bank pays the transaction and charges a fee. With NSF, the bank declines the transaction and still charges a fee. Some institutions have merged the two into a single fee structure, capped how many NSF fees they charge per day (see the NSF Daily Fee Cap card above), or eliminated NSF fees while keeping overdraft fees.",
      },
      {
        heading: "How can I reduce my NSF risk?",
        content:
          "Monitor your balance through mobile banking, set up automatic transfers from savings as a buffer, and time bill payments to align with paycheck deposits. Look for banks that send real-time low-balance alerts before a transaction is declined.",
      },
    ],
    sources: GUIDE_SOURCES.nsfFees,
  },
  {
    slug: "atm-fees",
    title: "ATM Fees by Bank: How Much You Pay for Out-of-Network Withdrawals",
    description:
      "Compare ATM fees at US banks and credit unions. Foreign ATM surcharges, network access, and how to minimize ATM costs.",
    primaryCategory: "atm_non_network",
    feeCategories: ["atm_non_network", "atm_international", "balance_inquiry"],
    sections: [
      {
        heading: "What do banks charge for out-of-network ATM use?",
        content:
          "When you use an ATM outside your bank's network, you may pay two fees: a surcharge from the ATM operator and a separate fee from your own bank. The non-network ATM fee at the institutions we track has a median of {{median}}, with the middle half between {{p25}} and {{p75}} across {{n}} institutions.",
      },
      {
        heading: "How do ATM fees compare across institutions?",
        content:
          "Credit unions often charge less or participate in surcharge-free networks like CO-OP or Allpoint. Online-only banks frequently offer unlimited ATM fee rebates. International ATM withdrawals carry a separate fee (see the International ATM card above), and some institutions also charge for a balance inquiry at another bank's machine.",
      },
      {
        heading: "How can I minimize ATM costs?",
        content:
          "Use your bank's ATM locator app, or get cash back at point-of-sale instead of using an ATM. Consider a credit union with CO-OP network access — tens of thousands of surcharge-free ATMs nationwide — or a bank that rebates out-of-network ATM fees.",
      },
    ],
    sources: GUIDE_SOURCES.atmFees,
  },
  {
    slug: "wire-transfer-fees",
    title: "Wire Transfer Fees: What Banks Charge for Domestic and International Wires",
    description:
      "Compare wire transfer fees at US banks and credit unions. Domestic vs. international, incoming vs. outgoing, and cheaper alternatives.",
    primaryCategory: "wire_domestic_outgoing",
    feeCategories: [
      "wire_domestic_outgoing",
      "wire_domestic_incoming",
      "wire_intl_outgoing",
      "wire_intl_incoming",
    ],
    sections: [
      {
        heading: "How do wire transfer fees work?",
        content:
          "Wire transfers are electronic fund transfers between banks, most often carried over the Fedwire network for domestic wires. Fees vary by direction (incoming vs. outgoing) and destination (domestic vs. international); outgoing wires are consistently more expensive than incoming. The domestic outgoing wire fee at the institutions we track has a median of {{median}}, with the middle half between {{p25}} and {{p75}} across {{n}} institutions.",
      },
      {
        heading: "How much more do international wires cost?",
        content:
          "International wires cost more than domestic wires because of correspondent banking relationships, and incoming wires are usually cheaper than outgoing ones in both directions (see the incoming and international cards above). Credit unions generally charge less than banks for every wire type.",
      },
      {
        heading: "What are cheaper alternatives to a wire transfer?",
        content:
          "For domestic transfers, ACH is usually free but takes one to three business days. Zelle offers free instant transfers between participating banks. For international transfers, non-bank transfer services often offer better exchange rates and lower fees than a traditional bank wire.",
      },
    ],
    sources: GUIDE_SOURCES.wireTransferFees,
  },
  {
    slug: "monthly-maintenance-fees",
    title: "Monthly Maintenance Fees: Which Banks Charge Them and How to Avoid Them",
    description:
      "Guide to monthly account maintenance fees at US banks and credit unions. How much they cost, who charges them, and how to get them waived.",
    primaryCategory: "monthly_maintenance",
    feeCategories: ["monthly_maintenance", "early_closure", "dormant_account"],
    sections: [
      {
        heading: "What is a monthly maintenance fee?",
        content:
          "Monthly maintenance fees (also called monthly service charges) are recurring fees for keeping a checking or savings account open. The fee at the institutions we track has a median of {{median}}, with the middle half between {{p25}} and {{p75}} across {{n}} institutions, and it's typically waivable by meeting a minimum balance, setting up direct deposit, or maintaining a certain number of transactions.",
      },
      {
        heading: "Which institutions are most likely to charge one?",
        content:
          "Large national banks are the most likely to charge a monthly maintenance fee; community banks charge moderate fees. Credit unions are the least likely to charge one, and online-only banks almost never do. Some institutions also charge for closing an account soon after opening it, or for leaving one dormant (see the Early Account Closure and Dormant Account cards above).",
      },
      {
        heading: "How can I get the fee waived?",
        content:
          "Set up direct deposit, the most common waiver. Maintain a minimum daily or average balance, link multiple accounts at the same institution, or enroll in paperless statements. Student and senior accounts often have automatic fee waivers; if none of these work, consider switching to a no-fee institution.",
      },
    ],
    sources: GUIDE_SOURCES.monthlyMaintenanceFees,
  },
  {
    slug: "foreign-transaction-fees",
    title: "Foreign Transaction Fees: What Banks Charge for International Purchases",
    description:
      "How much US banks charge for foreign transactions, currency conversion, and international card use.",
    primaryCategory: "card_foreign_txn",
    feeCategories: ["card_foreign_txn", "atm_international"],
    sections: [
      {
        heading: "What is a foreign transaction fee?",
        content:
          "A foreign transaction fee is a surcharge applied when you make a purchase in a foreign currency or through a foreign bank, separate from any currency-conversion spread applied by the card network. The fee at the institutions we track has a median of {{median}}, with the middle half between {{p25}} and {{p75}} across {{n}} institutions.",
      },
      {
        heading: "How do foreign transaction fees compare across cards?",
        content:
          "Many travel-focused credit cards waive this fee entirely. Credit unions vary widely — some charge less than large banks, others match them. Online banks increasingly offer no foreign transaction fees as a competitive feature. International ATM withdrawals carry a separate fee (see the International ATM card above).",
      },
      {
        heading: "How can I avoid foreign transaction fees?",
        content:
          "Use a card that waives foreign transaction fees when traveling, and pay in local currency rather than USD to avoid dynamic currency conversion markups. For international ATM withdrawals, look for a bank that reimburses ATM fees and waives foreign transaction surcharges.",
      },
    ],
    sources: GUIDE_SOURCES.foreignTransactionFees,
  },
  {
    slug: "check-fees",
    title: "Check Fees: Cashier's Checks, Stop Payments, and Check Printing Costs",
    description:
      "What banks charge for check-related services including cashier's checks, stop payments, and check printing.",
    primaryCategory: "cashiers_check",
    feeCategories: ["cashiers_check", "stop_payment", "check_printing", "money_order", "counter_check"],
    sections: [
      {
        heading: "What do banks charge for a cashier's check?",
        content:
          "A cashier's check is a guaranteed check drawn on the bank's own funds rather than the customer's account. The fee at the institutions we track has a median of {{median}}, with the middle half between {{p25}} and {{p75}} across {{n}} institutions.",
      },
      {
        heading: "How do other check-related fees compare?",
        content:
          "Stop payment orders, check printing, and counter checks are priced separately from cashier's checks and vary widely by institution and style (see the cards above for each). Money orders are a cheaper paper alternative for smaller amounts — the USPS is a common non-bank comparison point for pricing.",
      },
      {
        heading: "How can I reduce check-related costs?",
        content:
          "Order checks from a third-party vendor instead of your bank. Use electronic payments (ACH, Zelle) instead of a cashier's check when the payee accepts them. Ask about fee waivers for premium accounts — credit union members often get better rates on check services.",
      },
    ],
    sources: GUIDE_SOURCES.checkFees,
  },
  {
    slug: "digital-banking-fees",
    title: "Digital Banking Fees: ACH, Mobile Deposit, and Online Payment Costs",
    description:
      "Fees for digital banking services including ACH transfers, mobile deposits, bill pay, and electronic payments.",
    primaryCategory: "ach_origination",
    feeCategories: ["ach_origination", "ach_return", "bill_pay", "mobile_deposit"],
    sections: [
      {
        heading: "What are digital banking fees?",
        content:
          "Digital banking fees cover electronic services like ACH transfers, mobile check deposits, and online bill payments. ACH origination — initiating an electronic transfer — has a median fee of {{median}} at the institutions we track, with the middle half between {{p25}} and {{p75}} across {{n}} institutions.",
      },
      {
        heading: "How do the other digital fees compare?",
        content:
          "ACH returns (bounced electronic payments) are priced separately from origination (see the ACH Return card above). Mobile deposit and bill pay are free at many institutions, but some cap the number of free mobile deposits per month or charge for expedited bill payments — check the cards above for the live figures.",
      },
      {
        heading: "How do I choose a digital-first bank?",
        content:
          "Online-only banks typically offer the most generous digital banking terms: no ACH fees, unlimited mobile deposits, and free bill pay. Traditional banks are increasingly matching these offerings, so compare the digital fee schedule carefully if you rely heavily on electronic transfers.",
      },
    ],
    sources: GUIDE_SOURCES.digitalBankingFees,
  },
  {
    slug: "account-closure-fees",
    title: "Account Closure & Dormant Fees: What Banks Charge for Inactive Accounts",
    description:
      "Fees for closing accounts early and penalties for inactive or dormant accounts at US banks and credit unions.",
    primaryCategory: "early_closure",
    feeCategories: ["early_closure", "dormant_account", "account_research"],
    sections: [
      {
        heading: "What is an early account closure fee?",
        content:
          "Many banks charge a fee if you close your account within 90 to 180 days of opening it, designed to discourage account churning. The fee at the institutions we track has a median of {{median}}, with the middle half between {{p25}} and {{p75}} across {{n}} institutions; not all institutions charge it, and credit unions are less likely to impose it.",
      },
      {
        heading: "What happens if my account goes dormant?",
        content:
          "If your account has no activity for 12 to 24 months, a bank may classify it as dormant and begin charging a monthly inactivity fee (see the Dormant Account card above). After a longer period with no contact from the owner, unclaimed funds may be escheated to the state under its unclaimed-property law.",
      },
      {
        heading: "How can I avoid closure and dormancy charges?",
        content:
          "Keep an account open for at least six months before closing it, and set up a small recurring transaction to prevent dormancy. Before closing, transfer all funds and confirm any pending transactions have cleared, and request written confirmation of the closure.",
      },
    ],
    sources: GUIDE_SOURCES.accountClosureFees,
  },
  {
    slug: "safe-deposit-fees",
    title: "Safe Deposit Box Fees: What Banks Charge for Secure Storage",
    description:
      "Annual costs for safe deposit boxes at US banks, box sizes, and what to consider before renting.",
    primaryCategory: "safe_deposit_box",
    feeCategories: ["safe_deposit_box", "notary_fee"],
    sections: [
      {
        heading: "How much does a safe deposit box cost?",
        content:
          "Safe deposit box fees are charged annually and vary by box size, from small boxes up to large ones. The annual fee at the institutions we track has a median of {{median}}, with the middle half between {{p25}} and {{p75}} across {{n}} institutions.",
      },
      {
        heading: "How do safe deposit box fees compare across institutions?",
        content:
          "Credit unions often offer lower safe deposit box rates than banks, and urban branches tend to charge more than suburban or rural locations. Some institutions offer discounts for premium account holders; notary services are usually priced separately (see the Notary Service card above).",
      },
      {
        heading: "What happens to an abandoned safe deposit box?",
        content:
          "If a box goes unpaid or unvisited long enough, a bank can drill it and, after required notice, turn the contents over to the state as unclaimed property. If you think a box was escheated, check your state's unclaimed-property office or a national unclaimed-property database.",
      },
    ],
    sources: GUIDE_SOURCES.safeDepositFees,
  },
];

export function getGuide(slug: string): Guide | undefined {
  return GUIDES.find((g) => g.slug === slug);
}

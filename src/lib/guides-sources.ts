/**
 * Real, stable external citations for the consumer guides in guides.ts.
 * Kept in a separate module so guides.ts stays focused on guide content.
 * Each guide cites 2-4 of these government/industry sources relevant to
 * its topic — no guide should ship with zero external citations.
 */

export interface GuideSource {
  label: string;
  url: string;
}

const CFPB_OVERDRAFT_OPTIONS: GuideSource = {
  label: "CFPB — Know your overdraft options",
  url: "https://www.consumerfinance.gov/consumer-tools/bank-accounts/know-your-overdraft-options/",
};

const CFPB_OVERDRAFT_NSF_REVENUE: GuideSource = {
  label: "CFPB — Overdraft/NSF revenue data spotlight (2023)",
  url: "https://www.consumerfinance.gov/data-research/research-reports/data-spotlight-overdraft-nsf-revenue-in-2023-down-more-than-50-versus-pre-pandemic-levels-saving-consumers-over-6-billion-annually/",
};

const REG_E: GuideSource = {
  label: "Regulation E — Electronic Fund Transfers (12 CFR 1005)",
  url: "https://www.consumerfinance.gov/rules-policy/regulations/1005/",
};

const REG_DD: GuideSource = {
  label: "Regulation DD — Truth in Savings (12 CFR 1030)",
  url: "https://www.consumerfinance.gov/rules-policy/regulations/1030/",
};

const REG_Z: GuideSource = {
  label: "Regulation Z — Truth in Lending (12 CFR 1026)",
  url: "https://www.consumerfinance.gov/rules-policy/regulations/1026/",
};

const REG_CC: GuideSource = {
  label: "Regulation CC — Availability of Funds and Collection of Checks",
  url: "https://www.consumerfinance.gov/rules-policy/final-rules/availability-funds-and-collection-checks-regulation-cc/",
};

const FDIC_OVERDRAFT_FEES: GuideSource = {
  label: "FDIC — Overdraft and Account Fees",
  url: "https://www.fdic.gov/consumer-resource-center/2021-12/overdraft-and-account-fees",
};

const FDIC_LOST_ACCOUNT: GuideSource = {
  label: "FDIC — How to Find a Long Lost Bank Account or Safe Deposit Box",
  url: "https://www.fdic.gov/consumer-resource-center/2020-12/how-find-long-lost-bank-account-or-safe-deposit-box",
};

const NCUA_CONSUMERS: GuideSource = {
  label: "NCUA — Consumers",
  url: "https://ncua.gov/consumers",
};

const FEDWIRE: GuideSource = {
  label: "Federal Reserve Financial Services — Fedwire Funds Service",
  url: "https://www.frbservices.org/financial-services/wires",
};

const USPS_MONEY_ORDERS: GuideSource = {
  label: "USPS — Money Orders",
  url: "https://www.usps.com/shop/money-orders.htm",
};

const NAUPA_UNCLAIMED: GuideSource = {
  label: "NAUPA — National Association of Unclaimed Property Administrators",
  url: "https://unclaimed.org",
};

/** 2-4 sources per guide slug, chosen for topical relevance. */
export const GUIDE_SOURCES = {
  overdraftFees: [CFPB_OVERDRAFT_OPTIONS, CFPB_OVERDRAFT_NSF_REVENUE, FDIC_OVERDRAFT_FEES, REG_DD],
  nsfFees: [CFPB_OVERDRAFT_NSF_REVENUE, CFPB_OVERDRAFT_OPTIONS, REG_DD],
  atmFees: [REG_E, NCUA_CONSUMERS, FDIC_OVERDRAFT_FEES],
  wireTransferFees: [FEDWIRE, REG_DD, NCUA_CONSUMERS],
  monthlyMaintenanceFees: [REG_DD, FDIC_OVERDRAFT_FEES, NCUA_CONSUMERS],
  foreignTransactionFees: [REG_Z, REG_E],
  checkFees: [USPS_MONEY_ORDERS, REG_CC, REG_DD],
  digitalBankingFees: [REG_E, REG_DD],
  accountClosureFees: [REG_DD, NAUPA_UNCLAIMED, FDIC_LOST_ACCOUNT],
  safeDepositFees: [FDIC_LOST_ACCOUNT, NAUPA_UNCLAIMED],
} satisfies Record<string, GuideSource[]>;

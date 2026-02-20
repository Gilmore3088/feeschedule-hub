import { getDb } from "./connection";

export interface InstitutionFinancial {
  crawl_target_id: number;
  report_date: string;
  source: string;
  total_assets: number | null;
  total_deposits: number | null;
  total_loans: number | null;
  service_charge_income: number | null;
  other_noninterest_income: number | null;
  net_interest_margin: number | null;
  efficiency_ratio: number | null;
  roa: number | null;
  roe: number | null;
  tier1_capital_ratio: number | null;
  branch_count: number | null;
  employee_count: number | null;
  member_count: number | null;
}

export interface FinancialStats {
  fdic_records: number;
  ncua_records: number;
  institutions_with_financials: number;
  complaint_records: number;
  institutions_with_complaints: number;
}

export interface ComplaintSummary {
  product: string;
  complaint_count: number;
}

export function getFinancialStats(): FinancialStats {
  const db = getDb();
  const fdic = db
    .prepare("SELECT COUNT(*) as cnt FROM institution_financials WHERE source = 'fdic'")
    .get() as { cnt: number };
  const ncua = db
    .prepare("SELECT COUNT(*) as cnt FROM institution_financials WHERE source = 'ncua'")
    .get() as { cnt: number };
  const instFin = db
    .prepare("SELECT COUNT(DISTINCT crawl_target_id) as cnt FROM institution_financials")
    .get() as { cnt: number };
  const complaints = db
    .prepare("SELECT COUNT(*) as cnt FROM institution_complaints")
    .get() as { cnt: number };
  const instComp = db
    .prepare("SELECT COUNT(DISTINCT crawl_target_id) as cnt FROM institution_complaints")
    .get() as { cnt: number };

  return {
    fdic_records: fdic.cnt,
    ncua_records: ncua.cnt,
    institutions_with_financials: instFin.cnt,
    complaint_records: complaints.cnt,
    institutions_with_complaints: instComp.cnt,
  };
}

export function getFinancialsByInstitution(
  targetId: number
): InstitutionFinancial[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT crawl_target_id, report_date, source,
              total_assets, total_deposits, total_loans,
              service_charge_income, other_noninterest_income,
              net_interest_margin, efficiency_ratio,
              roa, roe, tier1_capital_ratio,
              branch_count, employee_count, member_count
       FROM institution_financials
       WHERE crawl_target_id = ?
       ORDER BY report_date DESC`
    )
    .all(targetId) as InstitutionFinancial[];
}

export function getComplaintsByInstitution(
  targetId: number
): ComplaintSummary[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT product, complaint_count
       FROM institution_complaints
       WHERE crawl_target_id = ? AND issue = '_total'
       ORDER BY complaint_count DESC`
    )
    .all(targetId) as ComplaintSummary[];
}

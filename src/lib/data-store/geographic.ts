import { sql } from "./connection";
import { VALID_US_CODES } from "../us-states";

export interface GeoStats {
  institution_count: number;
  bank_count: number;
  cu_count: number;
  with_fees: number;
  total_fees: number;
  fee_categories: number;
}

export async function getStateStats(stateCode: string): Promise<GeoStats> {
  const [inst] = await sql`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN charter_type = 'bank' THEN 1 ELSE 0 END) as banks,
      SUM(CASE WHEN charter_type = 'credit_union' THEN 1 ELSE 0 END) as cus
    FROM institution_sources WHERE state_code = ${stateCode}
  ` as { total: number; banks: number; cus: number }[];

  const [fees] = await sql`
    SELECT COUNT(DISTINCT ef.institution_id) as with_fees,
           COUNT(*) as total_fees,
           COUNT(DISTINCT ef.fee_category) as categories
    FROM published_fee_catalog ef
    JOIN institution_sources ct ON ef.institution_id = ct.id
    WHERE ct.state_code = ${stateCode} AND ef.review_status = 'approved'
  ` as { with_fees: number; total_fees: number; categories: number }[];

  return {
    institution_count: Number(inst.total),
    bank_count: Number(inst.banks),
    cu_count: Number(inst.cus),
    with_fees: Number(fees.with_fees),
    total_fees: Number(fees.total_fees),
    fee_categories: Number(fees.categories),
  };
}

export async function getDistrictStats(districtId: number): Promise<GeoStats> {
  const [inst] = await sql`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN charter_type = 'bank' THEN 1 ELSE 0 END) as banks,
      SUM(CASE WHEN charter_type = 'credit_union' THEN 1 ELSE 0 END) as cus
    FROM institution_sources WHERE fed_district = ${districtId}
  ` as { total: number; banks: number; cus: number }[];

  const [fees] = await sql`
    SELECT COUNT(DISTINCT ef.institution_id) as with_fees,
           COUNT(*) as total_fees,
           COUNT(DISTINCT ef.fee_category) as categories
    FROM published_fee_catalog ef
    JOIN institution_sources ct ON ef.institution_id = ct.id
    WHERE ct.fed_district = ${districtId} AND ef.review_status = 'approved'
  ` as { with_fees: number; total_fees: number; categories: number }[];

  return {
    institution_count: Number(inst.total),
    bank_count: Number(inst.banks),
    cu_count: Number(inst.cus),
    with_fees: Number(fees.with_fees),
    total_fees: Number(fees.total_fees),
    fee_categories: Number(fees.categories),
  };
}

export async function getInstitutionIdsWithFees(): Promise<number[]> {
  const rows = await sql`
    SELECT DISTINCT institution_id as id
    FROM published_fee_catalog
    WHERE review_status = 'approved'
    ORDER BY institution_id
  ` as { id: number }[];
  return rows.map((r) => Number(r.id));
}

// --- City-level queries ---

export interface CityInstitution {
  id: number;
  institution_name: string;
  charter_type: string;
  asset_size: number | null;
  fee_count: number;
  overdraft: number | null;
  monthly_maintenance: number | null;
  nsf: number | null;
  atm_non_network: number | null;
}

export interface CityFeeAverage {
  fee_category: string;
  median: number;
  institution_count: number;
}

export interface CitySummary {
  city: string;
  state_code: string;
  institution_count: number;
  with_fees: number;
}

export async function getCityInstitutions(city: string, stateCode: string): Promise<CityInstitution[]> {
  const upperState = stateCode.toUpperCase();
  return await sql`
    SELECT ct.id, ct.institution_name, ct.charter_type, ct.asset_size,
           COALESCE(fc.fee_count, 0) as fee_count,
           (SELECT ef.amount FROM published_fee_catalog ef WHERE ef.institution_id = ct.id AND ef.fee_category = 'overdraft' AND ef.review_status = 'approved' LIMIT 1) as overdraft,
           (SELECT ef.amount FROM published_fee_catalog ef WHERE ef.institution_id = ct.id AND ef.fee_category = 'monthly_maintenance' AND ef.review_status = 'approved' LIMIT 1) as monthly_maintenance,
           (SELECT ef.amount FROM published_fee_catalog ef WHERE ef.institution_id = ct.id AND ef.fee_category = 'nsf' AND ef.review_status = 'approved' LIMIT 1) as nsf,
           (SELECT ef.amount FROM published_fee_catalog ef WHERE ef.institution_id = ct.id AND ef.fee_category = 'atm_non_network' AND ef.review_status = 'approved' LIMIT 1) as atm_non_network
    FROM institution_sources ct
    LEFT JOIN (
      SELECT institution_id, COUNT(*) as fee_count
      FROM published_fee_catalog WHERE review_status = 'approved'
      GROUP BY institution_id
    ) fc ON ct.id = fc.institution_id
    WHERE LOWER(ct.city) = LOWER(${city}) AND ct.state_code = ${upperState}
    AND fc.fee_count > 0
    ORDER BY ct.asset_size DESC NULLS LAST
  ` as CityInstitution[];
}

export async function getCityFeeAverages(city: string, stateCode: string): Promise<CityFeeAverage[]> {
  const upperState = stateCode.toUpperCase();
  const rows = await sql`
    SELECT ef.fee_category,
           ROUND(AVG(ef.amount)::numeric, 2) as median,
           COUNT(DISTINCT ef.institution_id) as institution_count
    FROM published_fee_catalog ef
    JOIN institution_sources ct ON ef.institution_id = ct.id
    WHERE LOWER(ct.city) = LOWER(${city}) AND ct.state_code = ${upperState}
      AND ef.review_status = 'approved'
      AND ef.amount IS NOT NULL AND ef.amount > 0
      AND ef.fee_category IS NOT NULL
    GROUP BY ef.fee_category
    HAVING COUNT(DISTINCT ef.institution_id) >= 2
    ORDER BY COUNT(DISTINCT ef.institution_id) DESC
  ` as CityFeeAverage[];

  return rows.map((r) => ({
    ...r,
    median: Number(r.median),
    institution_count: Number(r.institution_count),
  }));
}

export async function getCitiesInState(stateCode: string): Promise<CitySummary[]> {
  const upperState = stateCode.toUpperCase();
  return await sql`
    SELECT ct.city, ct.state_code,
           COUNT(*) as institution_count,
           COUNT(DISTINCT CASE WHEN fc.fee_count > 0 THEN ct.id END) as with_fees
    FROM institution_sources ct
    LEFT JOIN (
      SELECT institution_id, COUNT(*) as fee_count
      FROM published_fee_catalog WHERE review_status = 'approved'
      GROUP BY institution_id
    ) fc ON ct.id = fc.institution_id
    WHERE ct.state_code = ${upperState} AND ct.city IS NOT NULL AND ct.city != ''
    GROUP BY LOWER(ct.city), ct.city, ct.state_code
    HAVING COUNT(DISTINCT CASE WHEN fc.fee_count > 0 THEN ct.id END) > 0
    ORDER BY COUNT(DISTINCT CASE WHEN fc.fee_count > 0 THEN ct.id END) DESC, COUNT(*) DESC
  ` as CitySummary[];
}

export async function getCityAutocomplete(query: string, limit: number = 10): Promise<{ city: string; state_code: string; count: number }[]> {
  const pattern = `${query}%`;
  return await sql`
    SELECT ct.city, ct.state_code, COUNT(DISTINCT ct.id) as count
    FROM institution_sources ct
    WHERE ct.city ILIKE ${pattern} AND ct.city IS NOT NULL
    AND ct.id IN (SELECT DISTINCT institution_id FROM published_fee_catalog WHERE review_status = 'approved')
    GROUP BY LOWER(ct.city), ct.city, ct.state_code
    ORDER BY count DESC
    LIMIT ${limit}
  ` as { city: string; state_code: string; count: number }[];
}

export async function getStatesWithFeeData(): Promise<{ state_code: string; institution_count: number; fee_count: number }[]> {
  const codes = [...VALID_US_CODES];
  const params: string[] = codes;
  const placeholders = codes.map((_, i) => `$${i + 1}`).join(",");
  const rows = await sql.unsafe(
    `SELECT ct.state_code,
            COUNT(DISTINCT ct.id) as institution_count,
            COUNT(ef.id) as fee_count
     FROM institution_sources ct
     JOIN published_fee_catalog ef ON ct.id = ef.institution_id
     WHERE ct.state_code IN (${placeholders})
       AND ef.review_status = 'approved'
     GROUP BY ct.state_code
     ORDER BY COUNT(DISTINCT ct.id) DESC`,
    params
  ) as { state_code: string; institution_count: string | number; fee_count: string | number }[];
  return rows.map((r) => ({
    state_code: r.state_code,
    institution_count: Number(r.institution_count),
    fee_count: Number(r.fee_count),
  }));
}

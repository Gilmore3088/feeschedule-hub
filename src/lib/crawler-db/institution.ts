/**
 * Institution detail page queries.
 *
 * All functions use `sql` from connection.ts, wrap numeric returns with Number(),
 * and provide try/catch with safe fallbacks.
 */

import { sql } from "@/lib/crawler-db/connection";
import { toDateStr, safeJsonb } from "@/lib/pg-helpers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Institution {
  id: number;
  institution_name: string;
  city: string | null;
  state_code: string | null;
  charter_type: string | null;
  asset_size_tier: string | null;
  asset_size: number | null;
  fed_district: number | null;
  cert_number: string | null;
  website_url: string | null;
  fee_schedule_url: string | null;
  document_type: string | null;
  last_crawl_at: string;
  consecutive_failures: number;
}

export interface InstitutionFee {
  id: number;
  fee_name: string;
  amount: number | null;
  frequency: string | null;
  conditions: string | null;
  extraction_confidence: number | null;
  review_status: string;
  fee_category: string | null;
  fee_family: string | null;
  account_product_type: string | null;
  is_fee_cap: boolean;
  created_at: string;
}

export interface InstitutionCrawl {
  id: number;
  crawl_run_id: number | null;
  status: string;
  document_url: string | null;
  fees_extracted: number;
  error_message: string | null;
  crawled_at: string;
}

export interface InstitutionAgentResult {
  id: number;
  agent_run_id: number;
  stage: string;
  status: string;
  detail: Record<string, unknown> | null;
  run_started_at: string;
  run_status: string;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function getInstitution(
  id: number,
): Promise<Institution | null> {
  try {
    const rows = await sql`
      SELECT
        id, institution_name, city, state_code,
        charter_type, asset_size_tier, asset_size,
        fed_district, cert_number, website_url,
        fee_schedule_url, document_type,
        last_crawl_at, consecutive_failures
      FROM crawl_targets
      WHERE id = ${id}
    `;
    const r = rows[0];
    if (!r) return null;
    return {
      id: Number(r.id),
      institution_name: String(r.institution_name),
      city: r.city ? String(r.city) : null,
      state_code: r.state_code ? String(r.state_code) : null,
      charter_type: r.charter_type ? String(r.charter_type) : null,
      asset_size_tier: r.asset_size_tier ? String(r.asset_size_tier) : null,
      asset_size: r.asset_size != null ? Number(r.asset_size) : null,
      fed_district: r.fed_district != null ? Number(r.fed_district) : null,
      cert_number: r.cert_number ? String(r.cert_number) : null,
      website_url: r.website_url ? String(r.website_url) : null,
      fee_schedule_url: r.fee_schedule_url ? String(r.fee_schedule_url) : null,
      document_type: r.document_type ? String(r.document_type) : null,
      last_crawl_at: toDateStr(r.last_crawl_at as string | Date | null),
      consecutive_failures: Number(r.consecutive_failures ?? 0),
    };
  } catch (e) {
    console.error("getInstitution failed:", e);
    return null;
  }
}

export async function getInstitutionFees(
  id: number,
): Promise<InstitutionFee[]> {
  try {
    const rows = await sql`
      SELECT
        id, fee_name, amount, frequency, conditions,
        extraction_confidence, review_status,
        fee_category, fee_family,
        account_product_type, is_fee_cap, created_at
      FROM extracted_fees
      WHERE crawl_target_id = ${id}
        AND review_status != 'rejected'
      ORDER BY fee_category ASC NULLS LAST, fee_name ASC
    `;
    return rows.map((r) => ({
      id: Number(r.id),
      fee_name: String(r.fee_name),
      amount: r.amount != null ? Number(r.amount) : null,
      frequency: r.frequency ? String(r.frequency) : null,
      conditions: r.conditions ? String(r.conditions) : null,
      extraction_confidence: r.extraction_confidence != null
        ? Number(r.extraction_confidence)
        : null,
      review_status: String(r.review_status ?? "pending"),
      fee_category: r.fee_category ? String(r.fee_category) : null,
      fee_family: r.fee_family ? String(r.fee_family) : null,
      account_product_type: r.account_product_type
        ? String(r.account_product_type)
        : null,
      is_fee_cap: Boolean(r.is_fee_cap),
      created_at: toDateStr(r.created_at as string | Date | null),
    }));
  } catch (e) {
    console.error("getInstitutionFees failed:", e);
    return [];
  }
}

export async function getInstitutionCrawlHistory(
  id: number,
  limit = 10,
): Promise<InstitutionCrawl[]> {
  try {
    const rows = await sql`
      SELECT
        id, crawl_run_id, status, document_url,
        COALESCE(fees_extracted, 0) as fees_extracted,
        error_message, crawled_at
      FROM crawl_results
      WHERE crawl_target_id = ${id}
      ORDER BY crawled_at DESC NULLS LAST
      LIMIT ${limit}
    `;
    return rows.map((r) => ({
      id: Number(r.id),
      crawl_run_id: r.crawl_run_id != null ? Number(r.crawl_run_id) : null,
      status: String(r.status),
      document_url: r.document_url ? String(r.document_url) : null,
      fees_extracted: Number(r.fees_extracted),
      error_message: r.error_message ? String(r.error_message) : null,
      crawled_at: toDateStr(r.crawled_at as string | Date | null),
    }));
  } catch (e) {
    console.error("getInstitutionCrawlHistory failed:", e);
    return [];
  }
}

export async function getInstitutionAgentResults(
  id: number,
  limit = 10,
): Promise<InstitutionAgentResult[]> {
  try {
    const rows = await sql`
      SELECT
        arr.id,
        arr.agent_run_id,
        arr.stage,
        arr.status,
        arr.detail,
        ar.started_at as run_started_at,
        ar.status as run_status
      FROM agent_run_results arr
      JOIN agent_runs ar ON ar.id = arr.agent_run_id
      WHERE arr.crawl_target_id = ${id}
      ORDER BY ar.started_at DESC NULLS LAST, arr.id DESC
      LIMIT ${limit}
    `;
    return rows.map((r) => ({
      id: Number(r.id),
      agent_run_id: Number(r.agent_run_id),
      stage: String(r.stage),
      status: String(r.status),
      detail: safeJsonb<Record<string, unknown>>(r.detail),
      run_started_at: toDateStr(r.run_started_at as string | Date | null),
      run_status: String(r.run_status),
    }));
  } catch (e) {
    console.error("getInstitutionAgentResults failed:", e);
    return [];
  }
}

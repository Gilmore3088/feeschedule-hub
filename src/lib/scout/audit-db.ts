// src/lib/scout/audit-db.ts

import { sql } from "@/lib/crawler-db/connection";
import type { InstitutionRow } from "./types";

export async function ensureAuditTables() {
  await sql`
    CREATE TABLE IF NOT EXISTS url_audit_runs (
      id SERIAL PRIMARY KEY,
      scope_type TEXT NOT NULL,
      scope_value TEXT,
      started_at TIMESTAMPTZ DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      total_institutions INTEGER DEFAULT 0,
      urls_validated INTEGER DEFAULT 0,
      urls_cleared INTEGER DEFAULT 0,
      urls_discovered INTEGER DEFAULT 0,
      urls_ai_found INTEGER DEFAULT 0,
      still_missing INTEGER DEFAULT 0,
      ai_cost_cents INTEGER DEFAULT 0
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS url_audit_results (
      id SERIAL PRIMARY KEY,
      audit_run_id INTEGER REFERENCES url_audit_runs(id),
      crawl_target_id INTEGER NOT NULL,
      url_before TEXT,
      url_after TEXT,
      action TEXT NOT NULL,
      discovery_method TEXT,
      confidence REAL,
      reason TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_audit_results_run_id
    ON url_audit_results(audit_run_id)
  `;
}

export async function createAuditRun(
  scopeType: string,
  scopeValue: string | null,
  totalInstitutions: number
): Promise<number> {
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO url_audit_runs (scope_type, scope_value, total_institutions)
    VALUES (${scopeType}, ${scopeValue}, ${totalInstitutions})
    RETURNING id
  `;
  return row.id;
}

export async function recordAuditResult(
  auditRunId: number,
  crawlTargetId: number,
  urlBefore: string | null,
  urlAfter: string | null,
  action: string,
  discoveryMethod: string | null,
  confidence: number | null,
  reason: string | null
) {
  await sql`
    INSERT INTO url_audit_results
      (audit_run_id, crawl_target_id, url_before, url_after, action, discovery_method, confidence, reason)
    VALUES
      (${auditRunId}, ${crawlTargetId}, ${urlBefore}, ${urlAfter}, ${action}, ${discoveryMethod}, ${confidence}, ${reason})
  `;
}

export async function updateAuditRunStats(
  auditRunId: number,
  stats: {
    urls_validated?: number;
    urls_cleared?: number;
    urls_discovered?: number;
    urls_ai_found?: number;
    still_missing?: number;
    ai_cost_cents?: number;
  }
) {
  await sql`
    UPDATE url_audit_runs SET
      urls_validated = ${stats.urls_validated ?? 0},
      urls_cleared = ${stats.urls_cleared ?? 0},
      urls_discovered = ${stats.urls_discovered ?? 0},
      urls_ai_found = ${stats.urls_ai_found ?? 0},
      still_missing = ${stats.still_missing ?? 0},
      ai_cost_cents = ${stats.ai_cost_cents ?? 0},
      completed_at = NOW()
    WHERE id = ${auditRunId}
  `;
}

export async function clearFeeScheduleUrl(
  crawlTargetId: number
) {
  await sql`
    UPDATE crawl_targets
    SET fee_schedule_url = NULL
    WHERE id = ${crawlTargetId}
  `;
}

export async function setFeeScheduleUrl(
  crawlTargetId: number,
  url: string,
  documentType: string | null
) {
  await sql`
    UPDATE crawl_targets
    SET fee_schedule_url = ${url},
        document_type = ${documentType}
    WHERE id = ${crawlTargetId}
  `;
}

export async function getInstitutionsByScope(
  scopeType: string,
  scopeValue: string
): Promise<InstitutionRow[]> {
  if (scopeType === "state") {
    return sql<InstitutionRow[]>`
      SELECT * FROM crawl_targets
      WHERE status = 'active' AND state_code = ${scopeValue}
      ORDER BY asset_size DESC NULLS LAST
    `;
  }
  if (scopeType === "district") {
    return sql<InstitutionRow[]>`
      SELECT * FROM crawl_targets
      WHERE status = 'active' AND fed_district = ${Number(scopeValue)}
      ORDER BY asset_size DESC NULLS LAST
    `;
  }
  return [];
}

export async function getInstitutionById(
  id: number
): Promise<InstitutionRow | null> {
  const [row] = await sql<InstitutionRow[]>`
    SELECT * FROM crawl_targets WHERE id = ${id}
  `;
  return row || null;
}

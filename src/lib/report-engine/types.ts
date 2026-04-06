/**
 * Report Engine — Type Definitions
 * Phase 13-01: Supabase schema contracts for report_jobs + published_reports.
 */

// ─── Report Classification ─────────────────────────────────────────────────

export type ReportType =
  | 'national_index'
  | 'state_index'
  | 'peer_brief'
  | 'monthly_pulse';

export type ReportJobStatus =
  | 'pending'
  | 'assembling'
  | 'rendering'
  | 'complete'
  | 'failed';

// ─── Data Manifest ─────────────────────────────────────────────────────────
// Audit trail: stored as JSONB on report_jobs.
// Answers "where did this number come from?" for every report.

export interface DataManifest {
  /** Each query run during data assembly, with result metadata. */
  queries: Array<{
    sql: string;
    row_count: number;
    executed_at: string; // ISO 8601
  }>;
  /** SHA-256 hash of the assembled data payload. */
  data_hash: string;
  /** Git commit SHA of the pipeline that generated this report. */
  pipeline_commit: string;
}

// ─── Job Record ────────────────────────────────────────────────────────────

export interface ReportJob {
  id: string;
  report_type: ReportType;
  status: ReportJobStatus;
  params: Record<string, unknown> | null;
  data_manifest: DataManifest | null;
  artifact_key: string | null;
  error: string | null;
  created_at: string;
  completed_at: string | null;
  user_id: string | null;
}

// ─── Published Report ──────────────────────────────────────────────────────

export interface PublishedReport {
  id: string;
  job_id: string;
  report_type: ReportType;
  slug: string;
  title: string;
  published_at: string;
  is_public: boolean;
}

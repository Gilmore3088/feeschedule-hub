/**
 * Report Engine — Type Definitions
 * Phase 13-01: Supabase schema contracts for report_jobs + published_reports.
 * Decision refs: D-05, D-06, D-13 (see 13-CONTEXT.md)
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
// Audit trail: stored as JSONB on report_jobs (D-13).
// Answers "where did this number come from?" for every report.

export interface DataManifest {
  /** Each SQL query run during data assembly, with result metadata. */
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
// Mirrors all columns of the report_jobs table (D-05).

export interface ReportJob {
  id: string;
  report_type: ReportType;
  status: ReportJobStatus;
  /** Input parameters (geography, peer filters, date range, etc.) */
  params: Record<string, unknown> | null;
  /** Audit trail — populated after data assembly stage. */
  data_manifest: DataManifest | null;
  /** R2 object key for the rendered PDF. Null until rendering is complete. */
  artifact_key: string | null;
  /** Human-readable error message if status is 'failed'. */
  error: string | null;
  created_at: string;   // ISO 8601
  completed_at: string | null; // ISO 8601
  /** Null for cron-triggered jobs; set from verified session otherwise. */
  user_id: string | null;
}

// ─── Published Report ──────────────────────────────────────────────────────
// Catalog entry — separate from jobs (D-06). A job can complete without
// being published to the catalog.

export interface PublishedReport {
  id: string;
  job_id: string;
  report_type: ReportType;
  /** URL-safe unique identifier for this report. */
  slug: string;
  title: string;
  published_at: string; // ISO 8601
  is_public: boolean;
}

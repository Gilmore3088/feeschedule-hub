-- Migration: report_jobs + published_reports tables
-- Phase 13-01: Report Engine Core — Job Queue Schema
-- Decision refs: D-05, D-06, D-13 (see 13-CONTEXT.md)

-- ─── report_jobs ──────────────────────────────────────────────────────────────
-- Tracks every PDF generation job: status transitions, source data manifest,
-- R2 artifact key, and error messages. data_manifest is the audit trail that
-- answers "where did this number come from?" (D-13).

CREATE TABLE IF NOT EXISTS report_jobs (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type   text        NOT NULL,
  status        text        NOT NULL DEFAULT 'pending',
  params        jsonb,
  data_manifest jsonb,
  artifact_key  text,
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz,
  user_id       uuid        -- nullable: null for cron-triggered jobs

  CONSTRAINT report_jobs_status_check
    CHECK (status IN ('pending', 'assembling', 'rendering', 'complete', 'failed')),

  CONSTRAINT report_jobs_report_type_check
    CHECK (report_type IN ('national_index', 'state_index', 'peer_brief', 'monthly_pulse'))
);

-- Index for efficient poll queries (status + time ordering)
CREATE INDEX IF NOT EXISTS report_jobs_status_created_at_idx
  ON report_jobs (status, created_at);

-- Index for pro portal queries (jobs by user)
CREATE INDEX IF NOT EXISTS report_jobs_user_id_idx
  ON report_jobs (user_id);

-- ─── published_reports ────────────────────────────────────────────────────────
-- Catalog of reports surfaced to users. A job can complete without being
-- published (D-06). slug is unique — prevents duplicate catalog entries.

CREATE TABLE IF NOT EXISTS published_reports (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id       uuid        NOT NULL REFERENCES report_jobs (id),
  report_type  text        NOT NULL,
  slug         text        UNIQUE NOT NULL,
  title        text        NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  is_public    boolean     NOT NULL DEFAULT false
);

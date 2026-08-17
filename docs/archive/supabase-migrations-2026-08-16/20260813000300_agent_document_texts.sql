BEGIN;

CREATE TABLE IF NOT EXISTS agent_document_texts (
  id                BIGSERIAL PRIMARY KEY,
  agent_run_id      INTEGER REFERENCES agent_runs(id) ON DELETE SET NULL,
  crawl_result_id   BIGINT NOT NULL REFERENCES crawl_results(id) ON DELETE CASCADE,
  crawl_target_id   BIGINT NOT NULL REFERENCES crawl_targets(id) ON DELETE CASCADE,
  source_url        TEXT,
  document_type     TEXT,
  content_type      TEXT,
  source_hash       TEXT,
  status            TEXT NOT NULL DEFAULT 'completed',
  normalized_text   TEXT,
  text_hash         TEXT,
  char_count        INTEGER NOT NULL DEFAULT 0,
  error_message     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (crawl_result_id),
  CONSTRAINT agent_document_texts_status_check CHECK (status IN (
    'completed',
    'empty',
    'needs_ocr',
    'failed',
    'skipped'
  ))
);

CREATE INDEX IF NOT EXISTS agent_document_texts_target_idx
  ON agent_document_texts (crawl_target_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS agent_document_texts_status_idx
  ON agent_document_texts (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS agent_document_texts_run_idx
  ON agent_document_texts (agent_run_id);

ALTER TABLE agent_document_texts ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE agent_document_texts FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON SEQUENCE agent_document_texts_id_seq FROM anon, authenticated;

COMMENT ON TABLE agent_document_texts IS
  'Internal Rosetta text artifacts from fetched source documents. No public Data API access; server-side agent workers write and read this table.';

COMMIT;

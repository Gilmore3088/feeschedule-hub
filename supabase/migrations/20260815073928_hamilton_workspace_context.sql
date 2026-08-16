BEGIN;

CREATE TABLE IF NOT EXISTS hamilton_workspace_contexts (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  selected_institution_id INTEGER REFERENCES institution_sources(id) ON DELETE SET NULL,
  selected_source TEXT NOT NULL DEFAULT 'manual'
    CHECK (selected_source IN ('url', 'manual', 'profile', 'watchlist')),
  last_intent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hamilton_workspace_selected_institution
  ON hamilton_workspace_contexts(selected_institution_id);

ALTER TABLE hamilton_workspace_contexts ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE hamilton_workspace_contexts
  FROM anon, authenticated;

COMMIT;

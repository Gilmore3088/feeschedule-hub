-- Phase 27: External Intelligence System — external_intelligence table with full-text search
-- Stores admin-curated external research (CFPB surveys, ABA studies, industry reports,
-- regulatory guidance) for Hamilton to reference and cite.

CREATE TABLE IF NOT EXISTS external_intelligence (
    id              SERIAL PRIMARY KEY,
    source_name     TEXT NOT NULL,
    source_date     DATE NOT NULL,
    category        TEXT NOT NULL CHECK (category IN ('research', 'survey', 'regulation', 'news', 'analysis')),
    tags            TEXT[] NOT NULL DEFAULT '{}',
    content_text    TEXT NOT NULL,
    source_url      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by      TEXT,
    search_vector   TSVECTOR
);

-- GIN index on search_vector for full-text search performance
CREATE INDEX IF NOT EXISTS idx_ext_intel_search ON external_intelligence USING GIN (search_vector);

-- Index on category for filtered queries
CREATE INDEX IF NOT EXISTS idx_ext_intel_category ON external_intelligence (category);

-- Index on source_date for chronological listing
CREATE INDEX IF NOT EXISTS idx_ext_intel_source_date ON external_intelligence (source_date DESC);

-- Index on tags for array containment queries
CREATE INDEX IF NOT EXISTS idx_ext_intel_tags ON external_intelligence USING GIN (tags);

-- Trigger function: auto-update search_vector on INSERT or UPDATE
-- Weights: source_name (A) for higher relevance, content_text (B) for body search
CREATE OR REPLACE FUNCTION ext_intel_search_vector_update() RETURNS trigger AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('english', COALESCE(NEW.source_name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.content_text, '')), 'B');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger (idempotent via DROP IF EXISTS + CREATE)
DO $$
BEGIN
    DROP TRIGGER IF EXISTS trg_ext_intel_search_vector ON external_intelligence;
    CREATE TRIGGER trg_ext_intel_search_vector
        BEFORE INSERT OR UPDATE ON external_intelligence
        FOR EACH ROW
        EXECUTE FUNCTION ext_intel_search_vector_update();
END;
$$;

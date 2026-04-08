-- Migration 025: beige_book_themes table for LLM-extracted Beige Book themes
-- Stores pre-computed theme extraction results per district per edition.
-- Theme categories are fixed: growth, employment, prices, lending_conditions.

CREATE TABLE IF NOT EXISTS beige_book_themes (
    id              BIGSERIAL PRIMARY KEY,
    release_code    TEXT NOT NULL,
    fed_district    INT NOT NULL,
    theme_category  TEXT NOT NULL,  -- 'growth', 'employment', 'prices', 'lending_conditions'
    sentiment       TEXT NOT NULL,  -- 'positive', 'negative', 'neutral', 'mixed'
    summary         TEXT NOT NULL,  -- 1-2 sentence theme summary
    confidence      FLOAT NOT NULL DEFAULT 0.0,  -- 0.0-1.0 extraction confidence
    extracted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    model_used      TEXT NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
    UNIQUE(release_code, fed_district, theme_category)
);

CREATE INDEX IF NOT EXISTS idx_beige_themes_district ON beige_book_themes(fed_district, release_code);
CREATE INDEX IF NOT EXISTS idx_beige_themes_category ON beige_book_themes(theme_category);

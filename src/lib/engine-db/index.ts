/**
 * engine-db — typed read layer for the ops console, one concern per file.
 *
 * Replaces the 1,949-line admin-queries.ts monolith. Reads the ingestion
 * engine's own tables (jobs, engine_runs, documents, institution_hints,
 * state_run_notes, fees_verified, publish_batches) — not the legacy
 * crawl_runs / extracted_fees / agent_messages surfaces.
 *
 * Every function has a safe fallback so a DB hiccup renders an empty panel,
 * never a crashed page.
 */

export * from "./queues"; // fleet board + dead-letter (Magellan/Rosetta/Knox/Darwin)
export * from "./runs"; // engine_runs timeline + stuck-run freshness
export * from "./states"; // steward grid + per-state institutions
export * from "./publish"; // Atlas: publish batches + live index summary
export * from "./review"; // review queue + fee provenance (document snapshot)
export * from "./golden"; // golden-set regression status

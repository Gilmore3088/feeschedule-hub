# Phase 27: External Intelligence System - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.

**Date:** 2026-04-07
**Phase:** 27-external-intelligence-system
**Areas discussed:** All delegated to Claude's discretion

---

## Gray Area Selection

User selected "You decide on all" -- all implementation decisions delegated to Claude based on project patterns, requirements, and prior phase conventions.

## Claude's Discretion

All decisions (D-01 through D-12) made by Claude:
- Ingestion: text paste + URL fetch form, no file upload (deferred to v6.0)
- Storage: Postgres table with tsvector full-text search
- Hamilton: `searchIntelligence` tool with inline `[Source: name, date]` citations
- Architecture: intelligence.ts query file, server actions, Data Hub tab or separate page

## Deferred Ideas

- File upload with PDF/DOCX extraction
- Vector embeddings for semantic search
- Automated RSS/feed ingestion
- BLS data integration

# Phase 51: Analyze Live Data - Discussion Log

> **Audit trail only.**

**Date:** 2026-04-09
**Phase:** 51-analyze-live-data
**Areas discussed:** PDF export approach, Focus tab behavior

---

## PDF Export Approach

| Option | Description | Selected |
|--------|-------------|----------|
| Simple branded doc | BFI logo, text, timestamp | |
| Consulting-grade report | McKinsey-style with callout boxes | |
| Match current report PDF | Reuse existing @react-pdf/renderer template | ✓ |

**User's choice:** Match current report PDF

---

## Focus Tab Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| System prompt suffix | Tab adds context to Hamilton system prompt | |
| Query prefix | Tab prepends to user query | |
| You decide | Claude picks best approach | ✓ |

**User's choice:** Claude's discretion

## Deferred Ideas

- Client brand upload for white-labeled exports
- Data browsing UX within Analyze

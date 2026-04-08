---
created: 2026-04-08T15:00:00.000Z
title: One-click PDF export from Hamilton chat
area: ui
files:
  - src/app/admin/hamilton/chat/
---

## Problem

User manually exported Hamilton's Kansas analysis by printing the browser page. Need a proper "Export as Report" button that wraps Hamilton's response in the branded Bank Fee Index template and exports as PDF. This is the core product flow: chat → consulting report → PDF in one click.

## Solution

1. Add "Export as Report" button on Hamilton chat responses
2. Button wraps the response in the branded report template (header, footer, Bank Fee Index logo, CONFIDENTIAL)
3. Generate PDF via browser print or @react-pdf/renderer
4. Include response metadata (date, query, data sources used)
5. Bronze bar: Kansas report quality. Clean formatting, proper tables, branded header/footer.

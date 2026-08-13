---
created: 2026-04-08T15:00:00.000Z
title: Rich chat visualizations in Hamilton responses
area: ui
files:
  - src/app/admin/hamilton/chat/
  - src/components/
---

## Problem

Hamilton produces consulting-grade text analysis but the chat UI renders everything as plain markdown. Tables render as text, no charts, no stat cards. The Kansas report showed that rich output (tables, charts) is the bronze bar for the product. Users should be able to copy Hamilton's chat output directly into a presentation.

## Solution

1. Add chart rendering to Hamilton's chat stream (Recharts components for bar/line charts)
2. Add stat card rendering for key metrics inline in responses
3. Add formatted table rendering (styled, not plain markdown tables)
4. Hamilton's responses should include structured data blocks that the UI renders as visualizations
5. Keep it proportional — visualizations where analysis warrants it, not on every response

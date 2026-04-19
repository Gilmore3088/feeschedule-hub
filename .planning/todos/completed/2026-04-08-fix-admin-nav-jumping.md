---
created: 2026-04-08T15:00:00.000Z
title: Fix admin nav jumping between route shells
area: ui
files:
  - src/app/admin/layout.tsx
  - src/app/(public)/layout.tsx
  - src/app/pro/layout.tsx
---

## Problem

When logged in as admin and clicking links that cross route groups (admin → public → pro), the navigation shell swaps entirely — different nav, different header, different feel. The admin should always see the admin nav regardless of which route they're viewing.

## Solution

1. Detect admin role in the public and pro layouts
2. If user is admin, render AdminNav instead of ConsumerNav/ProNav
3. Keep the content from the route group but use the admin shell
4. Alternative: add a small "Back to Admin" badge/link when admin is on non-admin routes

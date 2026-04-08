---
title: Scoped report generation for pro users
trigger_condition: When Hamilton agent capabilities are expanded beyond chat-only
planted_date: 2026-04-07
---

# Scoped Report Generation for Pro Users

## Idea
Pro users should be able to generate short (3-5 page) reports through Hamilton, not just chat. Report types:
- Annual fee summary for their institution
- Custom peer set competitive brief
- District/state fee landscape snapshot
- Fee-to-revenue analysis for their asset tier

## Constraints
- Must NOT allow generation of flagship national reports (Bank Fee Index IP)
- Reports should be scoped to the user's institution, peer set, or region
- Output: downloadable HTML/PDF, professional formatting
- Daily/monthly generation limits to control API costs

## Why This Matters
Hamilton's positioning is "replacement for the $15K consulting engagement." Chat is good, but executives want deliverables they can share with their board. A generated peer brief they can hand to their CEO is the difference between "useful tool" and "indispensable subscription."

## Implementation Notes
- Pro currently only has access to fee-analyst agent (1 of 4 admin agents)
- Report engine exists (`src/lib/report-engine/`) but is admin-only
- Could expose a constrained version of report templates to pro users
- Content-writer agent in admin could be adapted with guardrails for pro use

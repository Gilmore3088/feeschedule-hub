---
title: Design B2B launchpad dashboard
date: 2026-04-07
priority: high
---

# Design B2B Launchpad Dashboard

Redesign the pro dashboard (`/pro/`) from a generic greeting page into a personalized launchpad with four clear value doors.

## Requirements
- Four primary pathways prominently displayed:
  1. **Hamilton** -- on-demand AI consulting (chat + scoped report generation)
  2. **Peer Builder** -- custom competitive benchmarking sets
  3. **Reports & Studies** -- pre-built consulting-grade content catalog
  4. **Federal Data** -- Call Reports, Beige Book, FRED, complaints
- Personalized to logged-in institution:
  - Their Call Reports data surfaced
  - Their Fed District Beige Book highlighted
  - Their competitive landscape (peer median vs national delta)
- Recent reports/articles news section
- Clean, not overwhelming -- launchpad not dashboard
- Quick actions accessible but secondary to the four doors

## Current State
- `/pro/` shows: greeting, quick actions, research usage stats, state comparison
- Account captures: institution name, type, tier, state, job role
- Profile data exists but doesn't meaningfully personalize the experience
- 9 pro pages exist but feel disconnected

## Depends On
- Expanded Hamilton capabilities (scoped report generation for pro users)
- Account profile completeness (institution mapping to Call Reports, district)

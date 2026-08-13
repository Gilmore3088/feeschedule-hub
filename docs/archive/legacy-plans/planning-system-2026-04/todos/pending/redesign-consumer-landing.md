---
title: Audit and redesign consumer landing page
date: 2026-04-07
priority: high
---

# Audit and Redesign Consumer Landing Page

Replace the current split-panel gateway (`/` with GatewayClient) with a value-prop-first consumer experience.

## Requirements
- Landing page leads with clear value props (Fee Scout lookup, consumer guides, fee benchmarks)
- Fee Scout institution search should be prominent and accessible within seconds
- No forced self-selection (consumer vs professional) before seeing value
- Warm editorial design (Newsreader serif, terracotta accents, consumer-brand palette)
- Clear pathways: look up your bank, browse fees, read guides, explore research
- Pro/subscribe CTA present but not dominant -- consumer value comes first

## Current State
- `/` renders GatewayClient split-panel (Consumer vs Professional chooser)
- `/consumer` is the actual consumer home with benchmarks, guides, research highlights
- 26 public pages exist but no clear hierarchy or funnel
- Fee Scout exists as standalone prototype, needs integration

## Depends On
- Clarity on Fee Scout's role (institution lookup tool within consumer experience)
- Consumer guide content pipeline

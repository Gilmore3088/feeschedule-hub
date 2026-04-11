# Hamilton Revamp Package

This package turns the design work into an implementation-ready revamp plan for Hamilton.

## What's inside

- `01-product-architecture.md` — product model, workflow, and screen ownership
- `02-navigation-and-information-architecture.md` — top nav, left rail, tabs, and naming
- `03-screen-specs.md` — detailed screen-by-screen product behavior
- `04-current-to-target-file-map.md` — what to change in the current Hamilton files and what new files to add
- `05-data-model-and-persistence.md` — new DB tables and persistence model
- `06-api-and-agent-contracts.md` — API shapes and agent behavior by screen
- `07-ui-component-map.md` — suggested component structure for the frontend
- `08-implementation-backlog.md` — phased build plan
- `09-copy-and-ux-rules.md` — copy system, CTA rules, screen boundaries
- `10-demo-flow-and-pricing-notes.md` — demo path and pricing framing
- `proposed-file-tree.txt` — suggested repo structure
- `stub/` — starter JSON and TS interfaces for the revamp

## Core product loop

Monitor -> Home -> Analyze -> Simulate -> Report

## Golden rule

Each screen must own a different job:
- Home = orientation
- Analyze = understanding
- Simulate = decision
- Report = communication
- Monitor = retention

# 08. Implementation Backlog

## Phase 1 — Architecture cleanup
- [ ] Lock nav to Home / Analyze / Simulate / Reports / Monitor / Admin
- [ ] Remove Markets and Peers from top nav
- [ ] Create navigation source file
- [ ] Add mode enums and screen ownership rules

## Phase 2 — Screen separation
- [ ] Strip recommendation language from Analyze
- [ ] Make Simulate the sole owner of tradeoffs + recommendation
- [ ] Make Report read-only and export-first
- [ ] Simplify Monitor to priority alert + signal feed + watchlists

## Phase 3 — Backend types and persistence
- [ ] Extend types.ts with screen DTOs
- [ ] Add scenario tables
- [ ] Add saved analyses table
- [ ] Add reports table
- [ ] Add watchlists/signals tables

## Phase 4 — Agent behavior
- [ ] Split system prompt instructions by mode
- [ ] Add analyze response builder
- [ ] Add simulation response builder
- [ ] Add report summary builder
- [ ] Add monitor summary builder

## Phase 5 — Frontend
- [ ] Build shared shell
- [ ] Build Home
- [ ] Build Analyze
- [ ] Build Simulate
- [ ] Build Report
- [ ] Build Monitor

## Phase 6 — Polish
- [ ] Export UX
- [ ] Scenario archive
- [ ] Saved analyses UX
- [ ] Watchlist editing
- [ ] Demo seed data

## Phase 7 — Go-to-market
- [ ] Create demo flow
- [ ] Create pricing page
- [ ] Create PDF export examples
- [ ] Get 3 buyer conversations

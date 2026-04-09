# 04. Current to Target File Map

This section maps the current Hamilton code to the revamp.

## Existing core files to keep and update

### `src/lib/hamilton/voice.ts`
Keep.
Update to support screen-specific behavior:
- add interaction mode enum
- add screen-level writing boundaries
- separate report voice from UI insight voice
- preserve no-hallucination and implication-first rules

### `src/lib/hamilton/generate.ts`
Keep.
Add:
- generate UI insight block
- generate simulation interpretation
- generate report summary block
- thinner output modes than full report sections

### `src/lib/hamilton/validate.ts`
Keep.
Expand:
- validate scenario outputs
- validate monitor insight snippets
- validate executive summary copy if numbers appear

### `src/lib/hamilton/types.ts`
Keep.
Expand:
- screen-specific DTOs
- analyze response type
- simulation response type
- monitor alert type
- report summary type
- watchlist/signal types

### `src/lib/research/agents.ts` or `src/lib/hamilton/hamilton-agent.ts`
Keep.
Refactor:
- screen-aware system prompt assembly
- add intent handlers for analyze/simulate/report/monitor
- de-emphasize one-size-fits-all prompt behavior
- remove assumptions that every complex answer should be a mini-report

### `src/lib/hamilton/chat-memory.ts`
Keep.
Extend:
- save analyses
- save scenarios
- save insights
- pin conversations
- support monitor events

## New backend files to add

### `src/lib/hamilton/modes.ts`
Defines:
- Analyze
- Simulate
- Report
- Monitor
- Home

### `src/lib/hamilton/simulation.ts`
Scenario engine contract:
- current state
- proposed state
- deltas
- interpreted tradeoffs
- recommendation object

### `src/lib/hamilton/monitor.ts`
Builds:
- status strip
- priority alerts
- signal feed
- watchlist summaries

### `src/lib/hamilton/insights.ts`
Creates reusable insight blocks for Home and Analyze.

### `src/lib/hamilton/report-summary.ts`
Generates the executive summary artifact for Screen 4.

### `src/lib/hamilton/navigation.ts`
Single source of truth for product navigation and screen labels.

## Suggested frontend files to add

### `src/app/(hamilton)/home/page.tsx`
Executive Briefing

### `src/app/(hamilton)/analyze/page.tsx`
Analyze workspace

### `src/app/(hamilton)/simulate/page.tsx`
Scenario workspace

### `src/app/(hamilton)/reports/page.tsx`
Report output / archive

### `src/app/(hamilton)/monitor/page.tsx`
Continuous intelligence

## New UI component areas

- `src/components/hamilton/layout/`
- `src/components/hamilton/home/`
- `src/components/hamilton/analyze/`
- `src/components/hamilton/simulate/`
- `src/components/hamilton/reports/`
- `src/components/hamilton/monitor/`

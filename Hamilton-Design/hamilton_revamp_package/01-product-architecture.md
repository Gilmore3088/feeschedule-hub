# 01. Product Architecture

## Positioning

Hamilton is not a generic chatbot and not a raw dashboard. It is a decision system for fee pricing, peer positioning, and regulatory-risk evaluation.

## Core user journey

1. **Monitor**
   - Something changed.
   - Hamilton surfaces what matters without being asked.

2. **Home**
   - The user sees the current situation.
   - Hamilton gives one clear point of view, priority level, and recommended next step.

3. **Analyze**
   - The user explores what is happening and why.
   - This screen is for understanding, not deciding.

4. **Simulate**
   - The user tests a pricing move.
   - This screen owns tradeoffs and recommendation.

5. **Report**
   - The user communicates the recommendation.
   - This screen is read-only and export-first.

## Non-negotiable boundaries

### Analyze
Allowed:
- verdict
- evidence
- context
- deeper questions

Not allowed:
- final recommendation
- board-ready language
- final action framing

### Simulate
Allowed:
- before/after
- tradeoffs
- recommendation
- scenario export

Not allowed:
- broad exploration
- unrelated feed content
- long report copy

### Report
Allowed:
- executive summary
- recommendation
- implementation notes
- export/share actions

Not allowed:
- sliders
- inputs
- exploratory prompts

## Product principle

Do not let multiple screens perform the same mental job.

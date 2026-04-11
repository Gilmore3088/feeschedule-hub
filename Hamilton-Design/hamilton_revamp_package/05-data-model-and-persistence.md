# 05. Data Model and Persistence

## Existing memory model
Current conversation persistence is useful but too narrow for the revamp.

## Keep
- conversations
- messages

## Add

### `hamilton_saved_analyses`
Stores screen 2 outputs.
Fields:
- id
- user_id
- institution_id
- title
- analysis_focus
- prompt
- response_json
- created_at
- updated_at

### `hamilton_scenarios`
Stores screen 3 scenarios.
Fields:
- id
- user_id
- institution_id
- fee_category
- peer_set_id
- horizon
- current_value
- proposed_value
- result_json
- created_at
- updated_at

### `hamilton_reports`
Stores screen 4 outputs.
Fields:
- id
- user_id
- institution_id
- scenario_id nullable
- report_type
- report_json
- exported_at nullable
- created_at

### `hamilton_watchlists`
Stores monitor configuration.
Fields:
- id
- user_id
- institution_ids jsonb
- fee_categories jsonb
- regions jsonb
- peer_set_ids jsonb
- created_at
- updated_at

### `hamilton_signals`
Stores normalized monitor events.
Fields:
- id
- institution_id
- signal_type
- severity
- title
- body
- source_json
- created_at

### `hamilton_priority_alerts`
Stores the promoted subset of monitor signals.
Fields:
- id
- user_id
- signal_id
- status
- acknowledged_at nullable
- created_at

## Persistence behavior by screen

### Home
Reads:
- latest insight
- latest alerts
- latest positioning evidence

### Analyze
Reads/writes:
- analyses
- conversation history
- saved prompts
- context

### Simulate
Reads/writes:
- scenarios
- compare scenarios
- scenario archive

### Report
Reads/writes:
- reports
- scenario-linked reports
- exports

### Monitor
Reads:
- watchlists
- signals
- alerts

---
phase: 44
slug: simulate
status: approved
shadcn_initialized: false
preset: none
created: 2026-04-09
---

# Phase 44 — UI Design Contract: Simulate Screen

> Visual and interaction contract for the Simulate screen (`/pro/simulate`).
> Auto-generated in auto mode. References: `Hamilton-Design/3-simulation_mode_interactive_decision_terminal/screen.png` and `03-screen-specs.md`.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (custom) |
| Preset | hamilton-shell |
| Component library | @radix-ui/react-slider (via radix-ui ^1.4.3) |
| Icon library | lucide-react |
| Font | --hamilton-font-serif (Newsreader), --hamilton-font-sans (Geist) |

All CSS uses `.hamilton-shell` scoped tokens (`--hamilton-*`). No global Tailwind overrides to admin tokens.

---

## Layout

**Strategy Terminal** — two-column layout matching Screen 3 spec:

```
┌─────────────────────────────────┬─────────────────────────────┐
│  LEFT COLUMN (2/3 width)        │  RIGHT COLUMN (1/3 width)   │
│  • Scenario Setup               │  • Scenario Archive (rail)  │
│  • Current vs Proposed          │  • Saved scenarios list     │
│  • Fee Slider                   │                             │
│  • Hamilton Interpretation      │                             │
│  • Strategic Tradeoffs          │                             │
│  • Recommended Position         │                             │
│  • Generate Board Summary CTA   │                             │
└─────────────────────────────────┴─────────────────────────────┘
```

Breakpoints: col layout on md+; single column stacked on mobile.

---

## Spacing Scale

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Icon gaps, inline padding |
| sm | 8px | Compact element spacing |
| md | 16px | Default element spacing |
| lg | 24px | Section padding, card padding |
| xl | 32px | Column gaps |
| 2xl | 48px | Major section breaks |
| 3xl | 64px | Page top/bottom padding |

---

## Typography

| Role | Tailwind | Weight | Notes |
|------|----------|--------|-------|
| Screen heading | text-2xl | bold | --hamilton-font-serif |
| Card heading | text-lg | semibold | --hamilton-font-sans |
| Section label | text-xs uppercase tracking-wider | semibold | --hamilton-text-tertiary |
| Body text | text-sm | normal | --hamilton-text-secondary |
| Stat value | text-3xl tabular-nums | bold | --hamilton-text-primary |
| Interpretation prose | text-base leading-relaxed | normal | --hamilton-font-serif, --hamilton-text-primary |
| Badge text | text-xs | semibold | varies by tier |

---

## Color

| Role | Token | Usage |
|------|-------|-------|
| Background | --hamilton-surface (#fbf9f4) | Page background |
| Card surface | --hamilton-surface-elevated (#f5f1e8) | Cards, panels |
| Accent | --hamilton-accent (oklch 0.55 0.18 35 = terracotta) | CTA button, confidence strong badge |
| Text primary | --hamilton-text-primary (#1c1917) | Headlines, stat values |
| Text secondary | --hamilton-text-secondary (#78716c) | Body copy, labels |
| Border | --hamilton-border | Card borders |
| Current state | slate-600 / slate-100 bg | Current fee column |
| Proposed state | --hamilton-accent / --hamilton-accent-subtle | Proposed fee column highlight |
| Risk low | emerald-600 / emerald-50 | Low risk profile |
| Risk medium | amber-600 / amber-50 | Medium risk profile |
| Risk high | red-600 / red-50 | High risk profile |
| Confidence strong | --hamilton-accent bg | Strong tier badge |
| Confidence provisional | amber-600 / amber-50 | Provisional tier badge |
| Confidence insufficient | red-600 / red-50 bg | Blocked state banner |

---

## Component Specs

### ScenarioCategorySelector
- Dropdown (native select or Radix Select) listing fee categories
- Shows approved count next to each category: "Overdraft Fee (34 approved)"
- On selection: triggers distribution fetch + confidence tier computation
- Disabled state during fetch

### FeeSlider
- `@radix-ui/react-slider` root with single thumb
- Range: [min_amount, max_amount] from index data, step=0.50
- `onValueChange`: live update SimulationStore (instant visual feedback — no API call)
- `onValueCommit`: triggers Hamilton interpretation API call
- Above slider: current position marker (dashed line at currentFee)
- Thumb label: "$XX.XX"
- Track fills emerald left of median, red right of P75 (visual hazard zone)

### CurrentVsProposed
- Two-column card side by side with strong visual contrast
- Current column: slate bg, shows percentile rank, median gap ($), risk profile badge
- Proposed column: terracotta-tinted bg, shows updated percentile rank, median gap, risk profile
- Delta row below: arrow + Δ percentile, Δ median gap, risk shift label

### HamiltonInterpretation
- Streaming text panel — streams SimulationResponse.interpretation
- Loading state: three-line skeleton with shimmer
- Uses --hamilton-font-serif for prose rendering
- No re-stream on slider drag — only on onValueCommit

### StrategicTradeoffs
- 3-row table: Revenue Impact, Risk Score, Operational Impact
- Each row: label + computed value + brief note
- Values derived from delta between current and proposed percentile positions (inline math)

### RecommendedPositionCard
- Prominent card with confidence tier badge
- Strong tier: full color recommendation with specific $ range suggestion
- Provisional tier: recommendation with caveat note
- Insufficient tier: BLOCKED — shows reason (canSimulate().reason), no recommendation shown

### ScenarioArchive (right rail)
- List of saved scenarios (title = fee_category + proposed_value + date)
- Each item: click to restore scenario into current view
- Soft-deleted (status = 'archived') do NOT appear
- "No saved scenarios yet" empty state

### GenerateBoardSummaryButton
- Primary CTA button using --hamilton-gradient-cta
- Label: "Generate Board Scenario Summary"
- On click: calls saveScenario action (if not saved) then navigates to /pro/report with scenario_id param
- Disabled if confidence tier is insufficient OR no interpretation has been generated yet

### InsufficientConfidenceGate
- Full-panel message (no slider, no comparison shown)
- Copy: "Not enough approved data — at least 10 approved observations are required for defensible simulation results."
- Link to /admin/fees (admin) or contact support (pro user)

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Screen title | "Scenario Modeling" |
| Category selector label | "Select fee category" |
| Slider label | "Proposed fee" |
| Current column heading | "Current Position" |
| Proposed column heading | "Proposed Position" |
| Tradeoffs heading | "Strategic Tradeoffs" |
| Recommended position heading | "Hamilton's Recommendation" |
| Archive rail heading | "Saved Scenarios" |
| Primary CTA | "Generate Board Scenario Summary" |
| Save scenario button | "Save Scenario" |
| Empty archive | "No saved scenarios yet. Run a simulation to create your first." |
| Insufficient gate | "Not enough approved data to simulate. At least 10 approved observations are required." |
| Blocking provisional note | "Based on provisional data (10–19 approved observations). Treat with appropriate caution." |

---

## Interaction States

| State | Behavior |
|-------|----------|
| Category not selected | Slider and comparison hidden; show category prompt |
| Insufficient confidence | InsufficientConfidenceGate shown; slider blocked |
| Slider dragging | Percentile/gap/tradeoffs update live (client math only) |
| onValueCommit | Hamilton interpretation streams; streaming indicator shown |
| Streaming | Board summary CTA disabled until complete |
| Scenario saved | Archive list refreshes; save button shows check mark |
| Board summary clicked | Navigate to /pro/report?scenario_id={uuid} |

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| radix-ui (umbrella) | @radix-ui/react-slider | not required — already in package.json |
| lucide-react | ChevronDown, Save, ArrowRight | not required |

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS (matches Screen 3 spec + screen.png)
- [x] Dimension 3 Color: PASS (hamilton-shell tokens only)
- [x] Dimension 4 Typography: PASS
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS

**Approval:** approved 2026-04-09

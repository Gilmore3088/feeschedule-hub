/**
 * Compile-time contract tests for thesis types (Phase 33).
 * These tests use the `satisfies` operator to validate object literal shapes
 * against each interface — they are TypeScript type assertions, not runtime tests.
 */

import type {
  ThesisScope,
  ThesisTension,
  ThesisOutput,
  ThesisInput,
  ThesisSummaryPayload,
} from "./types";

// ─── ThesisScope ──────────────────────────────────────────────────────────────

const _scope1: ThesisScope = "quarterly";
const _scope2: ThesisScope = "monthly_pulse";
const _scope3: ThesisScope = "peer_brief";
const _scope4: ThesisScope = "state_index";

// ─── ThesisTension ────────────────────────────────────────────────────────────

const _tension = {
  force_a: "Bank fee pricing converges nationally",
  force_b: "Service charge revenue continues to decline",
  implication: "Price uniformity no longer protects revenue — volume and mix must compensate",
} satisfies ThesisTension;

// ─── ThesisOutput ─────────────────────────────────────────────────────────────

const _outputFull = {
  core_thesis: "Banks have commoditized fee pricing while revenue diverges — the margin war has moved to mix.",
  tensions: [_tension],
  revenue_model: "NSF revenue declined 3.6% YoY despite stable pricing, signaling volume erosion.",
  competitive_dynamic: "Credit unions price 18% below banks on overdraft, capturing cost-sensitive segments.",
  contrarian_insight: "The highest-fee institutions are not the most profitable — fee complexity costs outweigh yield.",
  narrative_summary: "Fee pricing has converged to near-commodity levels across the industry, yet service charge revenue continues to decline — a structural tension between pricing stability and revenue trajectory that demands executive attention. Banks must look beyond fee amounts to fee mix, waiver rates, and product bundling to defend income. The data points to a bifurcation: institutions that compete on price alone face accelerating revenue compression, while those repositioning fees as a service quality signal maintain income stability.",
  model: "claude-opus-4-5",
  usage: { inputTokens: 1200, outputTokens: 340 },
} satisfies ThesisOutput;

const _outputLighter = {
  core_thesis: "Overdraft fee convergence masks widening bank-CU revenue gap.",
  tensions: [_tension],
  revenue_model: "Total service charges: $1.2B, down 4.1% YoY.",
  competitive_dynamic: "Credit unions now price 22% below banks on monthly maintenance.",
  contrarian_insight: null,
  narrative_summary: "A short summary for lighter scope.",
  model: "claude-haiku-4-5",
  usage: { inputTokens: 600, outputTokens: 180 },
} satisfies ThesisOutput;

// ─── ThesisSummaryPayload ─────────────────────────────────────────────────────

const _payload = {
  quarter: "Q1 2026",
  total_institutions: 4120,
  top_categories: [
    {
      fee_category: "overdraft",
      display_name: "Overdraft Fee",
      median_amount: 30.0,
      bank_median: 32.0,
      cu_median: 27.0,
      institution_count: 3800,
      maturity_tier: "strong",
    },
  ],
  revenue_snapshot: {
    latest_quarter: "2025-Q4",
    total_service_charges: 1_200_000_000,
    yoy_change_pct: -3.6,
    bank_service_charges: 900_000_000,
    cu_service_charges: 300_000_000,
    total_institutions: 3200,
  },
  fred_snapshot: {
    fed_funds_rate: 4.25,
    unemployment_rate: 4.1,
    cpi_yoy_pct: 2.8,
    consumer_sentiment: 68.4,
    as_of: "2026-03-01",
  },
  beige_book_themes: [
    "Consumer spending softened in the Eighth District.",
    "Loan demand declined moderately across the Second District.",
  ],
  derived_tensions: [
    "Bank fees exceed CU fees in 18 of 22 comparable categories",
    "NSF pricing stable while NSF revenue fell 3.6% YoY — volume erosion not pricing",
  ],
} satisfies ThesisSummaryPayload;

const _payloadNullable = {
  quarter: "2026-03",
  total_institutions: 2100,
  top_categories: [],
  revenue_snapshot: null,
  fred_snapshot: null,
  beige_book_themes: [],
  derived_tensions: [],
} satisfies ThesisSummaryPayload;

// ─── ThesisInput ─────────────────────────────────────────────────────────────

const _input = {
  scope: "quarterly" as ThesisScope,
  data: _payload,
} satisfies ThesisInput;

const _inputLighter = {
  scope: "monthly_pulse" as ThesisScope,
  data: _payloadNullable,
} satisfies ThesisInput;

// Suppress unused variable warnings
void _scope1;
void _scope2;
void _scope3;
void _scope4;
void _outputFull;
void _outputLighter;
void _input;
void _inputLighter;

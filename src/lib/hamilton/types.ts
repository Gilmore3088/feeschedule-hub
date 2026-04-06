/**
 * Hamilton AI Analyst — Type Definitions
 * All report sections are generated through this typed contract.
 */

export type SectionType =
  | "overview"
  | "findings"
  | "trend_analysis"
  | "peer_comparison"
  | "peer_competitive"
  | "regional_analysis"
  | "recommendation"
  | "executive_summary"
  | "national_index"
  | "charter_analysis"
  | "district_context"
  | "methodology_note";

export interface SectionInput {
  type: SectionType;
  /** Section title — must state the conclusion, not the topic */
  title: string;
  /** Structured source data. Hamilton may only reference figures present here. */
  data: Record<string, unknown>;
  /** Optional context for framing (report type, geography, time period) */
  context?: string;
}

export interface SectionOutput {
  /** Hamilton narrative — validated against source data before use */
  narrative: string;
  wordCount: number;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface ValidationResult {
  passed: boolean;
  /** Numbers found in narrative that have no match in source data */
  inventedNumbers: string[];
  /** Total numeric tokens checked */
  checkedCount: number;
  /** All numeric values extracted from source data */
  sourceValues: number[];
}

export interface ValidatedSection extends SectionOutput {
  validation: ValidationResult;
  input: SectionInput;
}

// ─── Report Data Types ─────────────────────────────────────────────────────────

/**
 * Input data shape for peer competitive benchmarking reports.
 * All fields are pipeline-verified before passing to Hamilton.
 */
export interface PeerCompetitiveData {
  title: string;
  subtitle: string;
  report_date: string;
  peer_definition: {
    charter_type?: string;
    asset_tiers?: string[];
    fed_districts?: number[];
    state?: string;
  };
  categories: Array<{
    fee_category: string;
    display_name: string;
    peer_median: number | null;
    national_median: number | null;
    p25_amount: number | null;
    p75_amount: number | null;
    delta_pct: number | null;
    peer_count: number;
    is_featured: boolean;
  }>;
  total_peer_institutions: number;
  total_observations: number;
}

/**
 * Input data shape for national fee index overview reports.
 * All fields are pipeline-verified before passing to Hamilton.
 */
export interface NationalOverviewData {
  report_date: string;
  total_institutions: number;
  categories: Array<{
    fee_category: string;
    display_name: string;
    median_amount: number | null;
    p25_amount: number | null;
    p75_amount: number | null;
    institution_count: number;
    observation_count: number;
    maturity: "strong" | "provisional" | "insufficient";
  }>;
  charter_split?: { banks: number; credit_unions: number };
}

/**
 * Alias for SectionOutput — used by template functions to reference
 * pre-generated Hamilton narrative outputs.
 */
export type GenerateSectionOutput = SectionOutput & { section_type: SectionType; generated_at: string };

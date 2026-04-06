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

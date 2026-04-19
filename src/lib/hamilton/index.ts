/**
 * Hamilton AI Analyst — Public API
 *
 * Core exports for the Hamilton report generation system.
 */

export { HAMILTON_VOICE, HAMILTON_VERSION, HAMILTON_RULES, HAMILTON_FORBIDDEN, HAMILTON_SYSTEM_PROMPT } from "./voice";
export { generateSection, generateGlobalThesis, generateGatedSection } from "./generate";
export type { GatedSectionOutput } from "./generate";
export { validateNumerics, validateSection } from "./validate";
export {
  evaluateCitationDensity,
  countClaims,
  countCitations,
  splitIntoSentences,
  isClaim,
  isCitation,
  CITATION_GATE_DEFAULTS,
} from "./citation-gate";
export type {
  CitationGateOptions,
  CitationGateResult,
  CitationGateMetrics,
} from "./citation-gate";
export type {
  SectionType,
  SectionInput,
  SectionOutput,
  ValidationResult,
  ValidatedSection,
  ThesisScope,
  ThesisTension,
  ThesisOutput,
  ThesisInput,
  ThesisSummaryPayload,
} from "./types";

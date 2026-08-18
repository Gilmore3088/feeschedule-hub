/**
 * Guards against persisting an empty Hamilton analysis. A stream can
 * complete successfully (no thrown error) while still carrying no usable
 * content — e.g. when the underlying request was blocked server-side but
 * surfaced as an empty completion rather than an error. Pure so it's
 * trivially testable independent of useChat/React state.
 */

export interface ParsedAnalysisContent {
  hamiltonView: string;
  whyItMatters: unknown[];
}

export function isEmptyAnalysis(parsed: ParsedAnalysisContent): boolean {
  return !parsed.hamiltonView.trim() && parsed.whyItMatters.length === 0;
}

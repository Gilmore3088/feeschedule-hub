/**
 * Report Engine — Public API
 * Re-exports all types and utilities for downstream consumers.
 * Phase 13-01: initial export surface (types + freshness gate).
 */

export type {
  ReportType,
  ReportJobStatus,
  DataManifest,
  ReportJob,
  PublishedReport,
} from './types';

export { checkFreshness } from './freshness';
export type { FreshnessResult } from './freshness';

export { runEditorReview } from './editor';
export type { EditorReviewResult, FlaggedSection } from './editor';

export { generatePresignedUrl } from './presign';

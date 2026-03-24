export interface InstitutionSummary {
  id: number;
  institution_name: string;
  state_code: string | null;
  charter_type: string;
  asset_size: number | null;
  website_url: string | null;
  fee_schedule_url: string | null;
  document_type: string | null;
  fee_count: number;
}

export interface ExtractedFee {
  id: number;
  fee_name: string;
  amount: number | null;
  frequency: string | null;
  conditions: string | null;
  extraction_confidence: number;
  review_status: string;
  validation_flags: unknown;
  institution_name: string;
  crawl_target_id: number;
}

export interface ReviewableFee extends ExtractedFee {
  state_code: string | null;
  charter_type: string;
  fee_category: string | null;
  document_url: string | null;
  fee_schedule_url: string | null;
}

export interface FeeReview {
  id: number;
  fee_id: number;
  action: string;
  username: string | null;
  previous_status: string | null;
  new_status: string | null;
  previous_values: unknown;
  new_values: unknown;
  notes: string | null;
  created_at: string | Date;
}

export interface ReviewStats {
  pending: number;
  staged: number;
  flagged: number;
  approved: number;
  rejected: number;
}

export interface InstitutionDetail {
  id: number;
  institution_name: string;
  state_code: string | null;
  charter_type: string;
  asset_size: number | null;
  asset_size_tier: string | null;
  fed_district: number | null;
  city: string | null;
  website_url: string | null;
  fee_schedule_url: string | null;
  fee_count: number;
}

export interface CrawlStats {
  total_institutions: number;
  banks: number;
  credit_unions: number;
  with_website: number;
  with_fee_url: number;
  total_fees: number;
  crawl_runs: number;
}

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
  validation_flags: string | null;
  institution_name: string;
  crawl_target_id: number;
}

export interface ReviewableFee extends ExtractedFee {
  state_code: string | null;
  charter_type: string;
  fee_category: string | null;
}

export interface FeeReview {
  id: number;
  fee_id: number;
  action: string;
  username: string | null;
  previous_status: string | null;
  new_status: string | null;
  previous_values: string | null;
  new_values: string | null;
  notes: string | null;
  created_at: string;
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

export type ArticleStatus = "draft" | "review" | "approved" | "published" | "rejected";
export type ArticleType = "national_benchmark" | "district_comparison" | "charter_comparison" | "top_10" | "quarterly_trend";

export interface Article {
  id: number;
  slug: string;
  title: string;
  article_type: ArticleType;
  fee_category: string | null;
  fed_district: number | null;
  status: ArticleStatus;
  review_tier: number;
  content_md: string;
  data_context: string;
  summary: string | null;
  model_id: string | null;
  prompt_hash: string | null;
  generated_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ArticleSummary {
  id: number;
  slug: string;
  title: string;
  article_type: ArticleType;
  fee_category: string | null;
  fed_district: number | null;
  status: ArticleStatus;
  review_tier: number;
  summary: string | null;
  generated_at: string;
  published_at: string | null;
}

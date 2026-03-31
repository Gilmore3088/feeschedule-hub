export type AgentId = "scout" | "classifier" | "extractor" | "analyst";
export type AgentStatus = "idle" | "running" | "ok" | "warn" | "error";

export interface SSEEvent {
  type: "log" | "agent" | "report" | "done" | "error";
  agentId?: AgentId;
  status?: AgentStatus;
  durationMs?: number;
  msg?: string;
  report?: FeeReport;
  success?: boolean;
}

export interface MappedFee {
  category: string;
  name: string;
  amount: string;
  conditions: string;
  waivable: boolean;
  waiver: string;
  review_status?: string | null;
  confidence?: number | null;
}

export interface FeeReport {
  institution: string;
  institution_meta: {
    asset_size_tier: string | null;
    charter_type: string | null;
    state: string | null;
    fed_district: number | null;
    cbsa_name: string | null;
    last_crawl_at: string | null;
  };
  data_quality: "excellent" | "good" | "partial" | "limited";
  source_summary: {
    url: string | null;
    type: string;
    access: string;
    as_of: string;
  };
  consumer_score: {
    score: number;
    label: string;
    rationale: string;
  };
  peer_context: string;
  highlights: string[];
  warnings: string[];
  fee_categories: Record<string, MappedFee[]>;
  tips: string[];
  verdict: string;
}

export interface InstitutionRow {
  id: number;
  institution_name: string;
  website_url: string | null;
  fee_schedule_url: string | null;
  charter_type: string | null;
  state: string | null;
  state_code: string | null;
  city: string | null;
  asset_size: number | null;
  asset_size_tier: string | null;
  cert_number: string | null;
  status: string | null;
  document_type: string | null;
  last_crawl_at: string | null;
  last_success_at: string | null;
  consecutive_failures: number;
  fed_district: number | null;
  cbsa_name: string | null;
}

export interface ExtractedFeeRow {
  id: number;
  crawl_target_id: number;
  fee_name: string;
  fee_category: string | null;
  amount: number | null;
  frequency: string | null;
  conditions: string | null;
  extraction_confidence: number | null;
  review_status: string | null;
  fee_family: string | null;
  source: string | null;
}

export interface CrawlResultRow {
  id: number;
  crawl_target_id: number;
  status: string;
  document_url: string | null;
  document_path: string | null;
  fees_extracted: number;
  error_message: string | null;
  crawled_at: string | null;
}

export interface ScoutResult {
  found: boolean;
  institution: InstitutionRow;
  allTargets: InstitutionRow[];
  fees: ExtractedFeeRow[];
  crawlResults: CrawlResultRow[];
  primaryDocUrl: string | null;
}

export interface ClassifierResult {
  availability: "high" | "medium" | "low";
  feeCount: number;
  approvedCount: number;
  stagedCount: number;
  categories: string[];
  hasAmounts: number;
  latestCrawlStatus: string;
  latestCrawlDate: string | null;
  documentUrl: string | null;
  consecutiveFailures: number;
}

export interface ExtractorResult {
  fees: MappedFee[];
  confidence: number;
  sourceType: string;
  knowledgeDate: string;
  rawCount: number;
}

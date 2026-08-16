import {
  getFeePublicationStatusLabel,
  type FeePublicationStatus,
} from "@/lib/institution-quality";
import type { HamiltonEvidencePolicy } from "@/lib/hamilton/request-contract";
import type { SelectedInstitutionFeeDelta } from "@/lib/hamilton/report-evidence";

export interface ReportSynthesisInstitutionInput {
  id: number;
  institution_name: string;
  fee_publication_status?: FeePublicationStatus | null;
  insight_readiness?: string | null;
  confidence_summary?: string | null;
  published_fee_count?: number | null;
  provisional_fee_count?: number | null;
  latest_source_status?: string | null;
}

export interface ReportSynthesisFinancialInput {
  report_date: string | null;
  total_assets: number | null;
  total_deposits: number | null;
  service_charge_income: number | null;
  total_revenue: number | null;
  fee_income_ratio: number | null;
  roa: number | null;
}

export interface ReportSynthesisFeeInput {
  fee_name: string;
  fee_category?: string | null;
  amount: number | null;
  frequency?: string | null;
  review_status: string;
  extraction_confidence?: number | null;
  source_url?: string | null;
}

export interface ReportSynthesisPipelineFeeInput {
  fee_name: string;
  canonical_fee_key?: string | null;
  amount: number | null;
  frequency?: string | null;
  review_status?: string | null;
  extraction_confidence?: number | null;
  source_url?: string | null;
}

export interface ReportSynthesisRawFeeInput {
  fee_name: string;
  amount: number | null;
  frequency?: string | null;
  extraction_confidence?: number | null;
  source_url?: string | null;
}

export interface ReportSynthesisEvidenceInput {
  verified_fee_preview?: ReportSynthesisPipelineFeeInput[] | null;
  raw_fee_preview?: ReportSynthesisRawFeeInput[] | null;
  pipeline_counts?: unknown | null;
}

export interface ReportSynthesisPeerContextInput {
  label: string;
  source: string;
  filters: unknown;
  peerSetId: string | null;
  fallbackReason: string | null;
}

export interface SelectedInstitutionReportData {
  id: number;
  name: string;
  status: string;
  status_label: string;
  insight_readiness: string;
  confidence_summary: string | null;
  verified_fee_count: number;
  provisional_fee_count: number;
  latest_source_status: string | null;
  financials: ReportSynthesisFinancialInput | null;
  fee_rows: Array<{
    fee_name: string;
    fee_category: string | null;
    amount: number | null;
    frequency: string | null;
    evidence_tier: "verified" | "provisional";
    excluded_from_verified_benchmark: boolean;
    confidence: number | null;
    source_url: string | null;
  }>;
  pipeline_fee_rows: Array<{
    fee_name: string;
    fee_category: string | null;
    amount: number | null;
    frequency: string | null;
    evidence_tier: "provisional";
    pipeline_stage: "verified_unpublished" | "raw_unverified";
    confidence: number | null;
    source_url: string | null;
  }>;
  fee_peer_deltas: SelectedInstitutionFeeDelta[];
  benchmark_scope: string;
  peer_index_source: string;
  peer_filters: unknown;
  peer_set_id: string | null;
  peer_fallback_reason: string | null;
  can_generate_verified_benchmark_conclusions: boolean;
  pipeline_counts: unknown | null;
  revenue_trend: unknown[];
  peer_ranking: unknown;
  evidence_policy: HamiltonEvidencePolicy;
}

export function buildSelectedInstitutionReportRules(params: {
  institutionId?: number | null;
}): string {
  if (!params.institutionId) return "";

  return `

SELECTED-INSTITUTION RULES:
1. Use selected_institution.fee_peer_deltas as the primary competitive-positioning evidence. These deltas are computed before generation from the selected institution's fee rows and the selected verified peer baseline.
2. If fee_peer_deltas is empty, do not write benchmark conclusions or pricing recommendations. Return a diligence/readiness explanation instead.
3. Provisional rows are directional only. When evidence_tier is provisional or excluded_from_verified_benchmark is true, label the conclusion as provisional and do not treat it as a verified benchmark score.
4. Do not convert national category medians into selected-institution recommendations unless selected_institution.fee_peer_deltas contains a matching selected institution row.
`.trim();
}

export function buildSelectedInstitutionReportData(params: {
  selectedInstitution: ReportSynthesisInstitutionInput | null;
  latestFinancial: ReportSynthesisFinancialInput | null;
  selectedVisibleFees: ReportSynthesisFeeInput[];
  selectedEvidence: ReportSynthesisEvidenceInput | null;
  selectedFeeDeltas: SelectedInstitutionFeeDelta[];
  peerIndex: ReportSynthesisPeerContextInput;
  selectedRevenueTrend: unknown[];
  selectedPeerRanking: unknown;
  evidencePolicy: HamiltonEvidencePolicy;
}): SelectedInstitutionReportData | null {
  const selectedInstitution = params.selectedInstitution;
  if (!selectedInstitution) return null;

  const pipelineFeeRows = [
    ...(params.selectedEvidence?.verified_fee_preview ?? [])
      .filter((fee) => fee.review_status !== "rejected")
      .map((fee) => ({
        fee_name: fee.fee_name,
        fee_category: fee.canonical_fee_key ?? null,
        amount: fee.amount,
        frequency: fee.frequency ?? null,
        evidence_tier: "provisional" as const,
        pipeline_stage: "verified_unpublished" as const,
        confidence: fee.extraction_confidence ?? null,
        source_url: fee.source_url ?? null,
      })),
    ...(params.selectedEvidence?.raw_fee_preview ?? []).map((fee) => ({
      fee_name: fee.fee_name,
      fee_category: null,
      amount: fee.amount,
      frequency: fee.frequency ?? null,
      evidence_tier: "provisional" as const,
      pipeline_stage: "raw_unverified" as const,
      confidence: fee.extraction_confidence ?? null,
      source_url: fee.source_url ?? null,
    })),
  ].slice(0, 25);

  return {
    id: selectedInstitution.id,
    name: selectedInstitution.institution_name,
    status: selectedInstitution.fee_publication_status ?? "unavailable",
    status_label: getFeePublicationStatusLabel(
      selectedInstitution.fee_publication_status ?? "unavailable",
    ),
    insight_readiness: selectedInstitution.insight_readiness ?? "source_needed",
    confidence_summary: selectedInstitution.confidence_summary ?? null,
    verified_fee_count: selectedInstitution.published_fee_count ?? 0,
    provisional_fee_count: selectedInstitution.provisional_fee_count ?? 0,
    latest_source_status: selectedInstitution.latest_source_status ?? null,
    financials: params.latestFinancial,
    fee_rows: params.selectedVisibleFees.slice(0, 25).map((fee) => ({
      fee_name: fee.fee_name,
      fee_category: fee.fee_category ?? null,
      amount: fee.amount,
      frequency: fee.frequency ?? null,
      evidence_tier: fee.review_status === "approved" ? "verified" : "provisional",
      excluded_from_verified_benchmark: fee.review_status !== "approved",
      confidence: fee.extraction_confidence ?? null,
      source_url: fee.source_url ?? null,
    })),
    pipeline_fee_rows: pipelineFeeRows,
    fee_peer_deltas: params.selectedFeeDeltas,
    benchmark_scope: params.peerIndex.label,
    peer_index_source: params.peerIndex.source,
    peer_filters: params.peerIndex.filters,
    peer_set_id: params.peerIndex.peerSetId,
    peer_fallback_reason: params.peerIndex.fallbackReason,
    can_generate_verified_benchmark_conclusions: params.selectedFeeDeltas.some(
      (delta) => delta.evidence_tier === "verified",
    ),
    pipeline_counts: params.selectedEvidence?.pipeline_counts ?? null,
    revenue_trend: params.selectedRevenueTrend.slice(0, 8),
    peer_ranking: params.selectedPeerRanking,
    evidence_policy: params.evidencePolicy,
  };
}

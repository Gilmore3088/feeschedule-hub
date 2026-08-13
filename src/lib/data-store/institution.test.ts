import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./connection", () => ({
  sql: vi.fn(),
}));

import { sql } from "./connection";
import { getInstitutionFeeScheduleEvidence } from "./institution";

const sqlMock = sql as unknown as ReturnType<typeof vi.fn>;

describe("getInstitutionFeeScheduleEvidence", () => {
  beforeEach(() => {
    sqlMock.mockReset();
  });

  it("returns source, text, raw, verified, and published pipeline evidence", async () => {
    sqlMock
      .mockResolvedValueOnce([
        {
          id: "501",
          source_collection_run_id: "77",
          status: "success",
          document_url: "https://bank.example/fees.pdf",
          document_path: null,
          content_hash: "abcdef1234567890",
          fees_extracted: "12",
          error_message: null,
          crawled_at: "2026-08-13T12:00:00Z",
          status_code: "200",
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "44",
          agent_run_id: "88",
          source_document_id: "501",
          source_url: "https://bank.example/fees.pdf",
          document_type: "pdf",
          content_type: "application/pdf",
          source_hash: "abcdef1234567890",
          status: "completed",
          char_count: "16420",
          error_message: null,
          updated_at: "2026-08-13T12:03:00Z",
          text_excerpt: "Schedule of Fees",
        },
      ])
      .mockResolvedValueOnce([
        {
          raw_fee_count: "12",
          verified_fee_count: "8",
          published_fee_count: "5",
          raw_without_verified_count: "4",
          verified_without_published_count: "3",
        },
      ])
      .mockResolvedValueOnce([
        {
          fee_raw_id: "9001",
          source_document_id: "501",
          fee_name: "Monthly maintenance fee",
          amount: "7.50",
          frequency: "monthly",
          conditions: "Waived with direct deposit",
          extraction_confidence: "0.91",
          source_url: "https://bank.example/fees.pdf",
          source: "knox",
          created_at: "2026-08-13T12:04:00Z",
        },
      ])
      .mockResolvedValueOnce([
        {
          fee_verified_id: "7001",
          fee_raw_id: "9001",
          canonical_fee_key: "monthly_maintenance",
          fee_name: "Monthly maintenance fee",
          amount: "7.50",
          frequency: "monthly",
          review_status: "verified",
          extraction_confidence: "0.91",
          source_url: "https://bank.example/fees.pdf",
          created_at: "2026-08-13T12:05:00Z",
        },
      ]);

    const evidence = await getInstitutionFeeScheduleEvidence(1);
    const issuedSql = sqlMock.mock.calls
      .map((call) => String(call[0]))
      .join("\n");

    expect(evidence.latest_document).toMatchObject({
      id: 501,
      status: "success",
      document_url: "https://bank.example/fees.pdf",
      fees_extracted: 12,
    });
    expect(evidence.latest_text).toMatchObject({
      id: 44,
      status: "completed",
      char_count: 16420,
      text_excerpt: "Schedule of Fees",
    });
    expect(evidence.pipeline_counts).toEqual({
      raw_fee_count: 12,
      verified_fee_count: 8,
      published_fee_count: 5,
      raw_without_verified_count: 4,
      verified_without_published_count: 3,
    });
    expect(evidence.raw_fee_preview[0]).toMatchObject({
      fee_raw_id: 9001,
      fee_name: "Monthly maintenance fee",
      amount: 7.5,
    });
    expect(evidence.verified_fee_preview[0]).toMatchObject({
      fee_verified_id: 7001,
      canonical_fee_key: "monthly_maintenance",
      review_status: "verified",
    });
    expect(issuedSql).toContain("source_documents");
    expect(issuedSql).toContain("agent_source_texts");
    expect(issuedSql).toContain("raw_fee_observations");
    expect(issuedSql).toContain("verified_fee_observations");
    expect(issuedSql).toContain("published_fee_catalog");
    expect(issuedSql).not.toContain("extracted_fees");
  });
});

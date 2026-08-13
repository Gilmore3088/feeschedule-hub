import { describe, expect, it } from "vitest";
import {
  classifyAgentFailure,
  classifyInstitutionQuality,
  getPublicInstitutionQualityLabel,
  repairHrefForQualitySignal,
} from "./institution-quality";

describe("classifyInstitutionQuality", () => {
  it("flags JPM-style investor news URLs as suspect and unpublished", () => {
    const result = classifyInstitutionQuality({
      source: "fdic",
      certNumber: "628",
      websiteUrl: "https://www.jpmorganchase.com",
      feeScheduleUrl:
        "https://www.jpmorganchase.com/ir/news/2021/chase-helps-more-than-two-million-customers-avoid-overdraft-service-fees",
      publishedFeeCount: 0,
      latestSourceStatus: "failed",
      latestExtractedFeeCount: 0,
      latestSourceCollectedAt: "2026-03-17T01:00:43Z",
    });

    expect(result.quality_status).toBe("needs_review");
    expect(result.quality_signals.map((s) => s.code)).toContain("bad_or_suspect_url");
    expect(result.quality_signals.map((s) => s.code)).toContain("url_but_zero_published");
    expect(getPublicInstitutionQualityLabel(result.quality_signals)).toBe(
      "Fee schedule under review",
    );
  });

  it("routes extracted-but-unpublished records to Darwin", () => {
    const result = classifyInstitutionQuality({
      source: "fdic",
      certNumber: "3511",
      websiteUrl: "https://www.wellsfargo.com",
      feeScheduleUrl:
        "https://www.wellsfargo.com/checking/clear-access-banking/account-fees-summary/",
      publishedFeeCount: 0,
      latestSourceStatus: "success",
      latestExtractedFeeCount: 15,
    });

    const signal = result.quality_signals.find((s) => s.code === "extracted_not_published");
    expect(signal).toBeDefined();
    expect(repairHrefForQualitySignal(signal!)).toBe("/admin/darwin");
  });

  it("surfaces provider credit failures as critical", () => {
    expect(classifyAgentFailure("Error code: 400 - credit balance is too low")).toBe(
      "provider_credit",
    );

    const result = classifyInstitutionQuality({
      source: "fdic",
      certNumber: "1",
      websiteUrl: "https://example.com",
      feeScheduleUrl: "https://example.com/fees.pdf",
      publishedFeeCount: 0,
      latestSourceStatus: "failed",
      latestSourceError: "Your credit balance is too low to access the Anthropic API.",
    });

    expect(result.primary_signal.code).toBe("provider_failure");
    expect(result.primary_signal.severity).toBe("critical");
  });

  it("marks records with published fees and complete identity as verified", () => {
    const result = classifyInstitutionQuality({
      source: "ncua",
      certNumber: "5536",
      websiteUrl: "https://www.navyfederal.org",
      feeScheduleUrl: "https://www.navyfederal.org/membership/fees-and-charges.html",
      publishedFeeCount: 22,
      latestSourceStatus: "success",
      latestExtractedFeeCount: 22,
    });

    expect(result.quality_status).toBe("verified");
    expect(result.primary_signal.code).toBe("verified");
  });
});

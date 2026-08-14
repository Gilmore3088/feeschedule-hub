import { describe, expect, it } from "vitest";
import { classifyDataTrustQueue } from "./data-trust";

describe("classifyDataTrustQueue", () => {
  it("prioritizes pending public source submissions over empty source state", () => {
    expect(
      classifyDataTrustQueue({
        pendingSubmissionCount: 1,
        verifiedFeeCount: 0,
        feeScheduleUrl: null,
      }),
    ).toMatchObject({
      state: "submitted_source_pending_review",
      owner: "atlas",
      publicLabel: "Source submitted, pending review.",
    });
  });

  it("does not mark zero approved rows as public ready", () => {
    expect(
      classifyDataTrustQueue({
        verifiedFeeCount: 0,
        provisionalFeeCount: 12,
        feeScheduleUrl: "https://bank.example/fees.pdf",
      }).state,
    ).toBe("source_accepted_awaiting_validation");
  });

  it("routes extracted but unclassified rows to Darwin", () => {
    expect(
      classifyDataTrustQueue({
        verifiedFeeCount: 0,
        latestSourceStatus: "success",
        latestExtractedFeeCount: 5,
        rawWithoutVerifiedCount: 5,
      }),
    ).toMatchObject({
      state: "extracted_rows_pending_classification",
      owner: "darwin",
    });
  });

  it("keeps accepted sources manual when automation is stopped", () => {
    expect(
      classifyDataTrustQueue({
        acceptedSubmissionCount: 1,
        verifiedFeeCount: 0,
        automationEnabled: false,
      }),
    ).toMatchObject({
      state: "source_accepted_awaiting_validation",
      owner: "atlas",
      nextAction:
        "Automation is stopped; hold for manual validation or rerun after cost guards are cleared.",
    });
  });

  it("treats active validation queue entries as accepted source work", () => {
    expect(
      classifyDataTrustQueue({
        validationQueueCount: 1,
        verifiedFeeCount: 0,
        automationEnabled: false,
      }),
    ).toMatchObject({
      state: "source_accepted_awaiting_validation",
      owner: "atlas",
      publicLabel: "Source accepted, awaiting validation.",
    });
  });

  it("marks approved catalog evidence as public ready", () => {
    expect(
      classifyDataTrustQueue({
        verifiedFeeCount: 3,
        provisionalFeeCount: 0,
      }),
    ).toMatchObject({
      state: "verified_public_ready",
      severity: "ok",
    });
  });
});

import { describe, expect, it } from "vitest";
import { buildInstitutionProfileLinks } from "./institution-profile-links";

describe("buildInstitutionProfileLinks", () => {
  it("builds the public institution source and Pro consulting handoff links", () => {
    expect(
      buildInstitutionProfileLinks({
        institutionId: 2945,
        institutionName: "Hamilton Federal Credit Union",
      }),
    ).toEqual({
      submitSourceHref:
        "/submit-fees?institutionId=2945&institutionName=Hamilton%20Federal%20Credit%20Union",
      claimReviewHref:
        "/login?from=%2Fpro%2Fsettings%3FinstId%3D2945%26claim%3D1",
      analyzeHref: "/pro/analyze?instId=2945&intent=institution",
      briefHref: "/pro/reports?instId=2945&intent=competitive-brief",
      scenarioHref: "/pro/simulate?instId=2945",
    });
  });

  it("keeps special institution names inside the source-intake query value", () => {
    const links = buildInstitutionProfileLinks({
      institutionId: 8109,
      institutionName: "A&B Bank / Trust",
    });

    expect(links.submitSourceHref).toBe(
      "/submit-fees?institutionId=8109&institutionName=A%26B%20Bank%20%2F%20Trust",
    );
    expect(links.analyzeHref).toBe("/pro/analyze?instId=8109&intent=institution");
    expect(links.briefHref).toBe("/pro/reports?instId=8109&intent=competitive-brief");
    expect(links.scenarioHref).toBe("/pro/simulate?instId=8109");
  });
});

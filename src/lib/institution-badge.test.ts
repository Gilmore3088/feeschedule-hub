import { describe, expect, it } from "vitest";
import { institutionBadge } from "./institution-badge";

describe("institutionBadge", () => {
  it("should_tier_by_published_count", () => {
    expect(institutionBadge({ published: 26, provisional: 20, hasSource: true }).tier).toBe("verified");
    expect(institutionBadge({ published: 2, provisional: 6, hasSource: true })).toMatchObject({
      tier: "partial",
      label: "Partially verified (2 of 5)",
    });
    expect(institutionBadge({ published: 0, provisional: 13, hasSource: true }).tier).toBe("under_review");
    expect(institutionBadge({ published: 0, provisional: 0, hasSource: false }).tier).toBe("none");
  });

  it("should_treat_a_known_source_with_no_backlog_as_under_review_not_none", () => {
    const badge = institutionBadge({ published: 0, provisional: 0, hasSource: true });
    expect(badge.tier).toBe("under_review");
    expect(badge.label).toBe("Under review");
  });

  it("should_label_verified_at_exactly_the_threshold", () => {
    expect(institutionBadge({ published: 5, provisional: 0, hasSource: true }).tier).toBe("verified");
  });

  it("should_render_none_when_there_is_nothing_to_review", () => {
    const badge = institutionBadge({ published: 0, provisional: 0, hasSource: false });
    expect(badge.label).toBe("No published schedule found");
  });
});

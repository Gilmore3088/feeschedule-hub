import { describe, expect, it } from "vitest";
import { isEmptyAnalysis } from "./analysis-guard";

describe("isEmptyAnalysis", () => {
  it("should_return_true_when_hamilton_view_is_blank_and_no_why_it_matters_items", () => {
    expect(isEmptyAnalysis({ hamiltonView: "", whyItMatters: [] })).toBe(true);
  });
  it("should_return_true_when_hamilton_view_is_only_whitespace", () => {
    expect(isEmptyAnalysis({ hamiltonView: "   \n  ", whyItMatters: [] })).toBe(true);
  });
  it("should_return_false_when_hamilton_view_has_content", () => {
    expect(isEmptyAnalysis({ hamiltonView: "Overdraft fees are elevated.", whyItMatters: [] })).toBe(false);
  });
  it("should_return_false_when_why_it_matters_has_items_even_if_view_is_blank", () => {
    expect(isEmptyAnalysis({ hamiltonView: "", whyItMatters: ["Peer comparison shifted."] })).toBe(false);
  });
});

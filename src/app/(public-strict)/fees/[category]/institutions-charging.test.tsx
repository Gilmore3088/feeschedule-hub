import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InstitutionsCharging } from "./institutions-charging";
const rows = Array.from({ length: 12 }, (_, i) => ({ institution_id: i + 1, institution_name: `Bank ${i + 1}`, amount: 10 + i, state_code: "OH", charter_type: "bank" }));
describe("InstitutionsCharging", () => {
  it("should_link_every_institution_name", () => {
    render(<InstitutionsCharging rows={rows} category="overdraft" name="Overdraft" />);
    expect(screen.getByRole("link", { name: /Bank 1$/ })).toHaveAttribute("href", "/institution/1");
  });
  it("should_hide_when_below_min_n", () => {
    const { container } = render(<InstitutionsCharging rows={rows.slice(0, 3)} category="overdraft" name="Overdraft" />);
    expect(container.textContent).toBe("");
  });
});

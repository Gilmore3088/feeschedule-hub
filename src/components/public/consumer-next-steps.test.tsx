import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConsumerNextSteps } from "./consumer-next-steps";

describe("ConsumerNextSteps", () => {
  it("should_link_to_institutions_state_report_and_report_bridge_when_state_code_given", () => {
    render(<ConsumerNextSteps stateCode="OH" />);

    expect(screen.getByRole("link", { name: /look up your bank/i })).toHaveAttribute(
      "href",
      "/institutions"
    );
    expect(screen.getByRole("link", { name: /fees in ohio/i })).toHaveAttribute(
      "href",
      "/research/state/OH"
    );
    expect(screen.getByRole("link", { name: /get the .*report/i })).toHaveAttribute(
      "href",
      "/for-institutions#report"
    );
  });

  it("should_link_to_the_state_index_instead_of_a_specific_state_when_no_state_code_given", () => {
    render(<ConsumerNextSteps />);

    expect(screen.getByRole("link", { name: /fees by state/i })).toHaveAttribute(
      "href",
      "/research#states"
    );
    expect(screen.queryByRole("link", { name: /fees in/i })).not.toBeInTheDocument();
  });

  it("should_render_the_newsletter_signup_form", () => {
    render(<ConsumerNextSteps />);

    expect(screen.getByPlaceholderText("you@company.com")).toHaveAttribute(
      "id",
      "next-steps-newsletter-email"
    );
  });

  it("should_never_link_to_subscribe", () => {
    render(<ConsumerNextSteps stateCode="OH" category="overdraft" />);

    for (const link of screen.getAllByRole("link")) {
      expect(link).not.toHaveAttribute("href", "/subscribe");
    }
  });
});

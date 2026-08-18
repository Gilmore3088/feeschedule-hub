import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmailSignup } from "./email-signup";

describe("EmailSignup", () => {
  it("should_use_distinct_ids_when_two_instances_render_on_one_page", () => {
    render(
      <>
        <EmailSignup idPrefix="footer-newsletter" placement="footer" />
        <EmailSignup idPrefix="guide-newsletter" placement="guide_sidebar" />
      </>
    );

    const inputs = screen.getAllByPlaceholderText("you@company.com");
    expect(inputs).toHaveLength(2);

    const ids = inputs.map((el) => el.id);
    expect(ids).toEqual(["footer-newsletter-email", "guide-newsletter-email"]);
    expect(new Set(ids).size).toBe(2);

    // Each label points at its own instance's input, not just a unique id.
    for (const input of inputs) {
      expect(document.querySelector(`label[for="${input.id}"]`)).not.toBeNull();
    }
  });

  it("should_default_to_the_footer_id_prefix_when_no_props_are_given", () => {
    render(<EmailSignup />);
    expect(screen.getByPlaceholderText("you@company.com")).toHaveAttribute(
      "id",
      "footer-newsletter-email"
    );
  });
});

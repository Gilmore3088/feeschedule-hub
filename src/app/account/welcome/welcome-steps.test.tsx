import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WelcomeSteps } from "./welcome-steps";

const baseUser = {
  institution_name: null,
  institution_type: null,
  asset_tier: null,
  state_code: null,
  job_role: null,
};

describe("WelcomeSteps paid panel", () => {
  it("should_render_plan_amount_and_next_bill_when_paid_summary_is_present", () => {
    render(
      <WelcomeSteps
        userName="Jamie Rivera"
        user={baseUser}
        feePreview={[]}
        districtName={null}
        districtId={null}
        isPro
        pendingWorkspaceInvitations={[]}
        workspaceMemberships={[]}
        paid={{
          planLabel: "Seat License — Monthly",
          amountLabel: "$499.99/mo",
          nextBillDate: "Sep 17, 2026",
          receiptEmail: "jamie@example.com",
        }}
      />,
    );

    expect(screen.getByText(/You.re subscribed/i)).toBeInTheDocument();
    expect(screen.getByText("Seat License — Monthly")).toBeInTheDocument();
    expect(screen.getByText(/\$499\.99\/mo/)).toBeInTheDocument();
    expect(screen.getByText(/Sep 17, 2026/)).toBeInTheDocument();
    expect(screen.getByText(/jamie@example\.com/)).toBeInTheDocument();
  });

  it("should_skip_the_paid_panel_and_open_directly_on_the_profile_form_when_not_paid", () => {
    render(
      <WelcomeSteps
        userName="Jamie Rivera"
        user={baseUser}
        feePreview={[]}
        districtName={null}
        districtId={null}
        isPro={false}
        pendingWorkspaceInvitations={[]}
        workspaceMemberships={[]}
      />,
    );

    expect(screen.queryByText(/You.re subscribed/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Welcome to Fee Insight, Jamie!/)).toBeInTheDocument();
  });
});

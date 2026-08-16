import { describe, expect, it } from "vitest";
import {
  buildAccountQuickActions,
  buildHamiltonAccountHref,
} from "./account-actions";

function actionsByLabel(isPro = true) {
  return new Map(
    buildAccountQuickActions({
      isPro,
      userStateCode: "TN",
      districtName: "Atlanta",
      selectedInstitution: {
        id: 2945,
        name: "Hamilton Federal Credit Union",
      },
    }).map((action) => [action.label, action]),
  );
}

describe("Hamilton account actions", () => {
  it("carries the selected institution into the Pro consulting workflows", () => {
    const actions = actionsByLabel();

    expect(actions.get("Analyze Institution")?.href).toBe(
      "/pro/analyze?intent=institution&instId=2945",
    );
    expect(actions.get("Generate Brief")?.href).toBe(
      "/pro/reports?intent=competitive-brief&instId=2945",
    );
    expect(actions.get("Run Scenario")?.href).toBe("/pro/simulate?instId=2945");
    expect(actions.get("Watch Competitors")?.href).toBe("/pro/monitor?instId=2945");
  });

  it("prefills source intake and deep-links to peer-set management", () => {
    const actions = actionsByLabel();

    expect(actions.get("Submit Source")?.href).toBe(
      "/submit-fees?institutionId=2945&institutionName=Hamilton%20Federal%20Credit%20Union",
    );
    expect(actions.get("Update Peer Set")?.href).toBe(
      "/pro/settings?instId=2945#peer-sets",
    );
  });

  it("preserves premium workflow return paths for non-Pro accounts", () => {
    const actions = actionsByLabel(false);

    expect(actions.get("Generate Brief")?.href).toBe(
      "/subscribe?from=%2Fpro%2Freports%3Fintent%3Dcompetitive-brief%26instId%3D2945",
    );
    expect(actions.get("Submit Source")?.href).toBe(
      "/submit-fees?institutionId=2945&institutionName=Hamilton%20Federal%20Credit%20Union",
    );
  });

  it("does not append institution context when no canonical selection exists", () => {
    expect(
      buildHamiltonAccountHref({
        isPro: true,
        path: "/pro/settings#peer-sets",
        selectedInstitutionId: null,
      }),
    ).toBe("/pro/settings#peer-sets");

    const actions = buildAccountQuickActions({ isPro: true });
    expect(actions.find((action) => action.label === "Submit Source")?.href).toBe(
      "/submit-fees",
    );
  });
});

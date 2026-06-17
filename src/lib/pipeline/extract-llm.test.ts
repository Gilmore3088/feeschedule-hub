import { describe, it, expect, vi, beforeEach } from "vitest";

const createMock = vi.hoisted(() => vi.fn());
vi.mock("./llm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./llm")>();
  return { ...actual, getAnthropic: () => ({ messages: { create: createMock } }) };
});

import { extractFeesFromText } from "./extract-llm";

function toolResponse(fees: unknown) {
  return {
    content: [{ type: "tool_use", name: "record_fees", input: { fees } }],
    usage: { input_tokens: 100, output_tokens: 50 },
  };
}

describe("extractFeesFromText", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns nothing for empty input without calling the model", async () => {
    const r = await extractFeesFromText("   ");
    expect(r.fees).toEqual([]);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns sanitized fees from the tool output", async () => {
    createMock.mockResolvedValue(
      toolResponse([
        { fee_name: "  Monthly Maintenance  ", amount: 12, frequency: "monthly" },
        { fee_name: "Wire (Domestic)", amount: 25.5, frequency: null },
      ]),
    );
    const r = await extractFeesFromText("Monthly Maintenance $12 ... Wire $25.50", "Acme Bank");
    expect(r.fees).toEqual([
      { fee_name: "Monthly Maintenance", amount: 12, frequency: "monthly" },
      { fee_name: "Wire (Domestic)", amount: 25.5, frequency: null },
    ]);
    expect(r.costCents).toBeGreaterThanOrEqual(0);
  });

  it("drops nameless rows and coerces bad amounts to null", async () => {
    createMock.mockResolvedValue(
      toolResponse([
        { fee_name: "", amount: 5, frequency: null },
        { fee_name: "NSF", amount: "oops", frequency: 7 },
      ]),
    );
    const r = await extractFeesFromText("some text");
    expect(r.fees).toEqual([{ fee_name: "NSF", amount: null, frequency: null }]);
  });
});

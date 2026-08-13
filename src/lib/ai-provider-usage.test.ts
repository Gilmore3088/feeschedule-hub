import { beforeEach, describe, expect, it, vi } from "vitest";

const { sqlMock, controlMock, stopMock } = vi.hoisted(() => ({
  sqlMock: vi.fn(),
  controlMock: vi.fn(),
  stopMock: vi.fn(),
}));

vi.mock("./crawler-db/connection", () => ({ sql: sqlMock }));
vi.mock("./automation-control", () => ({
  assertAutomationEnabled: controlMock,
  engageEmergencyStop: stopMock,
  EmergencyStopActiveError: class EmergencyStopActiveError extends Error {},
}));

import {
  estimateAnthropicCostMicrousd,
  recordProviderUsage,
  trackAnthropicRequest,
} from "./ai-provider-usage";

describe("AI provider usage", () => {
  beforeEach(() => {
    sqlMock.mockReset().mockResolvedValue([]);
    controlMock.mockReset().mockResolvedValue({ enabled: true });
    stopMock.mockReset().mockResolvedValue({ enabled: false });
  });

  it("estimates model-family spend in microdollars", () => {
    expect(estimateAnthropicCostMicrousd("claude-sonnet-4", {
      inputTokens: 1_000,
      outputTokens: 100,
    })).toBe(4_500);
  });

  it("records tokens after a successful provider request", async () => {
    const response = {
      content: [],
      usage: { input_tokens: 120, output_tokens: 30 },
    };

    await expect(trackAnthropicRequest(
      { model: "claude-haiku-4-5", agent: "darwin", operation: "classify" },
      async () => response,
    )).resolves.toBe(response);

    expect(controlMock).toHaveBeenCalledOnce();
    expect(sqlMock).toHaveBeenCalledOnce();
    expect(sqlMock.mock.calls[0].slice(1)).toEqual(expect.arrayContaining([120, 30]));
  });

  it("engages the emergency stop after Anthropic credit exhaustion", async () => {
    const error = new Error(
      "Error code: 400 - Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to purchase credits.",
    );

    await expect(trackAnthropicRequest(
      { model: "claude-haiku-4-5", agent: "darwin", operation: "classify" },
      async () => {
        throw error;
      },
    )).rejects.toBe(error);

    expect(sqlMock).toHaveBeenCalledOnce();
    expect(stopMock).toHaveBeenCalledWith(
      "provider-guard",
      expect.stringContaining("credit balance is too low"),
    );
  });

  it("engages the emergency stop when a streaming provider route records credit exhaustion", async () => {
    await recordProviderUsage(
      { provider: "anthropic", model: "claude-sonnet-4-5", agent: "hamilton", operation: "chat" },
      "failed",
      {},
      {
        error:
          "Error code: 400 - Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to purchase credits.",
      },
    );

    expect(sqlMock).toHaveBeenCalledOnce();
    expect(stopMock).toHaveBeenCalledWith(
      "provider-guard",
      expect.stringContaining("credit balance is too low"),
    );
  });
});

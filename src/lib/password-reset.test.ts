import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sqlMock: vi.fn(),
  txMock: vi.fn(),
  hashPasswordMock: vi.fn(),
  sendPasswordResetEmailMock: vi.fn(),
}));

vi.mock("@/lib/data-store/connection", () => ({
  sql: mocks.sqlMock,
  withTransaction: vi.fn(async (callback: (tx: typeof mocks.txMock) => Promise<unknown>) =>
    callback(mocks.txMock),
  ),
}));

vi.mock("@/lib/passwords", () => ({
  hashPassword: mocks.hashPasswordMock,
}));

vi.mock("@/lib/email/password-reset", () => ({
  sendPasswordResetEmail: mocks.sendPasswordResetEmailMock,
}));

import { consumeReset, createResetToken, hashResetToken, issueReset } from "./password-reset";

const SIXTY_MINUTES_MS = 60 * 60 * 1000;

describe("createResetToken", () => {
  it("should_generate_a_64_char_hex_token_with_a_matching_sha256_hash", () => {
    const { token, tokenHash } = createResetToken();

    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).toBe(hashResetToken(token));
  });

  it("should_set_expiry_to_approximately_60_minutes_from_now", () => {
    const before = Date.now();
    const { expiresAt } = createResetToken();
    const after = Date.now();

    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + SIXTY_MINUTES_MS - 1000);
    expect(expiresAt.getTime()).toBeLessThanOrEqual(after + SIXTY_MINUTES_MS + 1000);
  });
});

describe("hashResetToken", () => {
  it("should_be_deterministic_for_the_same_input", () => {
    expect(hashResetToken("same-token")).toBe(hashResetToken("same-token"));
  });

  it("should_produce_different_hashes_for_different_tokens", () => {
    expect(hashResetToken("token-a")).not.toBe(hashResetToken("token-b"));
  });
});

describe("issueReset", () => {
  beforeEach(() => {
    mocks.sqlMock.mockReset();
    mocks.sendPasswordResetEmailMock.mockReset();
    mocks.sendPasswordResetEmailMock.mockResolvedValue({ status: "sent", providerId: "em_1" });
  });

  it("should_resolve_without_sending_when_no_matching_active_user", async () => {
    mocks.sqlMock.mockResolvedValueOnce([]);

    await expect(issueReset("nobody@example.com")).resolves.toBeUndefined();

    expect(mocks.sendPasswordResetEmailMock).not.toHaveBeenCalled();
  });

  it("should_insert_a_token_and_send_the_reset_email_when_the_user_exists", async () => {
    mocks.sqlMock
      .mockResolvedValueOnce([{ id: 42, email: "jane@example.com", username: "jane" }])
      .mockResolvedValueOnce([]);

    await issueReset("Jane@Example.com");

    expect(mocks.sqlMock).toHaveBeenCalledTimes(2);
    expect(mocks.sendPasswordResetEmailMock).toHaveBeenCalledTimes(1);
    const [args] = mocks.sendPasswordResetEmailMock.mock.calls[0] as [{ to: string; token: string }];
    expect(args.to).toBe("jane@example.com");
    expect(args.token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("should_resolve_even_when_the_email_provider_reports_not_configured", async () => {
    mocks.sqlMock
      .mockResolvedValueOnce([{ id: 42, email: "jane@example.com", username: "jane" }])
      .mockResolvedValueOnce([]);
    mocks.sendPasswordResetEmailMock.mockResolvedValue({
      status: "not_configured",
      reason: "RESEND_API_KEY is not configured.",
    });

    await expect(issueReset("jane@example.com")).resolves.toBeUndefined();
  });

  it("should_resolve_even_when_the_email_send_rejects", async () => {
    mocks.sqlMock
      .mockResolvedValueOnce([{ id: 42, email: "jane@example.com", username: "jane" }])
      .mockResolvedValueOnce([]);
    mocks.sendPasswordResetEmailMock.mockRejectedValue(new Error("network down"));

    await expect(issueReset("jane@example.com")).resolves.toBeUndefined();
  });
});

describe("consumeReset", () => {
  beforeEach(() => {
    mocks.txMock.mockReset();
    mocks.hashPasswordMock.mockReset();
    mocks.hashPasswordMock.mockResolvedValue("hashed-password");
  });

  it("should_return_invalid_when_the_token_hash_has_no_match", async () => {
    mocks.txMock.mockResolvedValueOnce([]);

    const result = await consumeReset("some-token", "newpassword123");

    expect(result).toBe("invalid");
    expect(mocks.hashPasswordMock).not.toHaveBeenCalled();
  });

  it("should_return_invalid_when_the_token_was_already_used", async () => {
    mocks.txMock.mockResolvedValueOnce([
      {
        id: "row-1",
        user_id: 42,
        expires_at: new Date(Date.now() + 10_000).toISOString(),
        used_at: new Date().toISOString(),
      },
    ]);

    const result = await consumeReset("some-token", "newpassword123");

    expect(result).toBe("invalid");
    expect(mocks.hashPasswordMock).not.toHaveBeenCalled();
  });

  it("should_return_expired_when_past_expires_at", async () => {
    mocks.txMock.mockResolvedValueOnce([
      {
        id: "row-1",
        user_id: 42,
        expires_at: new Date(Date.now() - 1_000).toISOString(),
        used_at: null,
      },
    ]);

    const result = await consumeReset("some-token", "newpassword123");

    expect(result).toBe("expired");
    expect(mocks.hashPasswordMock).not.toHaveBeenCalled();
  });

  it("should_hash_the_password_mark_the_token_used_and_update_the_user_on_success", async () => {
    mocks.txMock
      .mockResolvedValueOnce([
        {
          id: "row-1",
          user_id: 42,
          expires_at: new Date(Date.now() + 60_000).toISOString(),
          used_at: null,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await consumeReset("some-token", "newpassword123");

    expect(result).toBe("ok");
    expect(mocks.hashPasswordMock).toHaveBeenCalledWith("newpassword123");
    expect(mocks.txMock).toHaveBeenCalledTimes(3);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  function createTaggedMock() {
    const calls: Array<{ text: string; values: unknown[] }> = [];
    const queue: unknown[][] = [];
    const fn = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push({ text: strings.join("?"), values });
      return Promise.resolve(queue.shift() ?? []);
    });
    return { fn, calls, queue };
  }

  return {
    sqlTag: createTaggedMock(),
    txTag: createTaggedMock(),
    hashPasswordMock: vi.fn(),
    sendPasswordResetEmailMock: vi.fn(),
  };
});

vi.mock("@/lib/data-store/connection", () => ({
  sql: mocks.sqlTag.fn,
  withTransaction: vi.fn(async (callback: (tx: typeof mocks.txTag.fn) => Promise<unknown>) =>
    callback(mocks.txTag.fn),
  ),
}));

// Partial mock: keep the real `generateToken` (so createResetToken still
// exercises real crypto) and only stub `hashPassword`.
vi.mock("@/lib/passwords", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./passwords")>();
  return {
    ...actual,
    hashPassword: mocks.hashPasswordMock,
  };
});

vi.mock("@/lib/email/password-reset", () => ({
  sendPasswordResetEmail: mocks.sendPasswordResetEmailMock,
}));

import {
  consumeReset,
  createResetToken,
  hashResetToken,
  issueReset,
  PASSWORD_RESET_LOCK_NAMESPACE,
  RESET_REISSUE_COOLDOWN_MS,
} from "./password-reset";

const SIXTY_MINUTES_MS = 60 * 60 * 1000;

const USER_ROW = { id: 42, email: "jane@example.com", username: "jane" };

function resetMocks() {
  mocks.sqlTag.calls.length = 0;
  mocks.sqlTag.queue.length = 0;
  mocks.txTag.calls.length = 0;
  mocks.txTag.queue.length = 0;
  mocks.hashPasswordMock.mockReset();
  mocks.hashPasswordMock.mockResolvedValue("hashed-password");
  mocks.sendPasswordResetEmailMock.mockReset();
  mocks.sendPasswordResetEmailMock.mockResolvedValue({ status: "sent", providerId: "em_1" });
}

describe("createResetToken", () => {
  beforeEach(resetMocks);

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
  beforeEach(resetMocks);

  it("should_resolve_without_sending_when_no_matching_active_user", async () => {
    mocks.sqlTag.queue.push([]);

    await expect(issueReset("nobody@example.com")).resolves.toBeUndefined();

    expect(mocks.sqlTag.calls).toHaveLength(1);
    expect(mocks.sendPasswordResetEmailMock).not.toHaveBeenCalled();
  });

  it("should_take_the_advisory_lock_before_the_cooldown_select_inside_the_transaction", async () => {
    mocks.sqlTag.queue.push([USER_ROW]);
    mocks.txTag.queue.push([], [], [], []);

    await issueReset("jane@example.com");

    expect(mocks.txTag.calls.length).toBeGreaterThanOrEqual(2);

    const lockCall = mocks.txTag.calls[0];
    expect(lockCall.text).toContain("pg_advisory_xact_lock");
    expect(lockCall.values).toEqual([PASSWORD_RESET_LOCK_NAMESPACE, 42]);

    const cooldownSelectCall = mocks.txTag.calls[1];
    expect(cooldownSelectCall.text).toContain("password_reset_tokens");
    expect(cooldownSelectCall.text.toLowerCase()).toContain("order by created_at desc");
  });

  it("should_mark_outstanding_unused_tokens_used_before_inserting_a_new_one_and_send", async () => {
    mocks.sqlTag.queue.push([USER_ROW]);
    mocks.txTag.queue.push([], [], [], []);

    await issueReset("Jane@Example.com");

    expect(mocks.sqlTag.calls).toHaveLength(1);
    expect(mocks.txTag.calls).toHaveLength(4);

    const markUsedCall = mocks.txTag.calls[2];
    expect(markUsedCall.text).toContain("UPDATE password_reset_tokens");
    expect(markUsedCall.text).toContain("used_at IS NULL");
    expect(markUsedCall.values).toContain(42);

    const insertCall = mocks.txTag.calls[3];
    expect(insertCall.text).toContain("INSERT INTO password_reset_tokens");

    expect(mocks.sendPasswordResetEmailMock).toHaveBeenCalledTimes(1);
    const [args] = mocks.sendPasswordResetEmailMock.mock.calls[0] as [{ to: string; token: string }];
    expect(args.to).toBe("jane@example.com");
    expect(args.token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("should_skip_issuance_and_email_when_a_token_was_issued_within_the_cooldown_window", async () => {
    const recentlyIssuedAt = new Date(Date.now() - 60_000).toISOString(); // 1 minute ago
    mocks.sqlTag.queue.push([USER_ROW]);
    mocks.txTag.queue.push([], [{ created_at: recentlyIssuedAt }]);

    await issueReset("jane@example.com");

    expect(mocks.txTag.calls).toHaveLength(2);
    expect(mocks.sendPasswordResetEmailMock).not.toHaveBeenCalled();
  });

  it("should_issue_again_once_the_cooldown_window_has_elapsed", async () => {
    const staleIssuedAt = new Date(Date.now() - RESET_REISSUE_COOLDOWN_MS - 1_000).toISOString();
    mocks.sqlTag.queue.push([USER_ROW]);
    mocks.txTag.queue.push([], [{ created_at: staleIssuedAt }], [], []);

    await issueReset("jane@example.com");

    expect(mocks.txTag.calls).toHaveLength(4);
    expect(mocks.sendPasswordResetEmailMock).toHaveBeenCalledTimes(1);
  });

  it("should_resolve_without_waiting_for_the_email_send_to_complete", async () => {
    mocks.sqlTag.queue.push([USER_ROW]);
    mocks.txTag.queue.push([], [], [], []);
    mocks.sendPasswordResetEmailMock.mockReturnValue(new Promise(() => {})); // never resolves

    await expect(issueReset("jane@example.com")).resolves.toBeUndefined();
  });

  it("should_not_throw_when_the_fire_and_forget_email_send_rejects", async () => {
    mocks.sqlTag.queue.push([USER_ROW]);
    mocks.txTag.queue.push([], [], [], []);
    mocks.sendPasswordResetEmailMock.mockRejectedValue(new Error("network down"));

    await expect(issueReset("jane@example.com")).resolves.toBeUndefined();
  });
});

describe("consumeReset", () => {
  beforeEach(resetMocks);

  it("should_return_invalid_when_the_token_hash_has_no_match", async () => {
    mocks.txTag.queue.push([]);

    const result = await consumeReset("some-token", "newpassword123");

    expect(result).toBe("invalid");
    expect(mocks.hashPasswordMock).not.toHaveBeenCalled();
  });

  it("should_return_invalid_when_the_token_was_already_used", async () => {
    mocks.txTag.queue.push([
      {
        id: "row-1",
        user_id: 42,
        expires_at: new Date(Date.now() + 10_000).toISOString(),
        used_at: new Date().toISOString(),
        is_active: true,
      },
    ]);

    const result = await consumeReset("some-token", "newpassword123");

    expect(result).toBe("invalid");
    expect(mocks.hashPasswordMock).not.toHaveBeenCalled();
  });

  it("should_return_invalid_when_the_associated_user_is_no_longer_active", async () => {
    mocks.txTag.queue.push([
      {
        id: "row-1",
        user_id: 42,
        expires_at: new Date(Date.now() + 10_000).toISOString(),
        used_at: null,
        is_active: false,
      },
    ]);

    const result = await consumeReset("some-token", "newpassword123");

    expect(result).toBe("invalid");
    expect(mocks.hashPasswordMock).not.toHaveBeenCalled();
  });

  it("should_return_expired_when_past_expires_at", async () => {
    mocks.txTag.queue.push([
      {
        id: "row-1",
        user_id: 42,
        expires_at: new Date(Date.now() - 1_000).toISOString(),
        used_at: null,
        is_active: true,
      },
    ]);

    const result = await consumeReset("some-token", "newpassword123");

    expect(result).toBe("expired");
    expect(mocks.hashPasswordMock).not.toHaveBeenCalled();
  });

  it("should_hash_the_password_mark_the_token_used_update_the_user_and_invalidate_sessions_on_success", async () => {
    mocks.txTag.queue.push(
      [
        {
          id: "row-1",
          user_id: 42,
          expires_at: new Date(Date.now() + 60_000).toISOString(),
          used_at: null,
          is_active: true,
        },
      ],
      [],
      [],
      [],
    );

    const result = await consumeReset("some-token", "newpassword123");

    expect(result).toBe("ok");
    expect(mocks.hashPasswordMock).toHaveBeenCalledWith("newpassword123");
    expect(mocks.txTag.calls).toHaveLength(4);

    const markTokenUsedCall = mocks.txTag.calls[1];
    expect(markTokenUsedCall.text).toContain("UPDATE password_reset_tokens");
    expect(markTokenUsedCall.text).toContain("used_at = NOW()");

    const updateUserCall = mocks.txTag.calls[2];
    expect(updateUserCall.text).toContain("UPDATE users");
    expect(updateUserCall.text).toContain("password_hash");

    const deleteSessionsCall = mocks.txTag.calls[3];
    expect(deleteSessionsCall.text).toContain("DELETE FROM sessions");
    expect(deleteSessionsCall.values).toContain(42);
  });
});

/**
 * Maps internal Hamilton/provider errors to customer-safe copy.
 * Never surfaces provider names, credit/billing detail, or internal
 * diagnostic strings — those stay in server logs and agent run events.
 */

import { CONTACT_EMAIL } from "@/lib/constants";

export type CustomerErrorCode = "paused" | "budget" | "rate_limit" | "provider" | "unknown";

export interface CustomerFacingError {
  message: string;
  code: CustomerErrorCode;
}

export const PAUSED_MESSAGE =
  `Hamilton analysis is paused for maintenance. Your data is safe — try again shortly or email ${CONTACT_EMAIL}.`;
const BUSY_MESSAGE = "Hamilton is busy right now. Please retry in a minute.";
const PROVIDER_UNREACHABLE_MESSAGE = "Hamilton couldn't reach its analysis engine. Please retry.";
const GENERIC_MESSAGE = "Something went wrong generating this. Please retry.";

// Matches both EmergencyStopActiveError ("...credit balance is too low")
// and ProviderCircuitOpenError ("Provider circuit is open: latest Anthropic
// credit-balance failure...") — in this codebase both only ever fire for the
// same underlying condition (provider credit exhausted), so both read to the
// customer as the same "paused for maintenance" state.
const CREDIT_EXHAUSTION_PATTERN = /credit[- ]?balance|circuit is open/i;

export function toCustomerFacingError(err: unknown): CustomerFacingError {
  const raw = err instanceof Error ? err.message : String(err);

  if (/Emergency stop/i.test(raw)) {
    return { code: "paused", message: PAUSED_MESSAGE };
  }
  if (CREDIT_EXHAUSTION_PATTERN.test(raw)) {
    return { code: "paused", message: PAUSED_MESSAGE };
  }
  if (/budget|blocked/i.test(raw)) {
    return { code: "budget", message: PAUSED_MESSAGE };
  }
  if (/rate limit|429/i.test(raw)) {
    return { code: "rate_limit", message: BUSY_MESSAGE };
  }
  if (/provider|anthropic|api_error/i.test(raw)) {
    return { code: "provider", message: PROVIDER_UNREACHABLE_MESSAGE };
  }
  return { code: "unknown", message: GENERIC_MESSAGE };
}

export interface ChatErrorBody {
  error: string;
  code?: string;
}

/**
 * Parse the JSON error body that @ai-sdk/react's HttpChatTransport surfaces
 * as `Error.message` when the chat API responds with a non-2xx status (the
 * transport does `throw new Error(await response.text())`). Returns null for
 * anything that isn't a JSON object with a string `error` field, so callers
 * can fall back to toCustomerFacingError on the raw error.
 */
export function parseChatErrorBody(message: string): ChatErrorBody | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(message);
  } catch {
    return null;
  }
  if (
    typeof parsed !== "object"
    || parsed === null
    || Array.isArray(parsed)
    || typeof (parsed as { error?: unknown }).error !== "string"
  ) {
    return null;
  }
  const code = (parsed as { code?: unknown }).code;
  return {
    error: (parsed as { error: string }).error,
    code: typeof code === "string" ? code : undefined,
  };
}

export type ThesisStatusOnFailure = "paused" | "unavailable";

/**
 * Classify a thesis-generation failure message as a known, temporary pause
 * (automation control engaged) vs. any other failure. Shared by home-data.ts
 * so the same "Emergency stop" detection rule is used everywhere.
 */
export function deriveThesisStatus(errorMessage: string): ThesisStatusOnFailure {
  return /Emergency stop/i.test(errorMessage) ? "paused" : "unavailable";
}

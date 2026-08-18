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

const PAUSED_MESSAGE =
  `Hamilton analysis is paused for maintenance. Your data is safe — try again shortly or email ${CONTACT_EMAIL}.`;
const BUSY_MESSAGE = "Hamilton is busy right now. Please retry in a minute.";
const PROVIDER_UNREACHABLE_MESSAGE = "Hamilton couldn't reach its analysis engine. Please retry.";
const GENERIC_MESSAGE = "Something went wrong generating this. Please retry.";

export function toCustomerFacingError(err: unknown): CustomerFacingError {
  const raw = err instanceof Error ? err.message : String(err);

  if (/Emergency stop/i.test(raw)) {
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

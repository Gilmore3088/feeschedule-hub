export type RegisterErrorKind = "stripe" | "db" | "duplicate";

export const REGISTER_FALLBACK_CTA = {
  href: "/contact?type=pro",
  label: "Email us and we'll set up your seat by hand",
} as const;

export function registerErrorMessage(kind: RegisterErrorKind): string {
  switch (kind) {
    case "stripe":
      return "We couldn't create your billing account just now. Nothing was charged.";
    case "db":
      return "We couldn't save your account. Please try again in a minute.";
    case "duplicate":
      return "An account with this email already exists.";
  }
}

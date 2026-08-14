export function sanitizeInternalRedirect(
  value: string | null | undefined,
  fallback: string,
): string {
  if (!value?.startsWith("/") || value.startsWith("//")) return fallback;

  try {
    const base = new URL("https://internal.invalid");
    const destination = new URL(value, base);
    if (destination.origin !== base.origin) return fallback;
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return fallback;
  }
}

export function resolvePostLoginRedirect(
  destination: string,
  role: string | null | undefined,
): string {
  if (role === "admin" || role === "analyst") {
    return destination.startsWith("/admin") || destination.startsWith("/pro")
      ? destination
      : "/admin";
  }

  return destination.startsWith("/admin") ? "/account" : destination;
}

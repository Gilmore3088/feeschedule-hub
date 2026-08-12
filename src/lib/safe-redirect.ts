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

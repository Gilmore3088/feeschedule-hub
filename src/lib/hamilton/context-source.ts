export type HamiltonContextSource =
  | "url"
  | "manual"
  | "profile"
  | "watchlist"
  | "artifact"
  | "none";
export type HamiltonPersistedContextSource = Exclude<
  HamiltonContextSource,
  "artifact" | "none"
>;

const PERSISTED_SOURCES = new Set<HamiltonPersistedContextSource>([
  "url",
  "manual",
  "profile",
  "watchlist",
]);

export function normalizeHamiltonContextSource(
  value: unknown,
  fallback: HamiltonContextSource = "none",
): HamiltonContextSource {
  if (
    value === "url" ||
    value === "manual" ||
    value === "profile" ||
    value === "watchlist" ||
    value === "artifact" ||
    value === "none"
  ) {
    return value;
  }
  return fallback;
}

export function normalizeHamiltonPersistedContextSource(
  value: unknown,
  fallback: HamiltonPersistedContextSource = "manual",
): HamiltonPersistedContextSource {
  const normalized = normalizeHamiltonContextSource(value, fallback);
  return PERSISTED_SOURCES.has(normalized as HamiltonPersistedContextSource)
    ? (normalized as HamiltonPersistedContextSource)
    : fallback;
}

export function getHamiltonContextSourceLabel(
  source: HamiltonContextSource | null | undefined,
  selectedFromUrl = false,
): string | null {
  if (source === "url") return "URL selected";
  if (source === "manual") return "Manual";
  if (source === "profile") return "Profile";
  if (source === "watchlist") return "Watchlist";
  if (source === "artifact") return "Saved artifact";
  return selectedFromUrl ? "Selected" : null;
}

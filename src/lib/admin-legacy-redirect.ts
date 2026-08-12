export type AdminSearchParams = Record<
  string,
  string | string[] | undefined
>;

/** Build a canonical admin URL without dropping filters from an old bookmark. */
export function buildLegacyAdminPath(
  destination: string,
  searchParams: AdminSearchParams,
  defaults: AdminSearchParams = {},
): string {
  const [pathAndQuery, fragment] = destination.split("#", 2);
  const [pathname, existingQuery] = pathAndQuery.split("?", 2);
  const query = new URLSearchParams(existingQuery ?? "");

  appendValues(query, defaults, false);
  appendValues(query, searchParams, true);

  const serialized = query.toString();
  return `${pathname}${serialized ? `?${serialized}` : ""}${fragment ? `#${fragment}` : ""}`;
}

function appendValues(
  query: URLSearchParams,
  values: AdminSearchParams,
  replace: boolean,
): void {
  for (const [key, rawValue] of Object.entries(values)) {
    if (rawValue === undefined) continue;
    if (replace) query.delete(key);

    const entries = Array.isArray(rawValue) ? rawValue : [rawValue];
    for (const value of entries) query.append(key, value);
  }
}

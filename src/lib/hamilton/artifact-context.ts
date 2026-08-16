import { normalizeCanonicalInstitutionId } from "@/lib/hamilton/context-link";

export type HamiltonArtifactContextLookup =
  | { kind: "analysis"; artifactId: string }
  | { kind: "scenario"; artifactId: string }
  | { kind: "report"; artifactId: string };

function cleanArtifactId(value: string | null): string | null {
  const text = value?.trim();
  return text || null;
}

export function resolveArtifactContextInstitutionId(params: {
  urlInstitutionId?: string | null;
  artifactInstitutionId?: string | number | null;
}): string | undefined {
  if (params.urlInstitutionId) return params.urlInstitutionId;
  return normalizeCanonicalInstitutionId(params.artifactInstitutionId) ?? undefined;
}

export function shouldPersistUrlInstitutionSelection(
  urlInstitutionId?: string | null,
): boolean {
  return Boolean(urlInstitutionId);
}

export function getHamiltonArtifactContextLookup(params: {
  pathname: string;
  searchParams: URLSearchParams;
}): HamiltonArtifactContextLookup | null {
  if (cleanArtifactId(params.searchParams.get("instId"))) return null;

  if (params.pathname === "/pro/analyze") {
    const artifactId = cleanArtifactId(params.searchParams.get("analysis"));
    return artifactId ? { kind: "analysis", artifactId } : null;
  }

  if (params.pathname === "/pro/simulate") {
    const artifactId =
      cleanArtifactId(params.searchParams.get("scenario_id")) ??
      cleanArtifactId(params.searchParams.get("scenario"));
    return artifactId ? { kind: "scenario", artifactId } : null;
  }

  if (params.pathname === "/pro/reports") {
    const reportId =
      cleanArtifactId(params.searchParams.get("report_id")) ??
      cleanArtifactId(params.searchParams.get("report"));
    if (reportId) return { kind: "report", artifactId: reportId };

    const artifactId = cleanArtifactId(params.searchParams.get("scenario_id"));
    return artifactId ? { kind: "scenario", artifactId } : null;
  }

  return null;
}

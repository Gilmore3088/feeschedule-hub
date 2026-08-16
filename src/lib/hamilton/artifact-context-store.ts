import { sql } from "@/lib/data-store/connection";
import { normalizeCanonicalInstitutionId } from "@/lib/hamilton/context-link";
import type { HamiltonArtifactContextLookup } from "@/lib/hamilton/artifact-context";

export async function getHamiltonArtifactInstitutionId(params: {
  userId: number;
  lookup: HamiltonArtifactContextLookup | null;
}): Promise<string | null> {
  if (!params.lookup) return null;

  if (params.lookup.kind === "analysis") {
    const rows = await sql`
      SELECT institution_id
      FROM hamilton_saved_analyses
      WHERE id = ${params.lookup.artifactId}
        AND user_id = ${params.userId}
        AND status = 'active'
      LIMIT 1
    `;
    return normalizeCanonicalInstitutionId(rows[0]?.institution_id);
  }

  if (params.lookup.kind === "report") {
    const rows = await sql`
      SELECT institution_id
      FROM hamilton_reports
      WHERE id = ${params.lookup.artifactId}
        AND user_id = ${params.userId}
        AND status = 'generated'
      LIMIT 1
    `;
    return normalizeCanonicalInstitutionId(rows[0]?.institution_id);
  }

  const rows = await sql`
    SELECT institution_id
    FROM hamilton_scenarios
    WHERE id = ${params.lookup.artifactId}
      AND user_id = ${params.userId}
      AND status = 'active'
    LIMIT 1
  `;
  return normalizeCanonicalInstitutionId(rows[0]?.institution_id);
}

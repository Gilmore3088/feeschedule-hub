import { sql } from "@/lib/data-store/connection";
import {
  getHamiltonInstitutionContext,
  parseInstitutionId,
  type HamiltonSelectedInstitutionContext,
} from "@/lib/hamilton/institution-context";
import {
  normalizeHamiltonContextSource,
  normalizeHamiltonPersistedContextSource,
  type HamiltonContextSource,
  type HamiltonPersistedContextSource,
} from "@/lib/hamilton/context-source";

export type HamiltonWorkspaceContextSource = HamiltonPersistedContextSource;

export interface HamiltonWorkspaceContext {
  userId: number;
  selectedInstitutionId: number | null;
  selectedSource: HamiltonWorkspaceContextSource;
  lastIntent: string | null;
  updatedAt: string;
}

export interface ResolvedHamiltonInstitutionContext {
  institution: HamiltonSelectedInstitutionContext | null;
  error: string | null;
  source: HamiltonContextSource;
}

function normalizeSource(source: string | null | undefined): HamiltonWorkspaceContextSource {
  return normalizeHamiltonPersistedContextSource(source, "manual");
}

function cleanIntent(intent: string | null | undefined): string | null {
  const value = intent?.trim();
  return value ? value.slice(0, 120) : null;
}

export async function getHamiltonWorkspaceContext(
  userId: number,
): Promise<HamiltonWorkspaceContext | null> {
  const rows = await sql`
    SELECT user_id, selected_institution_id, selected_source, last_intent, updated_at
    FROM hamilton_workspace_contexts
    WHERE user_id = ${userId}
    LIMIT 1
  `;

  const row = rows[0];
  if (!row) return null;

  return {
    userId: Number(row.user_id),
    selectedInstitutionId:
      row.selected_institution_id == null ? null : Number(row.selected_institution_id),
    selectedSource: normalizeSource(String(row.selected_source ?? "manual")),
    lastIntent: row.last_intent == null ? null : String(row.last_intent),
    updatedAt: String(row.updated_at),
  };
}

export async function setHamiltonWorkspaceContext(params: {
  userId: number;
  institutionId: number;
  source?: HamiltonWorkspaceContextSource;
  intent?: string | null;
}): Promise<void> {
  await sql`
    INSERT INTO hamilton_workspace_contexts (
      user_id,
      selected_institution_id,
      selected_source,
      last_intent,
      created_at,
      updated_at
    ) VALUES (
      ${params.userId},
      ${params.institutionId},
      ${params.source ?? "manual"},
      ${cleanIntent(params.intent)},
      NOW(),
      NOW()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      selected_institution_id = EXCLUDED.selected_institution_id,
      selected_source = EXCLUDED.selected_source,
      last_intent = COALESCE(EXCLUDED.last_intent, hamilton_workspace_contexts.last_intent),
      updated_at = NOW()
  `;
}

export async function resolveHamiltonInstitutionContext(params: {
  userId: number;
  instId?: string | number | null;
  intent?: string | null;
  persistUrlSelection?: boolean;
  transientSource?: HamiltonContextSource;
}): Promise<ResolvedHamiltonInstitutionContext> {
  if (params.instId !== null && params.instId !== undefined && params.instId !== "") {
    const parsedId = parseInstitutionId(params.instId);
    if (!parsedId) {
      return { institution: null, error: "Invalid institution ID", source: "none" };
    }

    const resolved = await getHamiltonInstitutionContext(parsedId);
    if (!resolved.institution) {
      return { institution: null, error: resolved.error ?? "Institution not found", source: "none" };
    }

    if (params.persistUrlSelection !== false) {
      await setHamiltonWorkspaceContext({
        userId: params.userId,
        institutionId: resolved.institution.id,
        source: "url",
        intent: params.intent,
      }).catch(() => {});
    }

    return {
      institution: resolved.institution,
      error: null,
      source:
        params.persistUrlSelection === false
          ? normalizeHamiltonContextSource(params.transientSource, "url")
          : "url",
    };
  }

  const workspace = await getHamiltonWorkspaceContext(params.userId).catch(() => null);
  if (!workspace?.selectedInstitutionId) {
    return { institution: null, error: null, source: "none" };
  }

  const resolved = await getHamiltonInstitutionContext(workspace.selectedInstitutionId);
  return {
    institution: resolved.institution,
    error: resolved.error,
    source: resolved.institution ? workspace.selectedSource : "none",
  };
}

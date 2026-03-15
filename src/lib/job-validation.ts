/**
 * Validates and sanitizes job parameters before spawning crawler processes.
 * Strict allowlists prevent command injection.
 */

const ALLOWED_COMMANDS = new Set([
  "crawl",
  "discover",
  "validate",
  "categorize",
  "analyze",
  "enrich",
  "outlier-detect",
  "run-pipeline",
  "stats",
  "ingest-call-reports",
  "ingest-fdic",
  "ingest-ncua",
  "ingest-cfpb",
  "ingest-beige-book",
  "ingest-fed-content",
  "ingest-fred",
  "ingest-bls",
  "ingest-nyfed",
  "ingest-ofr",
  "ingest-sod",
  "ingest-census-acs",
  "ingest-census-tracts",
  "seed",
  "backfill-ncua-urls",
]);

const COMMANDS_REQUIRING_TARGET = new Set(["crawl", "discover"]);

const MAX_LIMIT = 500;
const MAX_CONCURRENT = 10;

export interface JobParams {
  target_id?: number;
  limit?: number;
  concurrent?: number;
  charter_type?: "bank" | "credit_union";
  force?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  sanitized?: { command: string; args: string[] };
}

export function validateJobRequest(
  command: string,
  params: JobParams,
): ValidationResult {
  if (!ALLOWED_COMMANDS.has(command)) {
    return { valid: false, error: `Unknown command: ${command}` };
  }

  if (COMMANDS_REQUIRING_TARGET.has(command) && !params.target_id && !params.limit) {
    return {
      valid: false,
      error: `Command '${command}' requires either target_id or limit`,
    };
  }

  const args: string[] = [];

  if (params.target_id !== undefined) {
    const id = Number(params.target_id);
    if (!Number.isInteger(id) || id < 1) {
      return { valid: false, error: "target_id must be a positive integer" };
    }
    args.push("--target-id", String(id));
  }

  if (params.limit !== undefined) {
    const limit = Number(params.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      return { valid: false, error: `limit must be 1-${MAX_LIMIT}` };
    }
    args.push("--limit", String(limit));
  }

  if (params.concurrent !== undefined) {
    const concurrent = Number(params.concurrent);
    if (!Number.isInteger(concurrent) || concurrent < 1 || concurrent > MAX_CONCURRENT) {
      return { valid: false, error: `concurrent must be 1-${MAX_CONCURRENT}` };
    }
    args.push("--concurrent", String(concurrent));
  }

  if (params.charter_type !== undefined) {
    if (params.charter_type !== "bank" && params.charter_type !== "credit_union") {
      return { valid: false, error: "charter_type must be 'bank' or 'credit_union'" };
    }
    args.push("--charter-type", params.charter_type);
  }

  if (params.force) {
    args.push("--force");
  }

  return { valid: true, sanitized: { command, args } };
}

export function getAllowedCommands(): string[] {
  return Array.from(ALLOWED_COMMANDS).sort();
}

export function commandRequiresTarget(command: string): boolean {
  return COMMANDS_REQUIRING_TARGET.has(command);
}

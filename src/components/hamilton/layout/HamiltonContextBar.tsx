import Link from "next/link";

interface InstitutionContext {
  name: string | null;
  type: string | null;
  assetTier: string | null;
}

interface HamiltonContextBarProps {
  institutionContext: InstitutionContext;
}

/**
 * HamiltonContextBar — Server component.
 * Displays the user's institutional context (name, type, asset tier).
 * If institution is not configured, prompts the user to set it up.
 * Per D-07 and D-14: institution context flows from user profile.
 */
export function HamiltonContextBar({ institutionContext }: HamiltonContextBarProps) {
  const { name, type, assetTier } = institutionContext;
  const hasInstitution = !!name;

  return (
    <div
      className="flex items-center justify-between px-6 py-2 text-sm border-b"
      style={{
        backgroundColor: "var(--hamilton-surface-elevated)",
        borderColor: "var(--hamilton-border)",
        minHeight: "40px",
      }}
    >
      {hasInstitution ? (
        <div className="flex items-center gap-3">
          <span
            className="font-semibold"
            style={{
              fontFamily: "var(--hamilton-font-serif)",
              color: "var(--hamilton-text-primary)",
            }}
          >
            {name}
          </span>

          {type && (
            <>
              <span style={{ color: "var(--hamilton-border-hover)" }}>|</span>
              <span style={{ color: "var(--hamilton-text-secondary)" }}>{type}</span>
            </>
          )}

          {assetTier && (
            <span
              className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded"
              style={{
                backgroundColor: "var(--hamilton-accent-subtle)",
                color: "var(--hamilton-text-accent)",
              }}
            >
              {assetTier}
            </span>
          )}
        </div>
      ) : (
        <Link
          href="/pro/settings"
          className="text-xs no-underline transition-colors hover:opacity-80"
          style={{ color: "var(--hamilton-text-secondary)" }}
        >
          Configure your institution in Settings
        </Link>
      )}

      <span
        className="text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: "var(--hamilton-text-tertiary)" }}
      >
        LTM
      </span>
    </div>
  );
}

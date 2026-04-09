import Link from "next/link";

interface InstitutionContext {
  name: string | null;
  type: string | null;
  assetTier: string | null;
  fedDistrict: number | null;
}

interface HamiltonContextBarProps {
  institutionContext: InstitutionContext;
}

/**
 * HamiltonContextBar — Server component.
 * Matches HTML prototype: Institution selector + Horizon dropdown + Analysis Focus pills.
 * Per D-07 and D-14: institution context flows from user profile.
 */
export function HamiltonContextBar({ institutionContext }: HamiltonContextBarProps) {
  const { name, type, assetTier, fedDistrict } = institutionContext;
  const hasInstitution = !!name;
  const institutionName = name ?? "Global Private Bank";

  return (
    <div
      className="flex items-center gap-10 px-12 py-3 border-b"
      style={{
        backgroundColor: "var(--hamilton-surface-container-lowest, #ffffff)",
        borderColor: "rgba(216,194,184,0.1)",
        minHeight: "52px",
      }}
    >
      {/* Institution selector */}
      <div className="flex flex-col">
        <label
          className="text-[9px] uppercase tracking-[0.1em] font-bold mb-0.5"
          style={{ color: "var(--hamilton-text-tertiary)" }}
        >
          Institution
        </label>
        {hasInstitution ? (
          <span
            className="text-xs font-bold"
            style={{ color: "var(--hamilton-text-primary)" }}
          >
            {institutionName}
            {type && (
              <span className="font-normal ml-1.5" style={{ color: "var(--hamilton-text-secondary)" }}>
                — {type}
              </span>
            )}
          </span>
        ) : (
          <Link
            href="/pro/settings"
            className="text-xs font-bold no-underline transition-colors hover:opacity-80"
            style={{ color: "var(--hamilton-text-accent)" }}
          >
            Configure institution
          </Link>
        )}
      </div>

      {/* Divider */}
      <div className="h-6 w-px" style={{ backgroundColor: "rgba(216,194,184,0.3)" }} />

      {/* Horizon selector */}
      <div className="flex flex-col">
        <label
          className="text-[9px] uppercase tracking-[0.1em] font-bold mb-0.5"
          style={{ color: "var(--hamilton-text-tertiary)" }}
        >
          Horizon
        </label>
        <span className="text-xs font-bold" style={{ color: "var(--hamilton-text-primary)" }}>
          LTM
        </span>
      </div>

      {/* Analysis Focus pills — pushed to right */}
      <div className="ml-auto flex flex-col items-end gap-1.5">
        <label
          className="text-[9px] uppercase tracking-[0.15em] font-bold"
          style={{ color: "var(--hamilton-text-tertiary)" }}
        >
          Analysis Focus
        </label>
        <div
          className="flex items-center rounded-lg p-1 border"
          style={{
            backgroundColor: "var(--hamilton-surface-container-high)",
            borderColor: "rgba(216,194,184,0.2)",
          }}
        >
          {["Pricing", "Risk", "Peer Position", "Trend"].map((focus, i) => (
            <span
              key={focus}
              className="px-4 py-1.5 rounded text-[10px] uppercase tracking-widest font-bold transition-colors"
              style={
                i === 0
                  ? {
                      backgroundColor: "var(--hamilton-surface-container-lowest, #ffffff)",
                      color: "var(--hamilton-primary)",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
                    }
                  : { color: "var(--hamilton-text-secondary)" }
              }
            >
              {focus}
            </span>
          ))}
        </div>
      </div>

      {/* Asset tier / district chips */}
      {(assetTier || fedDistrict) && (
        <div className="flex items-center gap-2">
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
          {fedDistrict && (
            <span
              className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded"
              style={{
                backgroundColor: "var(--hamilton-accent-subtle)",
                color: "var(--hamilton-text-accent)",
              }}
            >
              District {fedDistrict}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

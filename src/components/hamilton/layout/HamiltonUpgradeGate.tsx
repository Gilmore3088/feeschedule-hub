import Link from "next/link";

/**
 * HamiltonUpgradeGate — Server component.
 * Shown to non-subscribers in place of Hamilton content.
 * Renders within .hamilton-shell scope for correct CSS token inheritance.
 * Per D-09: upgrade gate is inside the shell aesthetic (warm parchment tones).
 */
export function HamiltonUpgradeGate() {
  return (
    <div
      className="hamilton-shell min-h-screen flex flex-col items-center justify-center px-8 py-24"
      style={{ backgroundColor: "var(--hamilton-surface)" }}
    >
      <div className="max-w-lg w-full text-center">
        <h1
          className="text-4xl font-bold tracking-tight"
          style={{
            fontFamily: "var(--hamilton-font-serif)",
            color: "var(--hamilton-text-primary)",
          }}
        >
          Hamil<span style={{ color: "var(--hamilton-accent)" }}>ton</span>
        </h1>

        <p
          className="mt-4 text-base leading-relaxed"
          style={{ color: "var(--hamilton-text-secondary)" }}
        >
          Fee intelligence for financial executives
        </p>

        <ul
          className="mt-8 space-y-3 text-left mx-auto max-w-sm"
          style={{ color: "var(--hamilton-text-secondary)" }}
        >
          {[
            "Analyze fee positioning against peer institutions",
            "Simulate revenue impact of fee changes",
            "Generate board-ready scenario summaries",
            "Monitor peer fee movements in real time",
          ].map((feature) => (
            <li key={feature} className="flex items-start gap-2 text-sm">
              <span
                className="mt-0.5 shrink-0 text-xs font-bold"
                style={{ color: "var(--hamilton-accent)" }}
              >
                &#x2713;
              </span>
              {feature}
            </li>
          ))}
        </ul>

        <p
          className="mt-8 text-sm font-semibold"
          style={{ color: "var(--hamilton-text-primary)" }}
        >
          $500/mo or $5,000/yr
        </p>

        <Link
          href="/subscribe?plan=hamilton"
          className="mt-6 inline-flex items-center justify-center rounded-lg px-8 py-3 text-sm font-semibold text-white no-underline transition-opacity hover:opacity-90"
          style={{ background: "var(--hamilton-gradient-cta)" }}
        >
          Start Your Trial
        </Link>

        <p
          className="mt-4 text-xs"
          style={{ color: "var(--hamilton-text-tertiary)" }}
        >
          Already a subscriber? Contact support.
        </p>
      </div>
    </div>
  );
}

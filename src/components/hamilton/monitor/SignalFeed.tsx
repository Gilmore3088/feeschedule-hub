/**
 * SignalFeed — Prototype-matched signal timeline.
 * Renders signal cards matching the HTML prototype structure:
 * - border-l-4 accent, signal type label, large serif institution name
 * - WHAT CHANGED / WHY IT MATTERS / RECOMMENDED NEXT MOVE sections
 * - EXECUTE burnished CTA button
 * Server component — no "use client".
 */

import type { SignalEntry, AlertEntry } from "@/lib/hamilton/home-data";

interface SignalFeedProps {
  signals: SignalEntry[];
  topAlert?: AlertEntry | null;
}

const SEVERITY_BORDER: Record<string, string> = {
  high: "var(--hamilton-primary)",
  medium: "#b45309",
  low: "var(--hamilton-outline)",
};

/** Derive a display institution name from signalType + title for seeded demo data */
function deriveInstitutionName(signal: SignalEntry): string {
  const titleWords = signal.title.split(/\s+/);
  // If title looks like "Capital Trust & Co. — overdraft fee raised", extract the institution part
  const dashIdx = signal.title.indexOf("—");
  if (dashIdx > 0) return signal.title.slice(0, dashIdx).trim();
  // Otherwise use the first 3–4 title words as institution proxy
  return titleWords.slice(0, Math.min(4, titleWords.length)).join(" ");
}

/** Derive "what changed" from body (first sentence) */
function deriveWhatChanged(body: string): string {
  const firstSentence = body.split(/[.!?]/)[0];
  return firstSentence ? firstSentence.trim() + "." : body;
}

/** Derive "why it matters" from body (second sentence, if present) */
function deriveWhyItMatters(body: string): string | null {
  const sentences = body.split(/(?<=[.!?])\s+/);
  if (sentences.length < 2) return null;
  return sentences.slice(1).join(" ").trim();
}

/** Format signal type label from snake_case */
function formatSignalType(signalType: string): string {
  return signalType
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Format createdAt as short time string */
function formatTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    });
  } catch {
    return "";
  }
}

function SignalCard({ signal, isPriority }: { signal: SignalEntry; isPriority?: boolean }) {
  const borderColor = SEVERITY_BORDER[signal.severity.toLowerCase()] ?? SEVERITY_BORDER.low;
  const isHighSeverity = signal.severity.toLowerCase() === "high";
  const institutionName = deriveInstitutionName(signal);
  const whatChanged = deriveWhatChanged(signal.body);
  const whyItMatters = deriveWhyItMatters(signal.body);
  const timeLabel = formatTime(signal.createdAt);

  return (
    <article
      style={{
        backgroundColor: "var(--hamilton-surface-container-lowest, #ffffff)",
        padding: "2rem",
        borderLeft: `4px solid ${borderColor}`,
        transition: "transform 0.15s ease",
      }}
      className="signal-card-hover"
    >
      {/* Header row */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "1.5rem",
        }}
      >
        <div>
          {/* Signal type label */}
          <span
            className="font-label"
            style={{
              display: "block",
              fontFamily: "var(--hamilton-font-sans)",
              fontSize: "0.625rem",
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: isHighSeverity
                ? "var(--hamilton-primary)"
                : "var(--hamilton-text-tertiary)",
              marginBottom: "0.375rem",
            }}
          >
            {isPriority ? formatSignalType(signal.signalType) : formatSignalType(signal.signalType)}
          </span>

          {/* Institution name — large serif */}
          <h3
            className="font-headline"
            style={{
              fontFamily: "var(--hamilton-font-serif)",
              fontSize: "1.5rem",
              fontWeight: 400,
              color: "var(--hamilton-on-surface)",
              lineHeight: 1.2,
            }}
          >
            {institutionName}
          </h3>
        </div>

        <time
          className="font-label"
          style={{
            fontFamily: "var(--hamilton-font-sans)",
            fontSize: "0.625rem",
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            color: "var(--hamilton-text-tertiary)",
            flexShrink: 0,
            marginLeft: "1rem",
          }}
        >
          {timeLabel}
        </time>
      </div>

      {/* Body sections */}
      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        {/* What Changed */}
        <div>
          <p
            className="font-label"
            style={{
              fontFamily: "var(--hamilton-font-sans)",
              fontSize: "0.625rem",
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              color: "var(--hamilton-text-tertiary)",
              marginBottom: "0.25rem",
              fontWeight: 600,
            }}
          >
            What Changed
          </p>
          <p
            style={{
              fontFamily: "var(--hamilton-font-sans)",
              fontSize: "0.9375rem",
              color: "var(--hamilton-on-surface)",
              lineHeight: 1.6,
            }}
          >
            {whatChanged}
          </p>
        </div>

        {/* Why It Matters — only if we have content */}
        {whyItMatters && (
          <div
            style={{
              backgroundColor: "var(--hamilton-surface-container-low, #f5f3ee)",
              padding: "1rem",
            }}
          >
            <p
              className="font-label"
              style={{
                fontFamily: "var(--hamilton-font-sans)",
                fontSize: "0.625rem",
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                color: "var(--hamilton-text-tertiary)",
                marginBottom: "0.25rem",
                fontWeight: 600,
              }}
            >
              Why It Matters
            </p>
            <p
              style={{
                fontFamily: "var(--hamilton-font-sans)",
                fontSize: "0.875rem",
                color: "var(--hamilton-on-surface)",
                fontStyle: "italic",
                lineHeight: 1.6,
              }}
            >
              {whyItMatters}
            </p>
          </div>
        )}

        {/* Recommended Next Move + Execute CTA */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            paddingTop: "1rem",
          }}
        >
          <div>
            <p
              className="font-label"
              style={{
                fontFamily: "var(--hamilton-font-sans)",
                fontSize: "0.625rem",
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                color: "var(--hamilton-text-tertiary)",
                marginBottom: "0.25rem",
                fontWeight: 600,
              }}
            >
              Recommended Next Move
            </p>
            <p
              style={{
                fontFamily: "var(--hamilton-font-sans)",
                fontSize: "0.875rem",
                color: "var(--hamilton-primary)",
                fontWeight: 600,
              }}
            >
              Review competitive position in{" "}
              {signal.signalType.replace(/_/g, " ").toLowerCase()}.
            </p>
          </div>

          <button
            className="burnished-cta"
            style={{
              padding: "0.5rem 1.5rem",
              background:
                "linear-gradient(to bottom right, var(--hamilton-primary), var(--hamilton-primary-container))",
              color: "#ffffff",
              borderRadius: "var(--hamilton-radius-lg, 0.5rem)",
              fontFamily: "var(--hamilton-font-sans)",
              fontSize: "0.75rem",
              fontWeight: 600,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              border: "none",
              cursor: "pointer",
              flexShrink: 0,
              marginLeft: "1.5rem",
            }}
          >
            Execute
          </button>
        </div>
      </div>
    </article>
  );
}

function ComplaintRiskCard({ signal }: { signal: SignalEntry }) {
  const whatChanged = deriveWhatChanged(signal.body);
  const institutionName = deriveInstitutionName(signal);
  const timeLabel = formatTime(signal.createdAt);

  return (
    <article
      style={{
        backgroundColor: "var(--hamilton-surface-container-lowest, #ffffff)",
        padding: "2rem",
        borderLeft: "4px solid var(--hamilton-outline-variant, #d8c2b8)",
        transition: "transform 0.15s ease",
      }}
      className="signal-card-hover"
    >
      {/* Header row */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "1.5rem",
        }}
      >
        <div>
          <span
            className="font-label"
            style={{
              display: "block",
              fontFamily: "var(--hamilton-font-sans)",
              fontSize: "0.625rem",
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--hamilton-text-tertiary)",
              marginBottom: "0.375rem",
            }}
          >
            {formatSignalType(signal.signalType)}
          </span>
          <h3
            className="font-headline"
            style={{
              fontFamily: "var(--hamilton-font-serif)",
              fontSize: "1.5rem",
              fontWeight: 400,
              color: "var(--hamilton-on-surface)",
              lineHeight: 1.2,
            }}
          >
            {institutionName}
          </h3>
        </div>
        <time
          className="font-label"
          style={{
            fontFamily: "var(--hamilton-font-sans)",
            fontSize: "0.625rem",
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            color: "var(--hamilton-text-tertiary)",
            flexShrink: 0,
            marginLeft: "1rem",
          }}
        >
          {timeLabel}
        </time>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        {/* What Changed + Risk Score badge side-by-side */}
        <div style={{ display: "flex", gap: "1rem" }}>
          <div style={{ flex: 1 }}>
            <p
              className="font-label"
              style={{
                fontFamily: "var(--hamilton-font-sans)",
                fontSize: "0.625rem",
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                color: "var(--hamilton-text-tertiary)",
                marginBottom: "0.25rem",
                fontWeight: 600,
              }}
            >
              What Changed
            </p>
            <p
              style={{
                fontFamily: "var(--hamilton-font-sans)",
                fontSize: "0.9375rem",
                color: "var(--hamilton-on-surface)",
                lineHeight: 1.6,
              }}
            >
              {whatChanged}
            </p>
          </div>

          {/* Risk Score badge */}
          <div
            style={{
              width: "33%",
              backgroundColor: "var(--hamilton-tertiary-fixed, #f6decd)",
              color: "var(--hamilton-on-tertiary-fixed, #25190f)",
              padding: "1rem",
              textAlign: "center",
              borderRadius: "var(--hamilton-radius-md, 0.25rem)",
              flexShrink: 0,
            }}
          >
            <div
              className="font-label"
              style={{
                fontFamily: "var(--hamilton-font-sans)",
                fontSize: "0.6875rem",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                marginBottom: "0.25rem",
              }}
            >
              Risk Score
            </div>
            <div
              className="font-headline"
              style={{
                fontFamily: "var(--hamilton-font-serif)",
                fontSize: "1.75rem",
                fontStyle: "italic",
                lineHeight: 1,
              }}
            >
              Elevated
            </div>
          </div>
        </div>

        {/* Recommended Next Move */}
        <div>
          <p
            className="font-label"
            style={{
              fontFamily: "var(--hamilton-font-sans)",
              fontSize: "0.625rem",
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              color: "var(--hamilton-text-tertiary)",
              marginBottom: "0.25rem",
              fontWeight: 600,
            }}
          >
            Recommended Next Move
          </p>
          <p
            style={{
              fontFamily: "var(--hamilton-font-sans)",
              fontSize: "0.875rem",
              color: "var(--hamilton-primary)",
              fontWeight: 600,
            }}
          >
            Request automated variance report from Compliance.
          </p>
        </div>
      </div>
    </article>
  );
}

function EmptyState() {
  return (
    <p
      style={{
        fontFamily: "var(--hamilton-font-sans)",
        fontSize: "0.875rem",
        lineHeight: 1.6,
        color: "var(--hamilton-text-secondary)",
        padding: "2rem 0",
      }}
    >
      No signals yet. As Hamilton detects fee movements and regulatory changes,
      they will appear here.
    </p>
  );
}

export function SignalFeed({ signals, topAlert }: SignalFeedProps) {
  // Merge topAlert into feed if present and not already included
  const allSignals: SignalEntry[] = [...signals];
  if (topAlert && !allSignals.find((s) => s.id === topAlert.signalId)) {
    allSignals.unshift({
      id: topAlert.signalId,
      signalType: "institutional_deviation",
      severity: topAlert.severity,
      title: topAlert.title,
      body: topAlert.body,
      createdAt: topAlert.createdAt,
    });
  }

  if (allSignals.length === 0) return <EmptyState />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      {allSignals.map((signal, index) => {
        const signalTypeLower = signal.signalType.toLowerCase();
        const isComplaintRisk =
          signalTypeLower.includes("complaint") ||
          signalTypeLower.includes("risk") ||
          signalTypeLower.includes("regulatory");

        if (isComplaintRisk && index > 0) {
          return <ComplaintRiskCard key={signal.id} signal={signal} />;
        }

        return (
          <SignalCard
            key={signal.id}
            signal={signal}
            isPriority={index === 0}
          />
        );
      })}
    </div>
  );
}

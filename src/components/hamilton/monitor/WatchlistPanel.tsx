/**
 * WatchlistPanel — right sidebar for canonical institution monitoring.
 * Sections:
 *   1. Watchlist Integrity — tracked institutions with status dots
 *   2. Queued Refresh Work — report, scenario, and watchlist rerun prompts
 *   3. Monitoring Posture — evidence and provider-work status
 *
 * Interactive add/remove is a client sub-component.
 */

"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { addToWatchlist, removeFromWatchlist } from "@/app/pro/(hamilton)/monitor/actions";
import type { WatchlistEntry } from "@/lib/hamilton/monitor-data";
import type { HamiltonRefreshJobEntry } from "@/lib/hamilton/refresh-jobs";
import type { HamiltonSelectedInstitutionContext } from "@/lib/hamilton/institution-context";

interface WatchlistPanelProps {
  entries: WatchlistEntry[];
  refreshJobs?: HamiltonRefreshJobEntry[];
  selectedInstitution?: HamiltonSelectedInstitutionContext | null;
}

interface InstitutionSearchResult {
  id: number;
  institution_name: string;
  city: string | null;
  state_code: string | null;
  charter_type: string | null;
  asset_size_tier: string | null;
  published_fee_count: number;
  provisional_fee_count: number;
  fee_publication_label: string;
}

// ---------------------------------------------------------------------------
// Status config matching prototype icons
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<
  WatchlistEntry["status"],
  { icon: React.ReactNode; label: string }
> = {
  current: {
    icon: (
      <span
        style={{
          fontSize: "1.25rem",
          color: "#16a34a",
          lineHeight: 1,
        }}
        title="Renewal status: Secure"
      >
        ✓
      </span>
    ),
    label: "RENEWAL STATUS: SECURE",
  },
  review_due: {
    icon: (
      <span
        style={{
          fontSize: "1.25rem",
          color: "#b45309",
          lineHeight: 1,
        }}
        title="Renewal status: In Review"
      >
        ◷
      </span>
    ),
    label: "RENEWAL STATUS: IN REVIEW",
  },
  unknown: {
    icon: (
      <span
        style={{
          fontSize: "1.25rem",
          color: "#a8a29e",
          lineHeight: 1,
        }}
        title="Renewal status: Unknown"
      >
        ○
      </span>
    ),
    label: "RENEWAL STATUS: UNKNOWN",
  },
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function institutionLocation(result: InstitutionSearchResult): string {
  return [result.city, result.state_code].filter(Boolean).join(", ");
}

function WatchlistIntegrity({
  entries,
  onRemove,
  isPending,
}: {
  entries: WatchlistEntry[];
  onRemove: (id: string) => void;
  isPending: boolean;
}) {
  return (
    <div>
      <h2
        style={{
          fontFamily: "var(--hamilton-font-sans)",
          fontSize: "0.625rem",
          textTransform: "uppercase",
          letterSpacing: "0.2em",
          color: "var(--hamilton-text-tertiary)",
          fontWeight: 600,
          marginBottom: "1.5rem",
        }}
      >
        Watchlist Integrity
      </h2>

      {entries.length === 0 ? (
        <p
          style={{
            fontFamily: "var(--hamilton-font-sans)",
            fontSize: "0.875rem",
            color: "var(--hamilton-text-secondary)",
            lineHeight: 1.6,
            paddingBottom: "0.5rem",
          }}
        >
          No institutions tracked. Add one below to begin monitoring.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {entries.map((entry) => {
            const { icon, label } = STATUS_CONFIG[entry.status];
            return (
              <div
                key={entry.institutionId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "1rem",
                  backgroundColor: "var(--hamilton-surface-container-low, #f5f3ee)",
                  transition: "background-color 0.15s ease",
                }}
                className="watchlist-row-hover"
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      fontFamily: "var(--hamilton-font-sans)",
                      fontSize: "0.875rem",
                      fontWeight: 600,
                      color: "var(--hamilton-on-surface)",
                      marginBottom: "0.125rem",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {entry.displayName}
                  </p>
                  <p
                    style={{
                      fontFamily: "var(--hamilton-font-sans)",
                      fontSize: "0.625rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      color: "var(--hamilton-text-tertiary)",
                    }}
                  >
                    {label}
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexShrink: 0 }}>
                  {icon}
                  <Link
                    href={`/pro/analyze?instId=${entry.institutionId}&intent=watchlist`}
                    style={{
                      fontSize: "0.6875rem",
                      color: "var(--hamilton-primary)",
                      textDecoration: "none",
                      fontWeight: 600,
                    }}
                  >
                    Analyze
                  </Link>
                  <button
                    onClick={() => onRemove(entry.institutionId)}
                    disabled={isPending}
                    style={{
                      fontSize: "0.6875rem",
                      color: "var(--hamilton-text-tertiary)",
                      background: "none",
                      border: "none",
                      cursor: isPending ? "not-allowed" : "pointer",
                      padding: 0,
                      opacity: isPending ? 0.5 : 1,
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function refreshJobLabel(jobType: HamiltonRefreshJobEntry["jobType"]): string {
  if (jobType === "report_refresh") return "Report refresh";
  if (jobType === "scenario_refresh") return "Scenario refresh";
  return "Watchlist review";
}

function refreshJobHref(job: HamiltonRefreshJobEntry): string {
  const params = new URLSearchParams({ instId: job.institutionId });
  if (job.jobType === "report_refresh") {
    params.set("intent", "refresh-queue");
    return `/pro/reports?${params.toString()}`;
  }
  if (job.jobType === "scenario_refresh") {
    params.set("intent", "refresh-queue");
    return `/pro/simulate?${params.toString()}`;
  }
  return `/pro/monitor?${params.toString()}`;
}

function refreshJobEvidenceLabel(policy: HamiltonRefreshJobEntry["evidencePolicy"]): string | null {
  if (!policy) return null;
  if (policy === "verified-only") return "Verified-only";
  if (policy === "provisional-first") return "Provisional-first";
  if (policy === "source-diligence") return "Source diligence";
  return null;
}

function RefreshJobQueue({ jobs }: { jobs: HamiltonRefreshJobEntry[] }) {
  return (
    <div>
      <h2
        style={{
          fontFamily: "var(--hamilton-font-sans)",
          fontSize: "0.625rem",
          textTransform: "uppercase",
          letterSpacing: "0.2em",
          color: "var(--hamilton-text-tertiary)",
          fontWeight: 600,
          marginBottom: "1.5rem",
        }}
      >
        Queued Refresh Work
      </h2>

      {jobs.length === 0 ? (
        <p
          style={{
            fontFamily: "var(--hamilton-font-sans)",
            fontSize: "0.875rem",
            color: "var(--hamilton-text-secondary)",
            lineHeight: 1.6,
          }}
        >
          No report, scenario, or watchlist refresh work is queued for this scope.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {jobs.map((job) => (
            <div
              key={job.id}
              style={{
                padding: "1rem",
                border: "1px solid var(--hamilton-outline-variant, #d8c2b8)",
                backgroundColor: "var(--hamilton-surface-container-lowest, #ffffff)",
              }}
            >
              <p
                style={{
                  fontFamily: "var(--hamilton-font-sans)",
                  fontSize: "0.625rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                  color: "var(--hamilton-primary)",
                  fontWeight: 700,
                  marginBottom: "0.375rem",
                }}
              >
                {refreshJobLabel(job.jobType)}
              </p>
              <p
                style={{
                  fontFamily: "var(--hamilton-font-sans)",
                  fontSize: "0.8125rem",
                  color: "var(--hamilton-on-surface)",
                  lineHeight: 1.45,
                  marginBottom: "0.75rem",
                }}
              >
                {job.reason}
              </p>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.375rem",
                  marginBottom: "0.75rem",
                }}
              >
                {refreshJobEvidenceLabel(job.evidencePolicy) && (
                  <span
                    style={{
                      border: "1px solid var(--hamilton-outline-variant, #d8c2b8)",
                      borderRadius: "999px",
                      color: "var(--hamilton-text-tertiary)",
                      fontFamily: "var(--hamilton-font-sans)",
                      fontSize: "0.5625rem",
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      padding: "0.125rem 0.375rem",
                      textTransform: "uppercase",
                    }}
                  >
                    {refreshJobEvidenceLabel(job.evidencePolicy)}
                  </span>
                )}
                <span
                  style={{
                    border: "1px solid var(--hamilton-outline-variant, #d8c2b8)",
                    borderRadius: "999px",
                    color: job.providerCallQueued ? "#991b1b" : "var(--hamilton-text-tertiary)",
                    fontFamily: "var(--hamilton-font-sans)",
                    fontSize: "0.5625rem",
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    padding: "0.125rem 0.375rem",
                    textTransform: "uppercase",
                  }}
                >
                  {job.providerCallQueued ? "Provider queued" : "Manual rerun"}
                </span>
                {!job.providerCallQueued && (
                  <span
                    style={{
                      border: "1px solid var(--hamilton-outline-variant, #d8c2b8)",
                      borderRadius: "999px",
                      color: "var(--hamilton-text-tertiary)",
                      fontFamily: "var(--hamilton-font-sans)",
                      fontSize: "0.5625rem",
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      padding: "0.125rem 0.375rem",
                      textTransform: "uppercase",
                    }}
                  >
                    No provider queued
                  </span>
                )}
              </div>
              <Link
                href={refreshJobHref(job)}
                style={{
                  fontFamily: "var(--hamilton-font-sans)",
                  fontSize: "0.6875rem",
                  color: "var(--hamilton-primary)",
                  textDecoration: "none",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                Open Workflow
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MonitoringPostureCard({
  entries,
  refreshJobs,
}: {
  entries: WatchlistEntry[];
  refreshJobs: HamiltonRefreshJobEntry[];
}) {
  const providerQueuedCount = refreshJobs.filter((job) => job.providerCallQueued).length;
  const manualRerunCount = refreshJobs.length - providerQueuedCount;
  const postureItems = [
    { label: "Canonical IDs", value: String(entries.length) },
    { label: "Manual reruns", value: String(manualRerunCount) },
    { label: "Provider queued", value: String(providerQueuedCount) },
  ];

  return (
    <div
      style={{
        position: "relative",
        overflow: "hidden",
        borderRadius: "var(--hamilton-radius-lg, 0.5rem)",
        border: "1px solid var(--hamilton-outline-variant, #d8c2b8)",
        backgroundColor: "var(--hamilton-surface-container-lowest, #ffffff)",
        padding: "1rem",
      }}
    >
      <p
        style={{
          fontFamily: "var(--hamilton-font-sans)",
          fontSize: "0.625rem",
          textTransform: "uppercase",
          letterSpacing: "0.2em",
          color: "var(--hamilton-text-tertiary)",
          fontWeight: 700,
          marginBottom: "0.875rem",
        }}
      >
        Monitoring Posture
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: "0.5rem",
          marginBottom: "0.875rem",
        }}
      >
        {postureItems.map((item) => (
          <div
            key={item.label}
            style={{
              minWidth: 0,
              border: "1px solid var(--hamilton-outline-variant, #d8c2b8)",
              backgroundColor: "var(--hamilton-surface-container-low, #f5f3ee)",
              padding: "0.625rem",
            }}
          >
            <span
              style={{
                display: "block",
                fontFamily: "var(--hamilton-font-sans)",
                fontSize: "0.5625rem",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--hamilton-text-tertiary)",
                marginBottom: "0.25rem",
              }}
            >
              {item.label}
            </span>
            <span
              style={{
                display: "block",
                fontFamily: "var(--hamilton-font-sans)",
                fontSize: "1rem",
                fontWeight: 800,
                color: "var(--hamilton-on-surface)",
              }}
            >
              {item.value}
            </span>
          </div>
        ))}
      </div>
      <p
        style={{
          fontFamily: "var(--hamilton-font-sans)",
          fontSize: "0.75rem",
          color: "var(--hamilton-text-secondary)",
          lineHeight: 1.5,
        }}
      >
        Monitor work stays tied to matched institutions, evidence-policy labels, and manual reruns unless
        provider work is explicitly queued.
      </p>
    </div>
  );
}

function SelectedInstitutionPrompt({
  selectedInstitution,
  isTracked,
  onWatch,
  isPending,
}: {
  selectedInstitution: HamiltonSelectedInstitutionContext;
  isTracked: boolean;
  onWatch: () => void;
  isPending: boolean;
}) {
  return (
    <div
      style={{
        padding: "1rem",
        border: "1px solid var(--hamilton-outline-variant, #d8c2b8)",
        backgroundColor: "var(--hamilton-surface-container-lowest, #ffffff)",
      }}
    >
      <p
        style={{
          fontFamily: "var(--hamilton-font-sans)",
          fontSize: "0.625rem",
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          color: "var(--hamilton-text-tertiary)",
          fontWeight: 700,
          marginBottom: "0.5rem",
        }}
      >
        Selected Institution
      </p>
      <p
        style={{
          fontFamily: "var(--hamilton-font-sans)",
          fontSize: "0.9375rem",
          fontWeight: 700,
          color: "var(--hamilton-on-surface)",
          lineHeight: 1.3,
          marginBottom: "0.375rem",
        }}
      >
        {selectedInstitution.name}
      </p>
      <p
        style={{
          fontFamily: "var(--hamilton-font-sans)",
          fontSize: "0.75rem",
          color: "var(--hamilton-text-secondary)",
          lineHeight: 1.5,
          marginBottom: "0.875rem",
        }}
      >
        ID {selectedInstitution.id}
        {[selectedInstitution.city, selectedInstitution.stateCode].filter(Boolean).length > 0
          ? ` · ${[selectedInstitution.city, selectedInstitution.stateCode].filter(Boolean).join(", ")}`
          : ""}{" "}
        · {selectedInstitution.feePublicationLabel} · {selectedInstitution.publishedFeeCount} verified ·{" "}
        {selectedInstitution.provisionalFeeCount} provisional
      </p>
      <button
        type="button"
        onClick={onWatch}
        disabled={isPending || isTracked}
        style={{
          width: "100%",
          fontFamily: "var(--hamilton-font-sans)",
          fontSize: "0.75rem",
          fontWeight: 600,
          padding: "0.625rem 1rem",
          background: isTracked
            ? "var(--hamilton-surface-container-low, #f5f3ee)"
            : "linear-gradient(to bottom right, var(--hamilton-primary), var(--hamilton-primary-container))",
          color: isTracked ? "var(--hamilton-text-secondary)" : "#ffffff",
          border: "1px solid var(--hamilton-outline-variant, #d8c2b8)",
          borderRadius: "var(--hamilton-radius-md, 0.25rem)",
          cursor: isPending || isTracked ? "not-allowed" : "pointer",
          opacity: isPending ? 0.6 : 1,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {isTracked ? "Already Watched" : "Watch Selected Institution"}
      </button>
    </div>
  );
}

function InstitutionSearchAdd({
  onAdd,
  isPending,
  error,
}: {
  onAdd: (result: InstitutionSearchResult) => void;
  isPending: boolean;
  error: string | null;
}) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<InstitutionSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);

  function updateQuery(value: string) {
    setQuery(value);
    setShowSuggestions(value.trim().length >= 2);
  }

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setSearchError(null);
      setIsSearching(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setIsSearching(true);
      setSearchError(null);
      try {
        const response = await fetch(`/api/institutions?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(
            response.status === 429
              ? "Search is rate limited. Try again shortly."
              : "Search failed.",
          );
        }
        const rows = (await response.json()) as InstitutionSearchResult[];
        setSuggestions(rows);
        setShowSuggestions(true);
      } catch (fetchError) {
        if (controller.signal.aborted) return;
        setSuggestions([]);
        setSearchError(fetchError instanceof Error ? fetchError.message : "Search failed.");
      } finally {
        if (!controller.signal.aborted) setIsSearching(false);
      }
    }, 220);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [query]);

  return (
    <div
      style={{
        paddingTop: "1rem",
        borderTop: "1px solid var(--hamilton-outline-variant, #d8c2b8)",
      }}
    >
      <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <input
          type="search"
          value={query}
          onChange={(e) => updateQuery(e.target.value)}
          onFocus={() => query.trim().length >= 2 && setShowSuggestions(true)}
          onBlur={() => window.setTimeout(() => setShowSuggestions(false), 160)}
          placeholder="Search institution to watch"
          disabled={isPending}
          style={{
            width: "100%",
            fontFamily: "var(--hamilton-font-sans)",
            fontSize: "0.8125rem",
            padding: "0.5rem 0.75rem",
            border: "1px solid var(--hamilton-outline-variant, #d8c2b8)",
            borderRadius: "var(--hamilton-radius-md, 0.25rem)",
            backgroundColor: "var(--hamilton-surface-container-lowest, #ffffff)",
            color: "var(--hamilton-on-surface)",
            outline: "none",
            minWidth: 0,
          }}
        />
        <p
          style={{
            fontFamily: "var(--hamilton-font-sans)",
            fontSize: "0.6875rem",
            color: "var(--hamilton-text-tertiary)",
            lineHeight: 1.5,
          }}
        >
          Choose a matched result so Monitor stores the canonical institution ID.
        </p>

        {showSuggestions && (suggestions.length > 0 || isSearching || searchError) && (
          <div
            style={{
              position: "absolute",
              top: "2.45rem",
              left: 0,
              right: 0,
              zIndex: 20,
              maxHeight: "18rem",
              overflowY: "auto",
              border: "1px solid var(--hamilton-outline-variant, #d8c2b8)",
              borderRadius: "var(--hamilton-radius-md, 0.25rem)",
              backgroundColor: "#ffffff",
              boxShadow: "0 18px 45px rgba(55, 42, 35, 0.14)",
            }}
          >
            {isSearching && (
              <div
                style={{
                  padding: "0.75rem",
                  fontFamily: "var(--hamilton-font-sans)",
                  fontSize: "0.75rem",
                  color: "var(--hamilton-text-tertiary)",
                }}
              >
                Searching...
              </div>
            )}
            {searchError && (
              <div
                style={{
                  padding: "0.75rem",
                  fontFamily: "var(--hamilton-font-sans)",
                  fontSize: "0.75rem",
                  color: "var(--hamilton-error, #ba1a1a)",
                }}
              >
                {searchError}
              </div>
            )}
            {!isSearching && !searchError && suggestions.map((result) => (
              <button
                key={result.id}
                type="button"
                onMouseDown={() => {
                  onAdd(result);
                  setQuery("");
                  setSuggestions([]);
                  setShowSuggestions(false);
                }}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "0.75rem",
                  border: "none",
                  borderBottom: "1px solid var(--hamilton-outline-variant, #d8c2b8)",
                  background: "#ffffff",
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <span
                  style={{
                    display: "block",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontFamily: "var(--hamilton-font-sans)",
                    fontSize: "0.8125rem",
                    fontWeight: 700,
                    color: "var(--hamilton-on-surface)",
                  }}
                >
                  {result.institution_name}
                </span>
                <span
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "0.5rem",
                    marginTop: "0.25rem",
                    fontFamily: "var(--hamilton-font-sans)",
                    fontSize: "0.6875rem",
                    color: "var(--hamilton-text-secondary)",
                  }}
                >
                  <span>ID {result.id}</span>
                  {institutionLocation(result) && <span>{institutionLocation(result)}</span>}
                  <span>{result.fee_publication_label}</span>
                  <span>{result.published_fee_count} verified</span>
                  <span>{result.provisional_fee_count} provisional</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      {error && (
        <p
          style={{
            fontFamily: "var(--hamilton-font-sans)",
            fontSize: "0.75rem",
            color: "var(--hamilton-error, #ba1a1a)",
            marginTop: "0.375rem",
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function WatchlistPanel({
  entries: initialEntries,
  refreshJobs = [],
  selectedInstitution,
}: WatchlistPanelProps) {
  const [entries, setEntries] = useState(initialEntries);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const selectedInstitutionId = selectedInstitution ? String(selectedInstitution.id) : null;
  const selectedIsTracked = selectedInstitutionId
    ? entries.some((entry) => entry.institutionId === selectedInstitutionId)
    : false;

  function handleAddInstitution(institutionId: string) {
    if (entries.some((entry) => entry.institutionId === institutionId)) {
      setError("Already tracking this institution.");
      return;
    }
    setError(null);

    startTransition(async () => {
      const result = await addToWatchlist(institutionId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const entry = result.entry;
      if (!entry) return;
      setEntries((prev) =>
        prev.some((existing) => existing.institutionId === entry.institutionId)
          ? prev
          : [...prev, entry],
      );
    });
  }

  function handleAddSearchResult(result: InstitutionSearchResult) {
    handleAddInstitution(String(result.id));
  }

  function handleWatchSelectedInstitution() {
    if (!selectedInstitution) return;
    handleAddInstitution(String(selectedInstitution.id));
  }

  function handleRemove(institutionId: string) {
    const removedEntry = entries.find((entry) => entry.institutionId === institutionId);
    setEntries((prev) => prev.filter((e) => e.institutionId !== institutionId));
    startTransition(async () => {
      const result = await removeFromWatchlist(institutionId);
      if (result.ok) return;
      if (removedEntry) {
        setEntries((prev) =>
          prev.some((entry) => entry.institutionId === removedEntry.institutionId)
            ? prev
            : [...prev, removedEntry],
        );
      }
      setError(result.error);
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "3rem" }}>
      {selectedInstitution && (
        <SelectedInstitutionPrompt
          selectedInstitution={selectedInstitution}
          isTracked={selectedIsTracked}
          onWatch={handleWatchSelectedInstitution}
          isPending={isPending}
        />
      )}

      {/* 1. Watchlist Integrity */}
      <WatchlistIntegrity
        entries={entries}
        onRemove={handleRemove}
        isPending={isPending}
      />

      {/* Add institution input */}
      <InstitutionSearchAdd
        onAdd={handleAddSearchResult}
        isPending={isPending}
        error={error}
      />

      <RefreshJobQueue jobs={refreshJobs} />

      <MonitoringPostureCard entries={entries} refreshJobs={refreshJobs} />
    </div>
  );
}

/**
 * PdfDocument — @react-pdf/renderer document component.
 * Server-side ONLY. Never import this in client components.
 * Called from /api/pro/report-pdf route only.
 *
 * Design: the Competitive Fee Position identity that used to exist only in
 * Reports/studio/template.html — cream ground, terracotta spine, Newsreader
 * headings over IBM Plex Sans, mono kickers, and the studio's section order:
 * in brief → position map → divergences → the bigger picture → recommended
 * position → the full ledger → sources.
 *
 * Sections whose data is absent are omitted rather than printed empty, so a
 * report generated without a selected institution degrades to the short form
 * instead of showing hollow headings.
 */
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import type { ReportArtifactMetadata, ReportSummaryResponse } from "@/lib/hamilton/types";
import { HAMILTON_ATTRIBUTION } from "@/lib/constants";
import {
  registerPdfFonts,
  PDF_COLORS as C,
  PDF_FONT as F,
  PDF_TYPE as T,
  PDF_TRACKING as TR,
  PDF_PAGE as P,
} from "./pdf-theme";

registerPdfFonts();

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page: {
    backgroundColor: C.cream,
    paddingTop: P.paddingTop,
    paddingBottom: P.paddingBottom,
    paddingLeft: P.paddingHorizontal + P.spineWidth,
    paddingRight: P.paddingHorizontal,
    fontFamily: F.sans,
    color: C.ink,
  },
  spine: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: P.spineWidth,
    backgroundColor: C.terra,
  },

  // Cover
  coverPage: {
    backgroundColor: C.cream,
    paddingTop: 61,
    paddingBottom: 58,
    paddingLeft: P.paddingHorizontal + P.spineWidth,
    paddingRight: P.paddingHorizontal,
    fontFamily: F.sans,
    color: C.ink,
  },
  coverTopline: {
    flexDirection: "row",
    justifyContent: "space-between",
    fontFamily: F.mono,
  },
  coverToplineText: {
    fontFamily: F.mono,
    fontSize: T.meta,
    color: C.text2,
    letterSpacing: TR.meta,
  },
  coverToplineAccent: {
    fontFamily: F.mono,
    fontSize: T.meta,
    color: C.terra,
    fontWeight: 500,
    letterSpacing: TR.meta,
  },
  coverTitleBlock: { marginTop: 150 },
  coverSeries: {
    fontFamily: F.mono,
    fontSize: 7.4,
    color: C.text2,
    textTransform: "uppercase",
    letterSpacing: TR.series,
    marginBottom: 16,
  },
  coverTitle: {
    fontFamily: F.serif,
    fontSize: T.coverTitle,
    fontWeight: 600,
    color: C.ink,
    lineHeight: 1.02,
  },
  coverFor: {
    marginTop: 30,
    fontFamily: F.serif,
    fontSize: T.coverFor,
    fontStyle: "italic",
    color: C.text2,
  },
  coverInstitution: {
    fontFamily: F.serif,
    fontSize: T.coverInstitution,
    fontWeight: 600,
    color: C.ink,
    marginTop: 6,
  },
  coverMeta: {
    marginTop: 12,
    fontFamily: F.mono,
    fontSize: T.meta,
    color: C.text2,
    letterSpacing: TR.meta,
    lineHeight: 1.6,
  },
  coverFootnote: {
    marginTop: "auto",
    fontFamily: F.mono,
    fontSize: T.footnote,
    color: C.muted,
    letterSpacing: TR.meta,
  },

  // Interior
  header: { marginBottom: 24 },
  kicker: {
    fontFamily: F.mono,
    fontSize: T.kicker,
    fontWeight: 500,
    color: C.terra,
    textTransform: "uppercase",
    letterSpacing: TR.kicker,
    marginBottom: 8,
  },
  h1: {
    fontFamily: F.serif,
    fontSize: T.h1,
    fontWeight: 600,
    color: C.ink,
    lineHeight: 1.12,
  },
  h2: {
    fontFamily: F.serif,
    fontSize: T.h2,
    fontWeight: 600,
    color: C.ink,
    lineHeight: 1.25,
  },
  rule: {
    borderTopWidth: 1.5,
    borderTopColor: C.terra,
    borderTopStyle: "solid",
    width: 36,
    marginTop: 8,
    marginBottom: 14,
  },
  section: { marginBottom: 22 },
  paragraph: {
    fontFamily: F.sans,
    fontSize: T.body,
    color: C.ink2,
    lineHeight: 1.62,
    marginBottom: 8,
  },
  noteItem: {
    fontFamily: F.sans,
    fontSize: T.lede,
    color: C.text2,
    lineHeight: 1.6,
    marginBottom: 5,
    paddingLeft: 12,
  },
  metadataStrip: {
    marginTop: 12,
    paddingTop: 9,
    borderTopWidth: 0.75,
    borderTopColor: C.line,
    borderTopStyle: "solid",
  },
  metadataText: {
    fontFamily: F.mono,
    fontSize: T.footnote,
    color: C.muted,
    lineHeight: 1.55,
    letterSpacing: TR.meta,
  },

  // Stat callouts
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 6 },
  statBox: {
    backgroundColor: C.sand,
    borderLeftWidth: 1.5,
    borderLeftColor: C.terra,
    borderLeftStyle: "solid",
    paddingTop: 10,
    paddingBottom: 10,
    paddingLeft: 11,
    paddingRight: 11,
    width: "47%",
  },
  statLabel: {
    fontFamily: F.mono,
    fontSize: T.kicker,
    fontWeight: 500,
    color: C.text2,
    textTransform: "uppercase",
    letterSpacing: TR.kicker,
    marginBottom: 6,
  },
  statRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  statValue: { fontFamily: F.serif, fontSize: 17, fontWeight: 600, color: C.ink },
  statArrow: { fontFamily: F.sans, fontSize: 11, color: C.muted },
  statValueAccent: { fontFamily: F.serif, fontSize: 17, fontWeight: 600, color: C.terra },

  // Tables
  table: { marginTop: 8 },
  thead: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: C.lineDark,
    borderBottomStyle: "solid",
    paddingBottom: 5,
  },
  th: {
    fontFamily: F.mono,
    fontSize: T.kicker,
    fontWeight: 500,
    color: C.text2,
    textTransform: "uppercase",
    letterSpacing: TR.kicker,
  },
  tr: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: C.lineLight,
    borderBottomStyle: "solid",
    paddingTop: 6,
    paddingBottom: 6,
  },
  td: { fontFamily: F.sans, fontSize: T.small, color: C.ink2 },
  tdNum: { fontFamily: F.mono, fontSize: T.small, color: C.ink },
  tdAbove: { fontFamily: F.mono, fontSize: T.small, color: C.terraDeep, fontWeight: 500 },
  tdBelow: { fontFamily: F.mono, fontSize: T.small, color: C.good, fontWeight: 500 },
  colWide: { width: "40%", paddingRight: 8 },
  colNum: { width: "20%", textAlign: "right" },
  // Ledger columns: amount is right-aligned and frequency left-aligned, so the
  // pair needs an explicit gutter or the two run together ("$32.00per item").
  colLedgerFee: { width: "42%", paddingRight: 8 },
  colLedgerAmount: { width: "16%", textAlign: "right", paddingRight: 14 },
  colLedgerFreq: { width: "26%", paddingRight: 8 },
  colLedgerAsOf: { width: "16%", textAlign: "right" },

  // Divergences
  divergence: {
    backgroundColor: C.terraSoft,
    borderLeftWidth: 1.5,
    borderLeftColor: C.terra,
    borderLeftStyle: "solid",
    paddingTop: 10,
    paddingBottom: 10,
    paddingLeft: 12,
    paddingRight: 12,
    marginBottom: 8,
  },
  divergenceHeading: {
    fontFamily: F.sans,
    fontSize: T.h3,
    fontWeight: 600,
    color: C.ink,
    marginBottom: 3,
  },
  divergenceDetail: {
    fontFamily: F.sans,
    fontSize: T.lede,
    color: C.ink2,
    lineHeight: 1.55,
  },

  sourceItem: {
    fontFamily: F.mono,
    fontSize: T.footnote,
    color: C.text2,
    lineHeight: 1.6,
    marginBottom: 3,
    letterSpacing: TR.meta,
  },

  footer: {
    position: "absolute",
    bottom: 30,
    left: P.paddingHorizontal + P.spineWidth,
    right: P.paddingHorizontal,
    borderTopWidth: 0.75,
    borderTopColor: C.line,
    borderTopStyle: "solid",
    paddingTop: 9,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: {
    fontFamily: F.mono,
    fontSize: T.footnote,
    color: C.muted,
    letterSpacing: TR.meta,
  },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const REPORT_TYPE_LABELS: Record<string, string> = {
  quarterly_strategy: "Quarterly Strategy Report",
  peer_brief: "Peer Brief",
  monthly_pulse: "Monthly Pulse",
  state_index: "State Index",
};

interface PdfDocumentProps {
  report: ReportSummaryResponse;
  reportType: string;
  artifactMetadata?: ReportArtifactMetadata | null;
}

function formatPolicy(policy: ReportArtifactMetadata["evidencePolicy"]): string {
  if (policy === "verified-only") return "Verified only";
  if (policy === "source-diligence") return "Source diligence";
  return "Provisional first";
}

/**
 * Kicker + heading + rule, kept with whatever follows it. Without
 * minPresenceAhead a section heading can land as the last line on a page and
 * orphan its body onto the next one.
 */
function SectionHead({ kicker, heading }: { kicker: string; heading: string }) {
  return (
    <View wrap={false} minPresenceAhead={72}>
      <Text style={styles.kicker}>{kicker}</Text>
      <Text style={styles.h2}>{heading}</Text>
      <View style={styles.rule} />
    </View>
  );
}

function PageFooter({ stamp }: { stamp: string }) {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.footerText}>{HAMILTON_ATTRIBUTION}</Text>
      <Text style={styles.footerText}>{stamp}</Text>
    </View>
  );
}

function standingStyle(standing: "above" | "below" | "at") {
  if (standing === "above") return styles.tdAbove;
  if (standing === "below") return styles.tdBelow;
  return styles.tdNum;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PdfDocument({ report, reportType, artifactMetadata }: PdfDocumentProps) {
  const typeLabel = REPORT_TYPE_LABELS[reportType] ?? reportType;
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const cover = report.cover;

  const footerStamp = report.asOf ? `As of ${report.asOf}` : today;

  return (
    <Document>
      {cover ? (
        <Page size="LETTER" style={styles.coverPage}>
          <View style={styles.spine} />
          <View style={styles.coverTopline}>
            <Text style={styles.coverToplineAccent}>{typeLabel}</Text>
            <Text style={styles.coverToplineText}>{cover.preparedOn}</Text>
          </View>

          <View style={styles.coverTitleBlock}>
            <Text style={styles.coverSeries}>
              Prepared exclusively for one institution
            </Text>
            <Text style={styles.coverTitle}>{report.title}</Text>
            <Text style={styles.coverFor}>Prepared for</Text>
            <Text style={styles.coverInstitution}>{cover.institutionName}</Text>
            {/* Two Text nodes, not one with an embedded newline: a bare "\n"
                child makes @react-pdf fall back to Helvetica for the whole run
                (see pdf-render.test.tsx). */}
            <Text style={styles.coverMeta}>
              {[cover.cityState, cover.charterLabel, cover.tierLabel]
                .filter(Boolean)
                .join("   ·   ")}
            </Text>
            <Text style={styles.coverMeta}>
              {`Benchmarked against ${cover.cohortSize} peers — ${cover.cohortLabel}`}
            </Text>
          </View>

          <Text style={styles.coverFootnote}>{HAMILTON_ATTRIBUTION}</Text>
        </Page>
      ) : null}

      <Page size="LETTER" style={styles.page}>
        <View style={styles.spine} fixed />

        {!cover ? (
          <View style={styles.header}>
            <Text style={styles.kicker}>{typeLabel}</Text>
            <Text style={styles.h1}>{report.title}</Text>
            <View style={styles.rule} />
            <Text style={styles.metadataText}>
              Generated by {HAMILTON_ATTRIBUTION}
            </Text>
          </View>
        ) : null}

        {/* In brief */}
        <View style={styles.section}>
          <SectionHead kicker="In brief" heading="Three things your fee schedule says about you" />
          {report.executiveSummary.map((para, i) => (
            <Text key={i} style={styles.paragraph}>
              {para}
            </Text>
          ))}
        </View>

        {/* The position map */}
        {report.positionMap && report.positionMap.length > 0 ? (
          <View style={styles.section}>
            <SectionHead
              kicker="The position map"
              heading={
                cover
                  ? `Your fees vs. ${cover.cohortSize} peer institutions`
                  : "Your fees vs. the peer baseline"
              }
            />
            <View style={styles.table}>
              <View style={styles.thead}>
                <Text style={[styles.th, styles.colWide]}>Fee</Text>
                <Text style={[styles.th, styles.colNum]}>Yours</Text>
                <Text style={[styles.th, styles.colNum]}>Peer median</Text>
                <Text style={[styles.th, styles.colNum]}>Delta</Text>
              </View>
              {report.positionMap.map((row, i) => (
                <View key={i} style={styles.tr}>
                  <Text style={[styles.td, styles.colWide]}>{row.category}</Text>
                  <Text style={[styles.tdNum, styles.colNum]}>{row.yours}</Text>
                  <Text style={[styles.tdNum, styles.colNum]}>{row.peerMedian}</Text>
                  <Text style={[standingStyle(row.standing), styles.colNum]}>
                    {row.delta}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : report.snapshot.length > 0 ? (
          <View style={styles.section}>
            <SectionHead kicker="The position map" heading="Your fees vs. the peer baseline" />
            <View style={styles.statGrid}>
              {report.snapshot.map((item, i) => (
                <View key={i} style={styles.statBox}>
                  <Text style={styles.statLabel}>{item.label}</Text>
                  <View style={styles.statRow}>
                    <Text style={styles.statValue}>{item.current}</Text>
                    <Text style={styles.statArrow}>→</Text>
                    <Text style={styles.statValueAccent}>{item.proposed}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* Divergences */}
        {report.divergences && report.divergences.length > 0 ? (
          <View style={styles.section}>
            <SectionHead kicker="Divergences" heading="Where you diverge from your market" />
            {report.divergences.map((d, i) => (
              <View key={i} style={styles.divergence}>
                <Text style={styles.divergenceHeading}>{d.heading}</Text>
                <Text style={styles.divergenceDetail}>{d.detail}</Text>
              </View>
            ))}
          </View>
        ) : report.tradeoffs.length > 0 ? (
          <View style={styles.section}>
            <SectionHead kicker="Divergences" heading="Where you diverge from your market" />
            {report.tradeoffs.map((item, i) => (
              <View key={i} style={styles.divergence}>
                <Text style={styles.divergenceHeading}>{item.label}</Text>
                <Text style={styles.divergenceDetail}>{item.value}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* The bigger picture */}
        <View style={styles.section}>
          <SectionHead kicker="The bigger picture" heading="What is moving in your market" />
          <Text style={styles.paragraph}>{report.strategicRationale}</Text>
        </View>

        {/* Recommended position */}
        <View style={styles.section}>
          <SectionHead kicker="What to do about it" heading="Recommended position" />
          <Text style={styles.paragraph}>{report.recommendation}</Text>
        </View>

        <PageFooter stamp={footerStamp} />
      </Page>

      {/* The full ledger */}
      {report.fullLedger && report.fullLedger.length > 0 ? (
        <Page size="LETTER" style={styles.page}>
          <View style={styles.spine} fixed />
          <View style={styles.section}>
            <SectionHead kicker="The full ledger" heading="Your complete published fee schedule" />
            <View style={styles.table}>
              <View style={styles.thead} fixed>
                <Text style={[styles.th, styles.colLedgerFee]}>Fee</Text>
                <Text style={[styles.th, styles.colLedgerAmount]}>Amount</Text>
                <Text style={[styles.th, styles.colLedgerFreq]}>Frequency</Text>
                <Text style={[styles.th, styles.colLedgerAsOf]}>As of</Text>
              </View>
              {report.fullLedger.map((row, i) => (
                <View key={i} style={styles.tr} wrap={false}>
                  <Text style={[styles.td, styles.colLedgerFee]}>{row.category}</Text>
                  <Text style={[styles.tdNum, styles.colLedgerAmount]}>{row.amount}</Text>
                  <Text style={[styles.td, styles.colLedgerFreq]}>{row.frequency ?? "—"}</Text>
                  <Text style={[styles.tdNum, styles.colLedgerAsOf]}>{row.asOf ?? "—"}</Text>
                </View>
              ))}
            </View>
          </View>
          <PageFooter stamp={footerStamp} />
        </Page>
      ) : null}

      {/* Sources and method */}
      <Page size="LETTER" style={styles.page}>
        <View style={styles.spine} fixed />
        <View style={styles.section}>
          <SectionHead kicker="Where this came from" heading="Sources and method" />
          {report.sources && report.sources.length > 0
            ? report.sources.map((s, i) => (
                <Text key={i} style={styles.sourceItem}>
                  {s}
                </Text>
              ))
            : null}
          {report.implementationNotes.map((note, i) => (
            <Text key={i} style={styles.noteItem}>
              {"— "}{note}
            </Text>
          ))}
          {artifactMetadata ? (
            <View style={styles.metadataStrip}>
              <Text style={styles.metadataText}>
                Evidence policy: {formatPolicy(artifactMetadata.evidencePolicy)} · Peer baseline: {artifactMetadata.peerBaselineLabel ?? "Not recorded"}
              </Text>
              <Text style={styles.metadataText}>
                Selected institution: {artifactMetadata.selectedSourceLabel ?? "Context source not recorded"} · {artifactMetadata.selectedVerifiedFeeCount} verified, {artifactMetadata.selectedProvisionalFeeCount} provisional, {artifactMetadata.selectedFeeDeltaCount} deterministic deltas
              </Text>
              {artifactMetadata.peerFallbackReason ? (
                <Text style={styles.metadataText}>
                  Fallback: {artifactMetadata.peerFallbackReason}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
        <PageFooter stamp={footerStamp} />
      </Page>
    </Document>
  );
}

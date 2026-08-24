/**
 * AnalysisPdfDocument — @react-pdf/renderer document component for Analyze screen exports.
 * Server-side ONLY. Never import this in client components.
 * Called from /api/pro/report-pdf route only (via type: "analysis" dispatch).
 *
 * Design: the studio report's identity — cream ground, terracotta spine, Newsreader
 * headings over IBM Plex Sans body, mono kickers. Tokens come from pdf-theme so this
 * document and PdfDocument cannot drift apart.
 */
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import type { AnalyzeResponse } from "@/lib/hamilton/types";
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
  header: {
    marginBottom: 26,
  },
  kicker: {
    fontFamily: F.mono,
    fontSize: T.kicker,
    fontWeight: 500,
    color: C.terra,
    textTransform: "uppercase",
    letterSpacing: TR.kicker,
    marginBottom: 10,
  },
  title: {
    fontFamily: F.serif,
    fontSize: T.h1,
    fontWeight: 600,
    color: C.ink,
    lineHeight: 1.12,
    marginBottom: 10,
  },
  rule: {
    borderTopWidth: 1.5,
    borderTopColor: C.terra,
    borderTopStyle: "solid",
    width: 36,
    marginTop: 4,
    marginBottom: 14,
  },
  attribution: {
    fontFamily: F.mono,
    fontSize: T.meta,
    color: C.muted,
    letterSpacing: TR.meta,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeading: {
    fontFamily: F.serif,
    fontSize: T.h2,
    fontWeight: 600,
    color: C.ink,
    marginBottom: 8,
    lineHeight: 1.25,
  },
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
  statGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 6,
  },
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
  statValue: {
    fontFamily: F.serif,
    fontSize: 19,
    fontWeight: 600,
    color: C.ink,
  },
  statNote: {
    fontFamily: F.sans,
    fontSize: T.footnote,
    color: C.muted,
    marginTop: 3,
    lineHeight: 1.45,
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

// ─── Component ────────────────────────────────────────────────────────────────

interface AnalysisPdfDocumentProps {
  analysis: AnalyzeResponse;
  analysisFocus: string;
  institutionName?: string;
}

export function AnalysisPdfDocument({
  analysis,
  analysisFocus,
  institutionName,
}: AnalysisPdfDocumentProps) {
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const hamiltonViewParagraphs = analysis.hamiltonView
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const readOnlyLine = institutionName
    ? `${HAMILTON_ATTRIBUTION} · ${institutionName}`
    : HAMILTON_ATTRIBUTION;

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.spine} fixed />

        <View style={styles.header}>
          <Text style={styles.kicker}>{analysisFocus} Analysis</Text>
          <Text style={styles.title}>{analysis.title}</Text>
          <View style={styles.rule} />
          <Text style={styles.attribution}>{readOnlyLine}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionHeading}>{"Hamilton's View"}</Text>
          {hamiltonViewParagraphs.map((para, i) => (
            <Text key={i} style={styles.paragraph}>
              {para}
            </Text>
          ))}
        </View>

        {analysis.whatThisMeans ? (
          <View style={styles.section}>
            <Text style={styles.sectionHeading}>What This Means</Text>
            <Text style={styles.paragraph}>{analysis.whatThisMeans}</Text>
          </View>
        ) : null}

        {analysis.whyItMatters.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionHeading}>Why It Matters</Text>
            {analysis.whyItMatters.map((item, i) => (
              <Text key={i} style={styles.noteItem}>
                {"— "}{item}
              </Text>
            ))}
          </View>
        ) : null}

        {analysis.evidence.metrics.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionHeading}>Evidence</Text>
            <View style={styles.statGrid}>
              {analysis.evidence.metrics.map((metric, i) => (
                <View key={i} style={styles.statBox}>
                  <Text style={styles.statLabel}>{metric.label}</Text>
                  <Text style={styles.statValue}>{metric.value}</Text>
                  {metric.note ? (
                    <Text style={styles.statNote}>{metric.note}</Text>
                  ) : null}
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>{HAMILTON_ATTRIBUTION}</Text>
          <Text style={styles.footerText}>{today}</Text>
        </View>
      </Page>
    </Document>
  );
}

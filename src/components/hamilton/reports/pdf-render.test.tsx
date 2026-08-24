/**
 * Render smoke test for the generated PDFs.
 *
 * The point of this test is the font assertion. Both documents used to render
 * in @react-pdf/renderer's built-in Helvetica, which is why the on-demand
 * report looked nothing like the studio one. If font registration regresses,
 * the renderer falls back to Helvetica silently and the only symptom is an
 * ugly PDF nobody notices until a prospect has it.
 *
 * KNOWN LOCAL CAVEAT: fontkit 2.0.4 (pinned transitively by @react-pdf/font)
 * corrupts the embedded TrueType subset when running on Node 22 — glyph
 * outlines come out unreadable while the text layer stays correct, so the PDF
 * looks blank-ish but still extracts text. Node 20, which is what the
 * Dockerfile and deployment use, subsets correctly. The subset-integrity test
 * below therefore only asserts on Node < 22; the rest run everywhere.
 */
const fontkit: { create: (b: Buffer) => { numGlyphs: number; getGlyph: (i: number) => { path: unknown } } } =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ((fontkitNS as any).default ?? fontkitNS);

const NODE_MAJOR = Number(process.versions.node.split(".")[0]);

/** Inflate every embedded TrueType subset and try to read its glyph outlines. */
function countBadGlyphs(buf: Buffer): number {
  const raw = buf.toString("latin1");
  const ids = new Set<string>();
  const re = /\/FontFile2 (\d+) 0 R/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) ids.add(m[1]);
  let bad = 0;
  for (const id of ids) {
    const start = raw.indexOf(`\n${id} 0 obj`);
    if (start < 0) { bad++; continue; }
    const sIdx = raw.indexOf("stream", start) + "stream".length;
    const eIdx = raw.indexOf("endstream", sIdx);
    let data = Buffer.from(raw.slice(sIdx, eIdx).replace(/^\r?\n/, ""), "latin1");
    if (raw.slice(start, sIdx).includes("FlateDecode")) {
      try { data = zlib.inflateSync(data); } catch { bad++; continue; }
    }
    try {
      const f = fontkit.create(data);
      for (let g = 0; g < Math.min(f.numGlyphs, 40); g++) {
        try { void f.getGlyph(g).path; } catch { bad++; }
      }
    } catch { bad++; }
  }
  return bad;
}
import { describe, it, expect } from "vitest";
import zlib from "node:zlib";
// @ts-expect-error - fontkit ships no type declarations
import * as fontkitNS from "fontkit";
import { renderToBuffer } from "@react-pdf/renderer";
import type { DocumentProps } from "@react-pdf/renderer";
import type { ReactElement } from "react";
import { createElement } from "react";
import { PdfDocument } from "./PdfDocument";
import type { ReportSummaryResponse } from "@/lib/hamilton/types";

const report: ReportSummaryResponse = {
  title: "Competitive Fee Position",
  cover: {
    institutionName: "Sample Community Bank",
    cityState: "Springfield, OH",
    charterLabel: "Federal credit union",
    tierLabel: "$300M–$1B",
    cohortLabel: "Ohio community institutions",
    cohortSize: 42,
    preparedOn: "August 23, 2026",
  },
  executiveSummary: [
    "Your overdraft fee sits above the peer median while your maintenance fee sits below it.",
    "The gap is concentrated in three categories rather than spread across the schedule.",
  ],
  snapshot: [{ label: "overdraft", current: "$32.00", proposed: "$29.00 median" }],
  positionMap: [
    { category: "Overdraft", yours: "$32.00", peerMedian: "$29.00", delta: "+$3.00", standing: "above" },
    { category: "Monthly maintenance", yours: "$4.00", peerMedian: "$6.50", delta: "-$2.50", standing: "below" },
    { category: "Stop payment", yours: "$30.00", peerMedian: "$30.00", delta: "+$0.00", standing: "at" },
  ],
  divergences: [
    { heading: "Overdraft sits +$3.00 against the median", detail: "You post $32.00 where the median of 42 peers is $29.00." },
  ],
  strategicRationale: "Overdraft income concentration is higher than the peer set supports.",
  tradeoffs: [{ label: "overdraft", value: "$32.00 vs $29.00 median (+$3.00)" }],
  recommendation: "Hold maintenance, revisit the overdraft position at the next schedule review.",
  implementationNotes: ["Analysis period: 2026 Q3", "Peer baseline: Ohio community institutions"],
  fullLedger: [
    { category: "Overdraft", amount: "$32.00", frequency: "per item", asOf: "2026-08-01" },
    { category: "Monthly maintenance", amount: "$4.00", frequency: "monthly", asOf: "2026-08-01" },
  ],
  sources: ["https://example.org/fee-schedule.pdf"],
  asOf: "2026-08-01",
  exportControls: { pdfEnabled: true, shareEnabled: false },
};

describe("PdfDocument", () => {
  it("should_render_a_nonempty_pdf", async () => {
    const buf = await renderToBuffer(
      createElement(PdfDocument, { report, reportType: "peer_brief" }) as unknown as ReactElement<DocumentProps>,
    );
    expect(buf.length).toBeGreaterThan(10_000);
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  }, 30_000);

  it("should_embed_brand_faces_and_not_fall_back_to_helvetica", async () => {
    const buf = await renderToBuffer(
      createElement(PdfDocument, { report, reportType: "peer_brief" }) as unknown as ReactElement<DocumentProps>,
    );
    const raw = buf.toString("latin1");
    expect(raw).toContain("Newsreader");
    expect(raw).toContain("IBMPlexSans");
    expect(raw).toContain("IBMPlexMono");
    expect(raw).not.toContain("Helvetica");
  }, 30_000);

  it("should_omit_sections_whose_data_is_absent", async () => {
    const bare: ReportSummaryResponse = {
      ...report,
      cover: undefined,
      positionMap: undefined,
      divergences: undefined,
      fullLedger: undefined,
      sources: undefined,
      snapshot: [],
      tradeoffs: [],
    };
    const buf = await renderToBuffer(
      createElement(PdfDocument, { report: bare, reportType: "peer_brief" }) as unknown as ReactElement<DocumentProps>,
    );
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(5_000);
  }, 30_000);

  it.skipIf(NODE_MAJOR >= 22)(
    "should_embed_subsets_whose_glyph_outlines_actually_parse",
    async () => {
      const buf = await renderToBuffer(
        createElement(PdfDocument, { report, reportType: "peer_brief" }) as unknown as ReactElement<DocumentProps>,
      );
      expect(countBadGlyphs(buf)).toBe(0);
    },
    30_000,
  );
});

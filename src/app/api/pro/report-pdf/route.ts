/**
 * POST /api/pro/report-pdf
 *
 * Accepts: { report: ReportSummaryResponse, reportType: string }
 * Returns: PDF blob (application/pdf) as download
 *
 * Uses @react-pdf/renderer server-side only.
 * Listed in serverExternalPackages in next.config.ts.
 * Never imported in client bundle.
 */
import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import type { DocumentProps } from "@react-pdf/renderer";
import { createElement } from "react";
import type { ReactElement, JSXElementConstructor } from "react";
import { getCurrentUser } from "@/lib/auth";
import { PdfDocument } from "@/components/hamilton/reports/PdfDocument";
import type { ReportSummaryResponse } from "@/lib/hamilton/types";

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Auth check
  let user = null;
  try {
    user = await getCurrentUser();
  } catch {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  // Parse body
  let report: ReportSummaryResponse;
  let reportType: string;
  try {
    const body = await req.json();
    report = body.report as ReportSummaryResponse;
    reportType = (body.reportType as string) || "report";
    if (!report || !report.title) {
      return NextResponse.json({ error: "Invalid report data" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Render PDF
  try {
    const element = createElement(PdfDocument, { report, reportType }) as unknown as ReactElement<DocumentProps, string | JSXElementConstructor<unknown>>;
    const buffer = await renderToBuffer(element);
    const uint8 = new Uint8Array(buffer);

    const date = new Date().toISOString().split("T")[0];
    const filename = `hamilton-report-${date}.pdf`;

    return new NextResponse(uint8, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": uint8.byteLength.toString(),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `PDF generation failed: ${message}` },
      { status: 500 }
    );
  }
}

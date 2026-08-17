/**
 * /r/[token]/print — the raw report document (its own print stylesheet), with an
 * auto-print hook so "Download PDF" opens the browser's save-as-PDF dialog.
 */
import { NextResponse } from "next/server";
import { getHostedReport, prepareReportForPrint, readHostedReportHtml } from "@/lib/hosted-reports";

interface RouteContext {
  params: Promise<{ token: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { token } = await context.params;
  const report = getHostedReport(token);
  const html = report ? readHostedReportHtml(report.institution_id) : null;
  if (!report || !html) {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(prepareReportForPrint(html), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

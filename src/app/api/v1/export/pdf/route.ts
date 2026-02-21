import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { getNationalIndex } from "@/lib/crawler-db/fee-index";
import { trackUsage } from "@/lib/subscriber-db";
import { getDisplayName } from "@/lib/fee-taxonomy";

/**
 * PDF export generates a simple text-based report.
 * For production, consider adding pdfkit for branded PDFs.
 * This endpoint returns a formatted text document as a PDF-compatible download.
 */
export async function GET(request: NextRequest) {
  const auth = authenticateApiKey(request);
  if (auth instanceof NextResponse) return auth;

  const index = getNationalIndex();
  const date = new Date().toISOString().slice(0, 10);

  const lines: string[] = [
    "BANK FEE INDEX - NATIONAL BENCHMARK REPORT",
    `Generated: ${date}`,
    `Organization: ${auth.orgSlug}`,
    "",
    "=".repeat(80),
    "",
    `${"Category".padEnd(35)} ${"Median".padStart(10)} ${"P25".padStart(10)} ${"P75".padStart(10)} ${"Count".padStart(8)}`,
    "-".repeat(80),
  ];

  for (const entry of index) {
    const name = getDisplayName(entry.fee_category).slice(0, 34);
    const median = entry.median_amount != null ? `$${entry.median_amount.toFixed(2)}` : "N/A";
    const p25 = entry.p25_amount != null ? `$${entry.p25_amount.toFixed(2)}` : "N/A";
    const p75 = entry.p75_amount != null ? `$${entry.p75_amount.toFixed(2)}` : "N/A";
    lines.push(
      `${name.padEnd(35)} ${median.padStart(10)} ${p25.padStart(10)} ${p75.padStart(10)} ${String(entry.institution_count).padStart(8)}`
    );
  }

  lines.push("", "=".repeat(80));
  lines.push(`Total categories: ${index.length}`);
  lines.push("");
  lines.push("Bank Fee Index | bankfeeindex.com");
  lines.push("Data sourced from publicly available fee schedules of FDIC/NCUA-insured institutions.");

  trackUsage({
    organization_id: auth.organizationId,
    event_type: "export",
    metadata: { format: "pdf", rows: index.length },
  });

  const content = lines.join("\n");

  return new NextResponse(content, {
    headers: {
      "Content-Type": "text/plain",
      "Content-Disposition": `attachment; filename="bfi-national-benchmarks-${date}.txt"`,
    },
  });
}

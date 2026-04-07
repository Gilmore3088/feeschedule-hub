/**
 * POST /api/reports/email-gate
 * Lead capture + presigned PDF download URL.
 * Public endpoint — no authentication required.
 *
 * Security:
 *   T-16-04 — Email validated server-side before any DB operation
 *   T-16-05 — Slug validated against published_reports (is_public=true)
 *   T-16-06 — artifact_key never returned to client; presigned URL generated server-side
 *   T-16-07 — Duplicate leads silently ignored via ON CONFLICT DO NOTHING
 */

import { NextResponse } from "next/server";
import { getSql } from "@/lib/crawler-db/connection";
import { generatePresignedUrl } from "@/lib/report-engine/presign";

export const dynamic = "force-dynamic";

// Strict email validation regex (T-16-04)
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Row returned from the JOIN query
interface ReportArtifactRow {
  artifact_key: string | null;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { email, slug } = (body ?? {}) as Record<string, unknown>;

  // Validate email (T-16-04)
  if (typeof email !== "string" || !EMAIL_REGEX.test(email)) {
    return NextResponse.json(
      { error: "Invalid email address" },
      { status: 400 }
    );
  }

  // Validate slug is a non-empty string
  if (typeof slug !== "string" || slug.trim().length === 0) {
    return NextResponse.json(
      { error: "Missing or invalid slug" },
      { status: 400 }
    );
  }

  const sql = getSql();

  // Validate slug against published_reports (T-16-05) and fetch artifact_key
  let artifactKey: string | null = null;
  try {
    const rows = await sql<ReportArtifactRow[]>`
      SELECT rj.artifact_key
      FROM published_reports pr
      JOIN report_jobs rj ON pr.job_id = rj.id
      WHERE pr.slug = ${slug.trim()}
        AND pr.is_public = true
      LIMIT 1
    `;

    if (rows.length === 0) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    artifactKey = rows[0].artifact_key;
  } catch (err) {
    console.error("[/api/reports/email-gate] DB lookup error:", err);
    return NextResponse.json(
      { error: "Failed to look up report" },
      { status: 500 }
    );
  }

  // PDF not yet generated
  if (!artifactKey) {
    return NextResponse.json(
      { status: "pending", message: "Report PDF not yet available" },
      { status: 202 }
    );
  }

  // Store lead — failure is non-blocking (T-16-07)
  // TODO: Phase 17 — add report_leads migration
  try {
    await sql`
      INSERT INTO report_leads (email, slug, requested_at)
      VALUES (${email.toLowerCase()}, ${slug.trim()}, now())
      ON CONFLICT (email, slug) DO NOTHING
    `;
  } catch (err) {
    // report_leads table may not exist yet; log and continue
    console.warn("[/api/reports/email-gate] Lead storage failed (table may not exist):", err);
  }

  // Generate presigned URL server-side — 1-hour TTL (T-16-06)
  let downloadUrl: string;
  try {
    downloadUrl = await generatePresignedUrl(artifactKey, 3600);
  } catch (err) {
    console.error("[/api/reports/email-gate] Presign error:", err);
    return NextResponse.json(
      { error: "Failed to generate download link" },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { downloadUrl },
    {
      status: 200,
      headers: {
        // Rate limit headers — informational only for v2.0 (T-16-07: accept DoS risk)
        "X-RateLimit-Limit": "100",
        "X-RateLimit-Remaining": "99",
      },
    }
  );
}

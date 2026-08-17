import { withApiRoutePolicy } from "@/lib/api-hardening/route-wrapper";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/data-store/connection";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_SOURCE = "website";
/** Placeholder name the footer signup posts; never allowed to replace a real name. */
const NEWSLETTER_PLACEHOLDER_NAME = "Newsletter signup";
const NEW_LEAD_STATUS = "new";

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function handlePOST(request: NextRequest) {
  try {
    const body = await request.json();
    const name = cleanText(body.name);
    const email = cleanText(body.email);
    const company = cleanText(body.company);
    const role = cleanText(body.role);
    const useCase = cleanText(body.use_case);
    const source = cleanText(body.source) ?? DEFAULT_SOURCE;

    if (!name || !email) {
      return NextResponse.json(
        { error: "Name and email are required" },
        { status: 400 },
      );
    }

    if (!EMAIL_PATTERN.test(email)) {
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400 },
      );
    }

    const [existing] = await sql`SELECT id FROM leads WHERE email = ${email}`;

    if (existing) {
      // Fill gaps only: never overwrite a qualified lead's name/company/role/use_case,
      // and never let the newsletter placeholder replace a real name. Sources accumulate
      // as a comma-separated list; status is set only when it was never set.
      const nameCandidate = name === NEWSLETTER_PLACEHOLDER_NAME ? null : name;
      await sql`
        UPDATE leads SET
          name = CASE
            WHEN name IS NULL OR name = '' OR name = ${NEWSLETTER_PLACEHOLDER_NAME}
              THEN COALESCE(${nameCandidate}, name)
            ELSE name
          END,
          company = COALESCE(company, ${company}),
          role = COALESCE(role, ${role}),
          use_case = COALESCE(use_case, ${useCase}),
          source = CASE
            WHEN source IS NULL OR source = '' THEN ${source}
            WHEN position(${source} in source) > 0 THEN source
            ELSE source || ',' || ${source}
          END,
          status = COALESCE(status, ${NEW_LEAD_STATUS})
        WHERE email = ${email}`;
    } else {
      await sql`
        INSERT INTO leads (name, email, company, role, use_case, source)
        VALUES (${name}, ${email}, ${company}, ${role}, ${useCase}, ${source})`;
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export const POST = withApiRoutePolicy("api.leads", "POST", handlePOST);

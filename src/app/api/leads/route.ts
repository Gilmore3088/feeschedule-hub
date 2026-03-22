import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/crawler-db/connection";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, company, role, use_case, source } = body;

    if (!name || !email) {
      return NextResponse.json(
        { error: "Name and email are required" },
        { status: 400 },
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400 },
      );
    }

    const [existing] = await sql`SELECT id FROM leads WHERE email = ${email}`;

    if (existing) {
      await sql`
        UPDATE leads SET name = ${name}, company = ${company || null},
         role = ${role || null}, use_case = ${use_case || null},
         status = 'updated' WHERE email = ${email}`;
    } else {
      await sql`
        INSERT INTO leads (name, email, company, role, use_case, source)
        VALUES (${name}, ${email}, ${company || null}, ${role || null},
                ${use_case || null}, ${source || "website"})`;
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

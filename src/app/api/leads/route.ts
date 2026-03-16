import { NextRequest, NextResponse } from "next/server";
import { getWriteDb } from "@/lib/crawler-db/connection";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, company, role, use_case } = body;

    if (!name || !email) {
      return NextResponse.json(
        { error: "Name and email are required" },
        { status: 400 },
      );
    }

    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400 },
      );
    }

    const db = getWriteDb();
    try {
      // Check for duplicate email
      const existing = db
        .prepare("SELECT id FROM leads WHERE email = ?")
        .get(email);

      if (existing) {
        // Update existing lead with new info
        db.prepare(
          `UPDATE leads SET name = ?, company = ?, role = ?, use_case = ?,
           status = 'updated' WHERE email = ?`,
        ).run(name, company || null, role || null, use_case || null, email);
      } else {
        db.prepare(
          `INSERT INTO leads (name, email, company, role, use_case, source)
           VALUES (?, ?, ?, ?, ?, 'coming_soon')`,
        ).run(
          name,
          email,
          company || null,
          role || null,
          use_case || null,
        );
      }

      return NextResponse.json({ success: true });
    } finally {
      db.close();
    }
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

"use server";

import { getStripe } from "@/lib/stripe";
import { hashPassword } from "@/lib/passwords";
import { getWriteDb } from "@/lib/crawler-db/connection";
import { cookies } from "next/headers";
import crypto from "crypto";

const SESSION_TTL_HOURS = 24;

function getCookieSecret(): string {
  const secret = process.env.BFI_COOKIE_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("BFI_COOKIE_SECRET must be set in production");
  }
  return secret || "dev-secret-change-in-production";
}

function signSessionId(sessionId: string): string {
  const sig = crypto
    .createHmac("sha256", getCookieSecret())
    .update(sessionId)
    .digest("hex");
  return `${sessionId}.${sig}`;
}

export async function register(formData: FormData): Promise<{
  success: boolean;
  error?: string;
  redirect?: string;
}> {
  const email = formData.get("email");
  const password = formData.get("password");
  const name = formData.get("name");
  const institutionName = formData.get("institution_name") as string | null;
  const institutionType = formData.get("institution_type") as string | null;
  const assetTier = formData.get("asset_tier") as string | null;
  const stateCode = formData.get("state_code") as string | null;
  const jobRole = formData.get("job_role") as string | null;

  if (typeof email !== "string" || !email.trim()) {
    return { success: false, error: "Email is required" };
  }
  if (typeof password !== "string" || password.length < 8) {
    return { success: false, error: "Password must be at least 8 characters" };
  }
  if (typeof name !== "string" || !name.trim()) {
    return { success: false, error: "Name is required" };
  }

  const trimmedEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    return { success: false, error: "Invalid email format" };
  }

  // Hash password BEFORE any DB or Stripe calls (async, can't be in transaction)
  const hashedPw = await hashPassword(password);

  // Create Stripe customer first (external system, harder to roll back)
  let stripeCustomer;
  try {
    const stripe = getStripe();
    stripeCustomer = await stripe.customers.create({
      email: trimmedEmail,
      name: name.trim(),
    });
  } catch (e) {
    console.error("[register] Stripe customer creation failed:", e);
    return { success: false, error: "Registration failed. Please try again." };
  }

  // All local writes atomically
  const db = getWriteDb();
  try {
    const sessionId = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(
      Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000
    ).toISOString();

    let userId: number;
    try {
      const result = db.transaction(() => {
        const insert = db
          .prepare(
            `INSERT INTO users (username, email, password_hash, display_name, role,
             stripe_customer_id, subscription_status, is_active, created_at,
             institution_name, institution_type, asset_tier, state_code, job_role)
             VALUES (?, ?, ?, ?, 'viewer', ?, 'none', 1, datetime('now'),
                     ?, ?, ?, ?, ?)`
          )
          .run(
            trimmedEmail,
            trimmedEmail,
            hashedPw,
            name.trim(),
            stripeCustomer.id,
            institutionName?.trim() || null,
            institutionType || null,
            assetTier || null,
            stateCode || null,
            jobRole || null
          );

        db.prepare(
          "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)"
        ).run(sessionId, insert.lastInsertRowid, expiresAt);

        return Number(insert.lastInsertRowid);
      })();
      userId = result;
    } catch (e: unknown) {
      // Clean up Stripe customer on local failure
      try {
        const stripe = getStripe();
        await stripe.customers.del(stripeCustomer.id);
      } catch { /* best effort cleanup */ }

      if (e instanceof Error && e.message.includes("UNIQUE constraint")) {
        return { success: false, error: "An account with this email already exists" };
      }
      throw e;
    }

    // Set session cookie
    const cookieStore = await cookies();
    cookieStore.set("fsh_session", signSessionId(sessionId), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_TTL_HOURS * 60 * 60,
      path: "/",
    });

    return { success: true, redirect: "/account" };
  } finally {
    db.close();
  }
}

import crypto from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  getMemberByEmail,
  createOrganization,
  createMember,
  getActiveSubscription,
} from "@/lib/subscriber-db";
import type { SubscriberSession, SubscriptionPlan } from "@/lib/subscriber-db";

const SUB_COOKIE = "bfi_sub";
const SUB_TTL_HOURS = 72;
const SIGNING_SECRET =
  process.env.SUBSCRIBER_SESSION_SECRET || "dev-secret-change-in-production";

// --------------- Password hashing ---------------

function scryptHash(password: string, salt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey.toString("hex"));
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await scryptHash(password, salt);
  return `${salt}:${hash}`;
}

export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  const [salt, expected] = stored.split(":", 2);
  const actual = await scryptHash(password, salt);
  const expectedBuf = Buffer.from(expected, "hex");
  const actualBuf = Buffer.from(actual, "hex");
  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

// --------------- Session cookie ---------------

function signPayload(payload: string): string {
  return crypto
    .createHmac("sha256", SIGNING_SECRET)
    .update(payload)
    .digest("hex");
}

function createSessionToken(session: SubscriberSession): string {
  const payload = JSON.stringify({
    ...session,
    exp: Date.now() + SUB_TTL_HOURS * 60 * 60 * 1000,
  });
  const sig = signPayload(payload);
  const encoded = Buffer.from(payload).toString("base64url");
  return `${encoded}.${sig}`;
}

export function verifySessionToken(
  token: string
): SubscriberSession | null {
  const [encoded, sig] = token.split(".");
  if (!encoded || !sig) return null;

  const payload = Buffer.from(encoded, "base64url").toString("utf-8");
  const expectedSig = signPayload(payload);

  if (sig.length !== expectedSig.length) return null;
  const sigBuf = Buffer.from(sig, "hex");
  const expectedBuf = Buffer.from(expectedSig, "hex");
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

  const data = JSON.parse(payload) as SubscriberSession & { exp: number };
  if (Date.now() > data.exp) return null;

  const { exp: _, ...session } = data;
  return session;
}

// Edge-compatible version (no crypto.timingSafeEqual, uses string compare — acceptable for middleware routing only)
export function verifySubscriptionCookieEdge(
  cookieValue: string
): { active: boolean; plan: string | null } | null {
  try {
    const [encoded] = cookieValue.split(".");
    if (!encoded) return null;
    const payload = JSON.parse(atob(encoded.replace(/-/g, "+").replace(/_/g, "/")));
    if (Date.now() > payload.exp) return null;
    return {
      active: payload.subscriptionActive ?? false,
      plan: payload.plan ?? null,
    };
  } catch {
    return null;
  }
}

// --------------- Auth actions ---------------

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export async function subscriberSignup(data: {
  orgName: string;
  email: string;
  password: string;
  name?: string;
}): Promise<{ success: boolean; error?: string }> {
  const existing = getMemberByEmail(data.email);
  if (existing) {
    return { success: false, error: "An account with this email already exists" };
  }

  if (data.password.length < 8) {
    return { success: false, error: "Password must be at least 8 characters" };
  }

  const passwordHash = await hashPassword(data.password);
  const slug = slugify(data.orgName) + "-" + crypto.randomBytes(3).toString("hex");
  const orgId = createOrganization({ name: data.orgName, slug });
  const memberId = createMember({
    organization_id: orgId,
    email: data.email,
    password_hash: passwordHash,
    name: data.name,
    role: "owner",
  });

  const session: SubscriberSession = {
    organizationId: orgId,
    memberId,
    email: data.email,
    orgName: data.orgName,
    orgSlug: slug,
    plan: null,
    subscriptionActive: false,
  };

  const token = createSessionToken(session);
  const cookieStore = await cookies();
  cookieStore.set(SUB_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SUB_TTL_HOURS * 60 * 60,
    path: "/",
  });

  return { success: true };
}

export async function subscriberLogin(
  email: string,
  password: string
): Promise<{ success: boolean; error?: string }> {
  const member = getMemberByEmail(email);
  if (!member) {
    return { success: false, error: "Invalid email or password" };
  }

  const valid = await verifyPassword(password, member.password_hash);
  if (!valid) {
    return { success: false, error: "Invalid email or password" };
  }

  const subscription = getActiveSubscription(member.organization_id);

  const session: SubscriberSession = {
    organizationId: member.organization_id,
    memberId: member.id,
    email: member.email,
    orgName: member.org_name,
    orgSlug: member.org_slug,
    plan: (subscription?.plan as SubscriptionPlan) ?? null,
    subscriptionActive: !!subscription,
  };

  const token = createSessionToken(session);
  const cookieStore = await cookies();
  cookieStore.set(SUB_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SUB_TTL_HOURS * 60 * 60,
    path: "/",
  });

  return { success: true };
}

export async function subscriberLogout(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SUB_COOKIE);
}

export async function getCurrentSubscriber(): Promise<SubscriberSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SUB_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function requireSubscriber(): Promise<SubscriberSession> {
  const session = await getCurrentSubscriber();
  if (!session) {
    redirect("/login");
  }
  return session;
}

export async function requireActiveSubscription(): Promise<SubscriberSession> {
  const session = await requireSubscriber();
  if (!session.subscriptionActive) {
    redirect("/pricing");
  }
  return session;
}

/** Refresh the session cookie with updated subscription status */
export async function refreshSubscriberSession(
  organizationId: number
): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SUB_COOKIE)?.value;
  if (!token) return;

  const current = verifySessionToken(token);
  if (!current || current.organizationId !== organizationId) return;

  const subscription = getActiveSubscription(organizationId);
  const updated: SubscriberSession = {
    ...current,
    plan: (subscription?.plan as SubscriptionPlan) ?? null,
    subscriptionActive: !!subscription,
  };

  const newToken = createSessionToken(updated);
  cookieStore.set(SUB_COOKIE, newToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SUB_TTL_HOURS * 60 * 60,
    path: "/",
  });
}

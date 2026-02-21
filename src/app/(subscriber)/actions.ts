"use server";

import { redirect } from "next/navigation";
import {
  subscriberSignup,
  subscriberLogin,
  subscriberLogout,
  requireSubscriber,
} from "@/lib/subscriber-auth";
import { createCheckoutSession } from "@/lib/stripe";
import { createBillingPortalSession } from "@/lib/stripe";
import {
  getOrganizationById,
  createApiKey,
  deleteApiKey,
  getApiKeysByOrg,
} from "@/lib/subscriber-db";
import crypto from "crypto";

export async function signupAction(
  _prev: { error?: string } | null,
  formData: FormData
): Promise<{ error?: string } | null> {
  const orgName = formData.get("orgName") as string;
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const name = formData.get("name") as string | null;

  if (!orgName || !email || !password) {
    return { error: "All fields are required" };
  }

  const result = await subscriberSignup({
    orgName,
    email,
    password,
    name: name || undefined,
  });

  if (!result.success) {
    return { error: result.error };
  }

  redirect("/pricing");
}

export async function loginAction(
  _prev: { error?: string } | null,
  formData: FormData
): Promise<{ error?: string } | null> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Email and password are required" };
  }

  const result = await subscriberLogin(email, password);

  if (!result.success) {
    return { error: result.error };
  }

  redirect("/account");
}

export async function logoutAction(): Promise<void> {
  await subscriberLogout();
  redirect("/");
}

export async function startCheckoutAction(): Promise<{ url?: string; error?: string }> {
  const session = await requireSubscriber();
  const result = await createCheckoutSession(
    session.organizationId,
    session.email
  );
  return { url: result.url };
}

export async function openBillingPortalAction(): Promise<{ url?: string; error?: string }> {
  const session = await requireSubscriber();
  const org = getOrganizationById(session.organizationId);

  if (!org?.stripe_customer_id) {
    return { error: "No billing account found. Please subscribe first." };
  }

  const result = await createBillingPortalSession(org.stripe_customer_id);
  return { url: result.url };
}

export async function createApiKeyAction(
  name: string
): Promise<{ key?: string; error?: string }> {
  const session = await requireSubscriber();

  if (!session.subscriptionActive) {
    return { error: "Active subscription required" };
  }

  const existing = getApiKeysByOrg(session.organizationId);
  if (existing.length >= 3) {
    return { error: "Maximum of 3 API keys per organization" };
  }

  const rawKey = `bfi_${crypto.randomBytes(24).toString("hex")}`;
  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
  const keyPrefix = rawKey.slice(0, 12);

  createApiKey({
    organization_id: session.organizationId,
    key_hash: keyHash,
    key_prefix: keyPrefix,
    name: name || "Default",
  });

  return { key: rawKey };
}

export async function deleteApiKeyAction(keyId: number): Promise<void> {
  const session = await requireSubscriber();
  deleteApiKey(keyId, session.organizationId);
}

import { getDb, getWriteDb } from "@/lib/crawler-db/connection";
import type {
  Organization,
  Subscription,
  OrgMember,
  ApiKey,
  SavedSubscriberPeerGroup,
} from "./types";

// --------------- Organizations ---------------

export function getOrganizationById(id: number): Organization | undefined {
  const db = getDb();
  return db
    .prepare("SELECT * FROM organizations WHERE id = ?")
    .get(id) as Organization | undefined;
}

export function getOrganizationBySlug(slug: string): Organization | undefined {
  const db = getDb();
  return db
    .prepare("SELECT * FROM organizations WHERE slug = ?")
    .get(slug) as Organization | undefined;
}

export function getOrganizationByStripeCustomer(
  customerId: string
): Organization | undefined {
  const db = getDb();
  return db
    .prepare("SELECT * FROM organizations WHERE stripe_customer_id = ?")
    .get(customerId) as Organization | undefined;
}

export function createOrganization(data: {
  name: string;
  slug: string;
  charter_type?: string;
  asset_tier?: string;
  cert_number?: string;
}): number {
  const db = getWriteDb();
  try {
    const result = db
      .prepare(
        `INSERT INTO organizations (name, slug, charter_type, asset_tier, cert_number)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        data.name,
        data.slug,
        data.charter_type ?? null,
        data.asset_tier ?? null,
        data.cert_number ?? null
      );
    return result.lastInsertRowid as number;
  } finally {
    db.close();
  }
}

export function updateOrganizationStripeCustomer(
  orgId: number,
  stripeCustomerId: string
): void {
  const db = getWriteDb();
  try {
    db.prepare(
      "UPDATE organizations SET stripe_customer_id = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(stripeCustomerId, orgId);
  } finally {
    db.close();
  }
}

// --------------- Subscriptions ---------------

export function getActiveSubscription(
  organizationId: number
): Subscription | undefined {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM subscriptions
       WHERE organization_id = ? AND status IN ('active', 'trialing')
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(organizationId) as Subscription | undefined;
}

export function getSubscriptionByStripeId(
  stripeSubId: string
): Subscription | undefined {
  const db = getDb();
  return db
    .prepare("SELECT * FROM subscriptions WHERE stripe_subscription_id = ?")
    .get(stripeSubId) as Subscription | undefined;
}

export function createSubscription(data: {
  organization_id: number;
  stripe_subscription_id: string;
  plan: string;
  status: string;
  current_period_start: string;
  current_period_end: string;
}): number {
  const db = getWriteDb();
  try {
    const result = db
      .prepare(
        `INSERT INTO subscriptions
         (organization_id, stripe_subscription_id, plan, status, current_period_start, current_period_end)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        data.organization_id,
        data.stripe_subscription_id,
        data.plan,
        data.status,
        data.current_period_start,
        data.current_period_end
      );
    return result.lastInsertRowid as number;
  } finally {
    db.close();
  }
}

export function updateSubscription(
  stripeSubId: string,
  data: Partial<{
    status: string;
    plan: string;
    current_period_start: string;
    current_period_end: string;
    cancel_at_period_end: number;
  }>
): void {
  const db = getWriteDb();
  try {
    const sets: string[] = ["updated_at = datetime('now')"];
    const values: (string | number)[] = [];

    if (data.status !== undefined) {
      sets.push("status = ?");
      values.push(data.status);
    }
    if (data.plan !== undefined) {
      sets.push("plan = ?");
      values.push(data.plan);
    }
    if (data.current_period_start !== undefined) {
      sets.push("current_period_start = ?");
      values.push(data.current_period_start);
    }
    if (data.current_period_end !== undefined) {
      sets.push("current_period_end = ?");
      values.push(data.current_period_end);
    }
    if (data.cancel_at_period_end !== undefined) {
      sets.push("cancel_at_period_end = ?");
      values.push(data.cancel_at_period_end);
    }

    db.prepare(
      `UPDATE subscriptions SET ${sets.join(", ")} WHERE stripe_subscription_id = ?`
    ).run(...values, stripeSubId);
  } finally {
    db.close();
  }
}

// --------------- Members ---------------

export function getMemberByEmail(email: string): (OrgMember & { org_name: string; org_slug: string }) | undefined {
  const db = getDb();
  return db
    .prepare(
      `SELECT m.*, o.name as org_name, o.slug as org_slug
       FROM org_members m
       JOIN organizations o ON m.organization_id = o.id
       WHERE m.email = ?`
    )
    .get(email) as (OrgMember & { org_name: string; org_slug: string }) | undefined;
}

export function getMembersByOrg(orgId: number): OrgMember[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM org_members WHERE organization_id = ? ORDER BY created_at")
    .all(orgId) as OrgMember[];
}

export function createMember(data: {
  organization_id: number;
  email: string;
  password_hash: string;
  name?: string;
  role: string;
}): number {
  const db = getWriteDb();
  try {
    const result = db
      .prepare(
        `INSERT INTO org_members (organization_id, email, password_hash, name, role)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        data.organization_id,
        data.email,
        data.password_hash,
        data.name ?? null,
        data.role
      );
    return result.lastInsertRowid as number;
  } finally {
    db.close();
  }
}

// --------------- API Keys ---------------

export function getApiKeyByHash(keyHash: string): (ApiKey & { org_slug: string }) | undefined {
  const db = getDb();
  return db
    .prepare(
      `SELECT k.*, o.slug as org_slug
       FROM api_keys k
       JOIN organizations o ON k.organization_id = o.id
       WHERE k.key_hash = ?`
    )
    .get(keyHash) as (ApiKey & { org_slug: string }) | undefined;
}

export function getApiKeysByOrg(orgId: number): ApiKey[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM api_keys WHERE organization_id = ? ORDER BY created_at DESC")
    .all(orgId) as ApiKey[];
}

export function createApiKey(data: {
  organization_id: number;
  key_hash: string;
  key_prefix: string;
  name: string;
}): number {
  const db = getWriteDb();
  try {
    const result = db
      .prepare(
        `INSERT INTO api_keys (organization_id, key_hash, key_prefix, name)
         VALUES (?, ?, ?, ?)`
      )
      .run(data.organization_id, data.key_hash, data.key_prefix, data.name);
    return result.lastInsertRowid as number;
  } finally {
    db.close();
  }
}

export function deleteApiKey(id: number, orgId: number): void {
  const db = getWriteDb();
  try {
    db.prepare("DELETE FROM api_keys WHERE id = ? AND organization_id = ?").run(
      id,
      orgId
    );
  } finally {
    db.close();
  }
}

export function touchApiKeyUsage(keyHash: string): void {
  const db = getWriteDb();
  try {
    db.prepare(
      "UPDATE api_keys SET last_used_at = datetime('now') WHERE key_hash = ?"
    ).run(keyHash);
  } finally {
    db.close();
  }
}

// --------------- Peer Groups ---------------

export function getSubscriberPeerGroups(
  orgId: number
): SavedSubscriberPeerGroup[] {
  const db = getDb();
  return db
    .prepare(
      "SELECT * FROM saved_subscriber_peer_groups WHERE organization_id = ? ORDER BY created_at"
    )
    .all(orgId) as SavedSubscriberPeerGroup[];
}

export function createSubscriberPeerGroup(data: {
  organization_id: number;
  name: string;
  charter_types?: string;
  asset_tiers?: string;
  districts?: string;
}): number {
  const db = getWriteDb();
  try {
    const count = db
      .prepare(
        "SELECT COUNT(*) as cnt FROM saved_subscriber_peer_groups WHERE organization_id = ?"
      )
      .get(data.organization_id) as { cnt: number };

    if (count.cnt >= 5) {
      throw new Error("Maximum of 5 peer groups per organization");
    }

    const result = db
      .prepare(
        `INSERT INTO saved_subscriber_peer_groups
         (organization_id, name, charter_types, asset_tiers, districts)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        data.organization_id,
        data.name,
        data.charter_types ?? null,
        data.asset_tiers ?? null,
        data.districts ?? null
      );
    return result.lastInsertRowid as number;
  } finally {
    db.close();
  }
}

export function deleteSubscriberPeerGroup(
  id: number,
  orgId: number
): void {
  const db = getWriteDb();
  try {
    db.prepare(
      "DELETE FROM saved_subscriber_peer_groups WHERE id = ? AND organization_id = ?"
    ).run(id, orgId);
  } finally {
    db.close();
  }
}

// --------------- Usage Tracking ---------------

export function trackUsage(data: {
  organization_id?: number;
  anonymous_id?: string;
  event_type: string;
  metadata?: Record<string, unknown>;
}): void {
  const db = getWriteDb();
  try {
    db.prepare(
      `INSERT INTO usage_events (organization_id, anonymous_id, event_type, metadata)
       VALUES (?, ?, ?, ?)`
    ).run(
      data.organization_id ?? null,
      data.anonymous_id ?? null,
      data.event_type,
      data.metadata ? JSON.stringify(data.metadata) : null
    );
  } finally {
    db.close();
  }
}

export function getUsageCount(
  orgId: number | null,
  anonymousId: string | null,
  eventType: string,
  sinceDateIso: string
): number {
  const db = getDb();
  if (orgId) {
    const row = db
      .prepare(
        `SELECT COUNT(*) as cnt FROM usage_events
         WHERE organization_id = ? AND event_type = ? AND created_at >= ?`
      )
      .get(orgId, eventType, sinceDateIso) as { cnt: number };
    return row.cnt;
  }
  if (anonymousId) {
    const row = db
      .prepare(
        `SELECT COUNT(*) as cnt FROM usage_events
         WHERE anonymous_id = ? AND event_type = ? AND created_at >= ?`
      )
      .get(anonymousId, eventType, sinceDateIso) as { cnt: number };
    return row.cnt;
  }
  return 0;
}

// --------------- Stripe Events ---------------

export function isStripeEventProcessed(eventId: string): boolean {
  const db = getDb();
  const row = db
    .prepare("SELECT 1 FROM stripe_events WHERE stripe_event_id = ?")
    .get(eventId);
  return !!row;
}

export function markStripeEventProcessed(
  eventId: string,
  eventType: string
): void {
  const db = getWriteDb();
  try {
    db.prepare(
      "INSERT OR IGNORE INTO stripe_events (stripe_event_id, event_type) VALUES (?, ?)"
    ).run(eventId, eventType);
  } finally {
    db.close();
  }
}

// --------------- Alert Preferences ---------------

export function getAlertPreferences(orgId: number): AlertPreference | undefined {
  const db = getDb();
  return db
    .prepare("SELECT * FROM alert_preferences WHERE organization_id = ?")
    .get(orgId) as AlertPreference | undefined;
}

import type { AlertPreference } from "./types";

export function upsertAlertPreferences(data: {
  organization_id: number;
  categories?: string;
  peer_group_id?: number;
  frequency?: string;
  enabled?: number;
}): void {
  const db = getWriteDb();
  try {
    db.prepare(
      `INSERT INTO alert_preferences (organization_id, categories, peer_group_id, frequency, enabled)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(organization_id) DO UPDATE SET
         categories = excluded.categories,
         peer_group_id = excluded.peer_group_id,
         frequency = excluded.frequency,
         enabled = excluded.enabled`
    ).run(
      data.organization_id,
      data.categories ?? null,
      data.peer_group_id ?? null,
      data.frequency ?? "weekly",
      data.enabled ?? 1
    );
  } finally {
    db.close();
  }
}

export type SubscriptionPlan = "starter" | "professional" | "enterprise";
export type SubscriptionStatus = "active" | "past_due" | "canceled" | "trialing";
export type OrgMemberRole = "owner" | "admin" | "member";

export interface Organization {
  id: number;
  name: string;
  slug: string;
  charter_type: string | null;
  asset_tier: string | null;
  cert_number: string | null;
  stripe_customer_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Subscription {
  id: number;
  organization_id: number;
  stripe_subscription_id: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: number;
  created_at: string;
  updated_at: string;
}

export interface OrgMember {
  id: number;
  organization_id: number;
  email: string;
  password_hash: string;
  name: string | null;
  role: OrgMemberRole;
  created_at: string;
}

export interface ApiKey {
  id: number;
  organization_id: number;
  key_hash: string;
  key_prefix: string;
  name: string;
  last_used_at: string | null;
  created_at: string;
}

export interface UsageEvent {
  id: number;
  organization_id: number | null;
  anonymous_id: string | null;
  event_type: string;
  metadata: string | null;
  created_at: string;
}

export interface AlertPreference {
  id: number;
  organization_id: number;
  categories: string | null;
  peer_group_id: number | null;
  frequency: string;
  enabled: number;
  created_at: string;
}

export interface SavedSubscriberPeerGroup {
  id: number;
  organization_id: number;
  name: string;
  charter_types: string | null;
  asset_tiers: string | null;
  districts: string | null;
  created_at: string;
}

export interface SubscriberSession {
  organizationId: number;
  memberId: number;
  email: string;
  orgName: string;
  orgSlug: string;
  plan: SubscriptionPlan | null;
  subscriptionActive: boolean;
}

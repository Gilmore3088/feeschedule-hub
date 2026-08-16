import type { User } from "@/lib/auth";

/** Full premium access for app data, exports, and Hamilton workflows. */
export function canAccessPremium(user: User | null): boolean {
  if (!user) return false;
  if (user.role === "admin" || user.role === "analyst") return true;
  return user.subscription_status === "active";
}

/** Can see all 49 fee categories (free sees 6 spotlight only). */
export function canAccessAllCategories(user: User | null): boolean {
  return canAccessPremium(user);
}

/** Can use peer filters (charter, tier, district). */
export function canAccessPeerFilters(user: User | null): boolean {
  return canAccessPremium(user);
}

/** Can export CSV/bulk data. */
export function canExportData(user: User | null): boolean {
  return canAccessPremium(user);
}

/** Self-serve account API-key controls are disabled while keys require manual workspace setup. */
export function canAccessApiKey(user: User | null): boolean {
  void user;
  return false;
}

/** Can see full district data (Beige Book, indicators, speeches). */
export function canAccessFullDistrict(user: User | null): boolean {
  return canAccessPremium(user);
}

/** Number of fee categories visible. */
export function getVisibleCategoryCount(user: User | null): number {
  return canAccessPremium(user) ? 49 : 6;
}

/** Daily Hamilton analysis query limit. */
export function getResearchQueryLimit(user: User | null): number {
  if (!user) return 0;
  if (user.role === "admin") return 200;
  if (user.role === "analyst") return 50;
  if (canAccessPremium(user)) return 50;
  return 3; // free registered users
}

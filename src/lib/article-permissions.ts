import type { ArticleStatus } from "@/lib/crawler-db/types";

export type Role = "viewer" | "analyst" | "admin";

export const ALLOWED_TRANSITIONS: Record<ArticleStatus, readonly ArticleStatus[]> = {
  draft: ["review", "rejected"],
  review: ["approved", "rejected", "draft"],
  approved: ["published", "rejected"],
  published: ["approved"],
  rejected: ["draft"],
};

export const PUBLISH_PERMISSIONS: Record<ArticleStatus, readonly Role[]> = {
  draft: ["analyst", "admin"],
  review: ["analyst", "admin"],
  approved: ["analyst", "admin"],
  rejected: ["analyst", "admin"],
  published: ["admin"],
};

export function canTransition(from: ArticleStatus, to: ArticleStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function canSetStatus(role: Role, targetStatus: ArticleStatus): boolean {
  return PUBLISH_PERMISSIONS[targetStatus]?.includes(role) ?? false;
}

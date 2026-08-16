"use client";

import { useActionState } from "react";
import {
  grantWorkspaceAccess,
  revokeWorkspaceInvitation,
  revokeWorkspaceAccess,
  type WorkspaceAccessActionState,
} from "./actions";
import type {
  InstitutionWorkspaceInvitation,
  InstitutionWorkspaceMembership,
} from "@/lib/hamilton/institution-membership";
import { SITE_URL } from "@/lib/constants";

interface WorkspaceAccessManagerProps {
  institutionId: number | null;
  members: InstitutionWorkspaceMembership[];
  invitations: InstitutionWorkspaceInvitation[];
  canManage: boolean;
}

const initialState: WorkspaceAccessActionState = { success: false };
const WORKSPACE_INVITE_URL = `${SITE_URL.replace(/\/$/, "")}/workspace-invite`;

function roleLabel(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function sourceLabel(source: string): string {
  if (source === "claim") return "Claim";
  if (source === "delegated") return "Delegated";
  if (source === "manual_admin") return "Admin";
  return "Import";
}

function inviteMailto(invitation: InstitutionWorkspaceInvitation): string {
  const subject = `Bank Fee Index workspace invitation for ${invitation.institutionName}`;
  const body = [
    `You have been invited to ${invitation.institutionName} in Bank Fee Index Hamilton.`,
    "",
    `Role: ${roleLabel(invitation.role)}`,
    `Invite email: ${invitation.email}`,
    "",
    "Use the same email address to sign in or create an account, then activate a Pro seat. Hamilton will attach the delegated workspace automatically once the email and Pro seat match.",
    "",
    WORKSPACE_INVITE_URL,
  ].join("\n");

  return `mailto:${encodeURIComponent(invitation.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function WorkspaceAccessManager({
  institutionId,
  members,
  invitations,
  canManage,
}: WorkspaceAccessManagerProps) {
  const [grantState, grantAction, isGrantPending] = useActionState(
    grantWorkspaceAccess,
    initialState,
  );
  const [revokeState, revokeAction, isRevokePending] = useActionState(
    revokeWorkspaceAccess,
    initialState,
  );
  const [revokeInviteState, revokeInviteAction, isRevokeInvitePending] = useActionState(
    revokeWorkspaceInvitation,
    initialState,
  );

  if (!institutionId) {
    return (
      <p className="text-sm" style={{ color: "var(--hamilton-text-tertiary)" }}>
        Select a Hamilton institution before managing team access.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {members.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--hamilton-text-tertiary)" }}>
            No active workspace members yet.
          </p>
        ) : (
          members.map((member) => (
            <div
              key={member.id}
              className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
              style={{
                borderColor: "var(--hamilton-border)",
                backgroundColor: "var(--hamilton-surface-container-low)",
              }}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold" style={{ color: "var(--hamilton-text-primary)" }}>
                  {member.userDisplayName ?? member.userEmail ?? `User ${member.userId}`}
                </p>
                <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs" style={{ color: "var(--hamilton-text-secondary)" }}>
                  {member.userEmail && <span>{member.userEmail}</span>}
                  <span>{roleLabel(member.role)}</span>
                  <span>{sourceLabel(member.source)}</span>
                  <span>Since {new Date(member.grantedAt).toLocaleDateString()}</span>
                </p>
              </div>
              {canManage && member.role !== "owner" && (
                <form action={revokeAction}>
                  <input type="hidden" name="institution_id" value={institutionId} />
                  <input type="hidden" name="membership_id" value={member.id} />
                  <button
                    type="submit"
                    disabled={isRevokePending}
                    className="rounded-md border px-3 py-2 text-xs font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
                    style={{
                      borderColor: "var(--hamilton-border)",
                      color: "var(--hamilton-text-secondary)",
                      backgroundColor: "white",
                    }}
                  >
                    Revoke
                  </button>
                </form>
              )}
            </div>
          ))
        )}
      </div>

      {invitations.length > 0 && (
        <div className="space-y-2">
          <p
            className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--hamilton-text-secondary)" }}
          >
            Pending Invitations
          </p>
          {invitations.map((invitation) => (
            <div
              key={invitation.id}
              className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
              style={{
                borderColor: "var(--hamilton-border)",
                backgroundColor: "var(--hamilton-surface-container-low)",
              }}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold" style={{ color: "var(--hamilton-text-primary)" }}>
                  {invitation.email}
                </p>
                <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs" style={{ color: "var(--hamilton-text-secondary)" }}>
                  <span>{roleLabel(invitation.role)}</span>
                  <span>Pending Pro activation</span>
                  <span>Expires {new Date(invitation.expiresAt).toLocaleDateString()}</span>
                </p>
                <p className="mt-1 text-xs" style={{ color: "var(--hamilton-text-tertiary)" }}>
                  Recipient path: <a href="/workspace-invite" className="font-semibold underline">/workspace-invite</a>
                </p>
              </div>
              {canManage && (
                <div className="flex flex-wrap gap-2">
                  <a
                    href={inviteMailto(invitation)}
                    className="rounded-md border px-3 py-2 text-xs font-semibold no-underline"
                    style={{
                      borderColor: "var(--hamilton-border)",
                      color: "var(--hamilton-text-primary)",
                      backgroundColor: "white",
                    }}
                  >
                    Email Invite
                  </a>
                  <form action={revokeInviteAction}>
                    <input type="hidden" name="institution_id" value={institutionId} />
                    <input type="hidden" name="invitation_id" value={invitation.id} />
                    <button
                      type="submit"
                      disabled={isRevokeInvitePending}
                      className="rounded-md border px-3 py-2 text-xs font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
                      style={{
                        borderColor: "var(--hamilton-border)",
                        color: "var(--hamilton-text-secondary)",
                        backgroundColor: "white",
                      }}
                    >
                      Revoke Invite
                    </button>
                  </form>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {canManage ? (
        <form
          action={grantAction}
          className="grid grid-cols-1 gap-3 rounded-md border p-3 sm:grid-cols-[minmax(0,1fr)_140px] lg:grid-cols-1 xl:grid-cols-[minmax(0,1fr)_140px]"
          style={{
            borderColor: "var(--hamilton-border)",
            backgroundColor: "white",
          }}
        >
          <input type="hidden" name="institution_id" value={institutionId} />
          <div className="min-w-0">
            <label
              htmlFor="workspace_access_email"
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--hamilton-text-secondary)" }}
            >
              User or Invite Email
            </label>
            <input
              id="workspace_access_email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="analyst@example.com"
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none"
              style={{
                borderColor: "var(--hamilton-border)",
                color: "var(--hamilton-text-primary)",
              }}
            />
          </div>
          <div>
            <label
              htmlFor="workspace_access_role"
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--hamilton-text-secondary)" }}
            >
              Role
            </label>
            <select
              id="workspace_access_role"
              name="role"
              defaultValue="analyst"
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none"
              style={{
                borderColor: "var(--hamilton-border)",
                color: "var(--hamilton-text-primary)",
              }}
            >
              <option value="admin">Admin</option>
              <option value="analyst">Analyst</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>
          <div className="sm:col-span-2 lg:col-span-1 xl:col-span-2">
            <label
              htmlFor="workspace_access_notes"
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--hamilton-text-secondary)" }}
            >
              Notes
            </label>
            <textarea
              id="workspace_access_notes"
              name="notes"
              rows={2}
              placeholder="Optional reason or access scope"
              className="mt-1 w-full resize-y rounded-md border px-3 py-2 text-sm outline-none"
              style={{
                borderColor: "var(--hamilton-border)",
                color: "var(--hamilton-text-primary)",
              }}
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-1 xl:col-span-2">
            <p className="mb-2 text-xs" style={{ color: "var(--hamilton-text-tertiary)" }}>
              If the user is not active Pro yet, Settings queues the invite. Send them{" "}
              <a href="/workspace-invite" className="font-semibold underline">
                /workspace-invite
              </a>
              {" "}so they can register, subscribe, and attach the workspace with the same email.
            </p>
            <button
              type="submit"
              disabled={isGrantPending}
              className="rounded-md px-4 py-2.5 text-sm font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
              style={{ background: "var(--hamilton-gradient-cta)" }}
            >
              {isGrantPending ? "Granting..." : "Grant Access"}
            </button>
          </div>
        </form>
      ) : (
        <p className="text-sm" style={{ color: "var(--hamilton-text-tertiary)" }}>
          Institution owner or admin authority is required to grant or revoke team access.
        </p>
      )}

      {grantState.success && grantState.message && (
        <p className="text-sm font-medium" style={{ color: "oklch(0.55 0.15 145)" }}>
          {grantState.message}
        </p>
      )}
      {!grantState.success && grantState.error && (
        <p className="text-sm font-medium" style={{ color: "oklch(0.55 0.22 25)" }}>
          {grantState.error}
        </p>
      )}
      {revokeState.success && revokeState.message && (
        <p className="text-sm font-medium" style={{ color: "oklch(0.55 0.15 145)" }}>
          {revokeState.message}
        </p>
      )}
      {!revokeState.success && revokeState.error && (
        <p className="text-sm font-medium" style={{ color: "oklch(0.55 0.22 25)" }}>
          {revokeState.error}
        </p>
      )}
      {revokeInviteState.success && revokeInviteState.message && (
        <p className="text-sm font-medium" style={{ color: "oklch(0.55 0.15 145)" }}>
          {revokeInviteState.message}
        </p>
      )}
      {!revokeInviteState.success && revokeInviteState.error && (
        <p className="text-sm font-medium" style={{ color: "oklch(0.55 0.22 25)" }}>
          {revokeInviteState.error}
        </p>
      )}
    </div>
  );
}

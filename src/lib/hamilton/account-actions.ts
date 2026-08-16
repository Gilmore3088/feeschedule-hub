import { buildInstitutionProfileLinks } from "@/lib/institution-profile-links";
import { hrefWithInstitutionContext } from "@/lib/hamilton/context-link";

export interface AccountSelectedInstitutionActionContext {
  id: number;
  name: string;
}

export interface BuildHamiltonAccountHrefParams {
  isPro: boolean;
  path: string;
  selectedInstitutionId?: number | string | null;
  params?: Record<string, string | null | undefined>;
}

export interface AccountQuickAction {
  label: string;
  description: string;
  href: string;
  icon: string;
  premium: boolean;
}

export interface BuildAccountQuickActionsParams {
  isPro: boolean;
  userStateCode?: string | null;
  districtName?: string | null;
  selectedInstitution?: AccountSelectedInstitutionActionContext | null;
}

const ICONS = {
  analyze:
    "M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z",
  report:
    "M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064",
  scenario:
    "M4 19h16M4 15l4-4 4 3 4-7 4 5M5 5h.01M9 5h.01M13 5h.01",
  monitor:
    "M12 8v4l3 3M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  source:
    "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0119 9.414V19a2 2 0 01-2 2z",
  peers:
    "M17 20h5v-2a4 4 0 00-4-4h-1M9 20H4v-2a4 4 0 014-4h1m0-4a4 4 0 118 0 4 4 0 01-8 0z",
  benchmark:
    "M3 13h4v8H3zM10 8h4v13h-4zM17 3h4v18h-4z",
  export:
    "M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
} as const;

function hrefWithParams(
  path: string,
  params?: Record<string, string | null | undefined>,
): string {
  if (!params) return path;

  const fragmentIndex = path.indexOf("#");
  const pathWithoutFragment = fragmentIndex === -1 ? path : path.slice(0, fragmentIndex);
  const fragment = fragmentIndex === -1 ? "" : path.slice(fragmentIndex);
  const [pathname, query = ""] = pathWithoutFragment.split("?");
  const nextParams = new URLSearchParams(query);

  for (const [key, value] of Object.entries(params)) {
    if (value) nextParams.set(key, value);
  }

  const queryString = nextParams.toString();
  return `${queryString ? `${pathname}?${queryString}` : pathname}${fragment}`;
}

function subscribeHref(returnTo: string): string {
  return `/subscribe?from=${encodeURIComponent(returnTo)}`;
}

export function buildHamiltonAccountHref({
  isPro,
  path,
  selectedInstitutionId,
  params,
}: BuildHamiltonAccountHrefParams): string {
  const withParams = hrefWithParams(path, params);
  const target = hrefWithInstitutionContext(
    withParams,
    selectedInstitutionId ? String(selectedInstitutionId) : null,
  );
  return isPro ? target : subscribeHref(target);
}

export function buildAccountQuickActions({
  isPro,
  userStateCode,
  districtName,
  selectedInstitution,
}: BuildAccountQuickActionsParams): AccountQuickAction[] {
  const proHref = (
    path: string,
    params?: Record<string, string | null | undefined>,
  ) =>
    buildHamiltonAccountHref({
      isPro,
      path,
      params,
      selectedInstitutionId: selectedInstitution?.id ?? null,
    });

  const sourceHref = selectedInstitution
    ? buildInstitutionProfileLinks({
        institutionId: selectedInstitution.id,
        institutionName: selectedInstitution.name,
      }).submitSourceHref
    : "/submit-fees";

  return [
    {
      label: "Analyze Institution",
      description: isPro
        ? "Provisional-first Hamilton workflow with verified benchmark caveats"
        : "Upgrade for selected-institution Hamilton workflows",
      href: proHref("/pro/analyze", { intent: "institution" }),
      icon: ICONS.analyze,
      premium: true,
    },
    {
      label: "Generate Brief",
      description: selectedInstitution
        ? "Competitive brief, or a readiness brief when evidence is thin"
        : "Start a policy-labeled Hamilton report",
      href: proHref("/pro/reports", { intent: "competitive-brief" }),
      icon: ICONS.report,
      premium: true,
    },
    {
      label: "Run Scenario",
      description: "Model fee changes against a verified-only peer baseline",
      href: proHref("/pro/simulate"),
      icon: ICONS.scenario,
      premium: true,
    },
    {
      label: "Watch Competitors",
      description: "Track matched institutions and manual refresh work",
      href: proHref("/pro/monitor"),
      icon: ICONS.monitor,
      premium: true,
    },
    {
      label: "Submit Source",
      description: selectedInstitution
        ? `Queue an official source for ${selectedInstitution.name}`
        : "Queue an official fee schedule for review",
      href: sourceHref,
      icon: ICONS.source,
      premium: false,
    },
    {
      label: "Update Peer Set",
      description: "Choose the peer universe used by reports and scenarios",
      href: proHref("/pro/settings#peer-sets"),
      icon: ICONS.peers,
      premium: true,
    },
    {
      label: "Fee Benchmarks",
      description: userStateCode
        ? `Verified medians in ${userStateCode}`
        : districtName
          ? `${districtName} verified benchmark context`
          : "Verified national fee medians",
      href: userStateCode ? `/research/state/${userStateCode}` : "/fees",
      icon: ICONS.benchmark,
      premium: false,
    },
    {
      label: "Export Data",
      description: "Download verified-only CSV data",
      href: isPro ? "/api/v1/fees?format=csv" : subscribeHref("/api/v1/fees?format=csv"),
      icon: ICONS.export,
      premium: true,
    },
  ];
}

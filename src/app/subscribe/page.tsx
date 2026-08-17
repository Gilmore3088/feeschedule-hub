export const dynamic = "force-dynamic";
import { getCurrentUser } from "@/lib/auth";
import { canAccessPremium } from "@/lib/access";
import { redirect } from "next/navigation";
import { CustomerNav } from "@/components/customer-nav";
import { CustomerFooter } from "@/components/customer-footer";
import { SearchModal } from "@/components/public/search-modal";
import { getPendingWorkspaceInvitationsForEmail } from "@/lib/hamilton/institution-membership";
import { sanitizeInternalRedirect } from "@/lib/safe-redirect";
import type { Metadata } from "next";
import { getPublicStatsSummary } from "@/lib/public-stats";
import { SITE_NAME } from "@/lib/constants";
import { ProPlanCards } from "./pro-plan-cards";
import { AdvisoryCard, ContactSalesCard, FreeTierCard, PricingFaq } from "./pricing-sections";
import {
  ANNUAL_PRICE_LABEL,
  MONTHLY_PRICE_LABEL,
  REPORT_PRICE_LABEL,
  isProPlan,
  proFeatureList,
  type ProPlan,
} from "./pricing";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Fee Insight pricing: free Bank Fee Index lookup, Fee Insight Pro seats (monthly or annual), and the Competitive Fee Position Report.",
};

const MONTHLY_PRICE_ID = process.env.STRIPE_PRO_PRICE_ID || "";
const ANNUAL_PRICE_ID = process.env.STRIPE_ANNUAL_PRICE_ID || "";
const WELCOME_PATH = "/account/welcome";

interface SubscribeSearchParams {
  success?: string;
  invite?: string;
  from?: string;
  plan?: string;
}

function buildSubscribeReturnPath(options: {
  inviteMode: boolean;
  returnTo: string | null;
  plan: ProPlan | null;
}): string {
  const params = new URLSearchParams();
  if (options.inviteMode) params.set("invite", "workspace");
  if (options.returnTo && options.returnTo !== WELCOME_PATH) params.set("from", options.returnTo);
  if (options.plan) params.set("plan", options.plan);
  const query = params.toString();
  return query ? `/subscribe?${query}` : "/subscribe";
}

export default async function SubscribePage({
  searchParams,
}: {
  searchParams: Promise<SubscribeSearchParams>;
}) {
  const user = await getCurrentUser();
  const params = await searchParams;
  const summary = await getPublicStatsSummary();
  const features = proFeatureList(summary);
  const returnTo = params.from ? sanitizeInternalRedirect(params.from, WELCOME_PATH) : null;
  const requestedPlan: ProPlan | null = isProPlan(params.plan) ? params.plan : null;

  if (user && canAccessPremium(user)) {
    redirect(returnTo && returnTo !== WELCOME_PATH ? returnTo : "/account");
  }

  const isLoggedIn = !!user;
  const pendingInvitations =
    user && !canAccessPremium(user)
      ? await getPendingWorkspaceInvitationsForEmail(user.email ?? user.username, 5).catch(() => [])
      : [];
  const inviteMode = params.invite === "workspace" || pendingInvitations.length > 0;

  const registerHrefFor = (plan: ProPlan) => {
    const back = buildSubscribeReturnPath({ inviteMode, returnTo, plan });
    return `/register?plan=${plan}&from=${encodeURIComponent(back)}`;
  };
  const loginHref = `/login?from=${encodeURIComponent(
    buildSubscribeReturnPath({ inviteMode, returnTo, plan: requestedPlan }),
  )}`;

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      <CustomerNav />

      <div className="mx-auto max-w-4xl px-4 py-14">
        {params.success && (
          <div className="mb-6 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm text-emerald-700">
            Subscription activated. You now have full access.
          </div>
        )}

        {inviteMode && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-semibold">Workspace invitation pending</p>
            <p className="mt-1">
              Activate a Pro seat with the invited email and Hamilton will attach the delegated
              institution workspace automatically.
            </p>
            {pendingInvitations.length > 0 && (
              <div className="mt-3 grid gap-2">
                {pendingInvitations.map((invitation) => (
                  <div key={invitation.id} className="rounded-md border border-amber-200 bg-white/60 px-3 py-2">
                    <span className="font-semibold">{invitation.institutionName}</span>
                    <span className="text-amber-800"> · {invitation.role} access</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mb-10 text-center">
          <h1
            className="mb-3 text-3xl font-normal tracking-tight text-[#1A1815]"
            style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
          >
            Simple, transparent pricing
          </h1>
          <p className="mx-auto max-w-2xl text-base text-[#5A5347]">
            Report ({REPORT_PRICE_LABEL}) → {SITE_NAME} Pro ({MONTHLY_PRICE_LABEL}/mo per seat, or{" "}
            {ANNUAL_PRICE_LABEL}/yr) → {SITE_NAME} Advisory (custom)
          </p>
        </div>

        <div className="space-y-8">
          <FreeTierCard summary={summary} />

          <section aria-labelledby="pro-heading">
            <div className="mb-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#7A7062]">
                {SITE_NAME} Pro
              </p>
              <h2
                id="pro-heading"
                className="mt-1 text-xl text-[#1A1815]"
                style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
              >
                Full workspace access, per seat. Same features on either plan.
              </h2>
            </div>
            <ProPlanCards
              features={features}
              isLoggedIn={isLoggedIn}
              monthlyPriceId={MONTHLY_PRICE_ID}
              annualPriceId={ANNUAL_PRICE_ID}
              returnTo={returnTo ?? undefined}
              registerHrefFor={registerHrefFor}
              highlightedPlan={requestedPlan}
            />
          </section>

          <AdvisoryCard />
          <PricingFaq summary={summary} />
          <ContactSalesCard />
        </div>

        {!isLoggedIn && (
          <p className="mt-8 text-center text-xs text-[#7A7062]">
            Already have an account?{" "}
            <a href={loginHref} className="text-[#5A5347] underline underline-offset-2 hover:text-[#1A1815]">
              Sign in
            </a>
          </p>
        )}
      </div>
      <CustomerFooter />
      <SearchModal />
    </div>
  );
}

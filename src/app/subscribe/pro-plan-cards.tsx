import type { ReactNode } from "react";
import { TrackLink } from "@/components/track-link";
import { SubscribeButton } from "./subscribe-button";
import {
  ANNUAL_PRICE_LABEL,
  ANNUAL_SAVINGS_LABEL,
  MONTHLY_PRICE_LABEL,
  type ProPlan,
} from "./pricing";

interface ProPlanCardsProps {
  features: string[];
  isLoggedIn: boolean;
  monthlyPriceId: string;
  annualPriceId: string;
  returnTo?: string;
  registerHrefFor: (plan: ProPlan) => string;
  highlightedPlan: ProPlan | null;
}

const CHECK = "✓";

export function ProPlanCards({
  features,
  isLoggedIn,
  monthlyPriceId,
  annualPriceId,
  returnTo,
  registerHrefFor,
  highlightedPlan,
}: ProPlanCardsProps) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <PlanCard
        plan="monthly"
        eyebrow="Monthly"
        priceLabel={MONTHLY_PRICE_LABEL}
        priceSuffix="/mo per seat"
        features={features}
        highlighted={highlightedPlan === "monthly"}
        cta={
          isLoggedIn ? (
            <SubscribeButton
              priceId={monthlyPriceId}
              mode="subscription"
              returnTo={returnTo}
              label="Start monthly"
              className="w-full rounded-md bg-[#1A1815] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#2A2825] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            />
          ) : (
            <TrackLink
              event="checkout_start"
              eventProps={{ plan: "monthly" }}
              href={registerHrefFor("monthly")}
              className="block w-full rounded-md bg-[#1A1815] px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-[#2A2825] transition-colors"
            >
              Start monthly
            </TrackLink>
          )
        }
      />
      <PlanCard
        plan="annual"
        eyebrow="Annual"
        priceLabel={ANNUAL_PRICE_LABEL}
        priceSuffix="/yr per seat"
        note={`Save ${ANNUAL_SAVINGS_LABEL} vs monthly`}
        badge="Best value"
        features={features}
        highlighted={highlightedPlan === "annual"}
        cta={
          isLoggedIn ? (
            <SubscribeButton
              priceId={annualPriceId}
              mode="subscription"
              returnTo={returnTo}
              label="Start annual"
              className="w-full rounded-md bg-[#C44B2E] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#A93D25] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            />
          ) : (
            <TrackLink
              event="checkout_start"
              eventProps={{ plan: "annual" }}
              href={registerHrefFor("annual")}
              className="block w-full rounded-md bg-[#C44B2E] px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-[#A93D25] transition-colors"
            >
              Start annual
            </TrackLink>
          )
        }
      />
    </div>
  );
}

interface PlanCardProps {
  plan: ProPlan;
  eyebrow: string;
  priceLabel: string;
  priceSuffix: string;
  note?: string;
  badge?: string;
  features: string[];
  highlighted: boolean;
  cta: ReactNode;
}

function PlanCard({ plan, eyebrow, priceLabel, priceSuffix, note, badge, features, highlighted, cta }: PlanCardProps) {
  const border = plan === "annual" ? "border-2 border-[#C44B2E]" : "border border-[#E0D7C9]";
  const ring = highlighted ? " ring-2 ring-[#C44B2E]/30 ring-offset-2 ring-offset-[#FAF7F2]" : "";
  return (
    <div id={`plan-${plan}`} className={`relative flex flex-col rounded-xl bg-[#FDFBF8] p-6 ${border}${ring}`}>
      {badge && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="rounded-full bg-[#C44B2E] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white">
            {badge}
          </span>
        </div>
      )}
      <div className="mb-4">
        <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#7A7062]">{eyebrow}</div>
        <div className="flex items-baseline gap-1">
          <span
            className="text-3xl font-bold text-[#1A1815]"
            style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
          >
            {priceLabel}
          </span>
          <span className="text-sm text-[#7A7062]">{priceSuffix}</span>
        </div>
        {note && <div className="mt-1 text-xs font-medium text-[#C44B2E]">{note}</div>}
      </div>
      <ul className="mb-6 flex-1 space-y-2 text-sm text-[#5A5347]">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-2">
            <span className="mt-0.5 flex-shrink-0 text-[#C44B2E]">{CHECK}</span>
            {feature}
          </li>
        ))}
      </ul>
      {cta}
    </div>
  );
}

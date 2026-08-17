import Link from "next/link";
import { TrackLink } from "@/components/track-link";
import { CONTACT_EMAIL, PRODUCT_NAME, SITE_NAME } from "@/lib/constants";
import type { PublicStatsSummary } from "@/lib/public-stats";
import { REPORT_BULLETS, REPORT_PRICE_LABEL } from "./pricing";

const CARD_CLASS = "rounded-xl border border-[#E0D7C9] bg-[#FDFBF8] p-6";
const SECONDARY_BUTTON_CLASS =
  "inline-block rounded-md border border-[#D5CBBF] px-5 py-2.5 text-sm font-medium text-[#1A1815] hover:border-[#1A1815] transition-colors";
const CHECK = "✓";

const REPORT_ANCHOR_HREF = "/for-institutions#report";
const WALKTHROUGH_HREF = `mailto:${CONTACT_EMAIL}?subject=Walkthrough`;

export function FreeTierCard({ summary }: { summary: PublicStatsSummary }) {
  return (
    <div className={`${CARD_CLASS} md:flex md:items-center md:justify-between md:gap-8`}>
      <div>
        <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#7A7062]">Free</div>
        <p className="text-base text-[#1A1815]">
          <span className="font-semibold">{PRODUCT_NAME} lookup:</span> published fees for{" "}
          {summary.institutionsLabel} banks and credit unions, {summary.categoriesLabel} categories,
          consumer guides.
        </p>
      </div>
      <div className="mt-4 flex-shrink-0 md:mt-0 md:w-56">
        <Link
          href="/institutions"
          className="block w-full rounded-md border border-[#D5CBBF] px-4 py-2.5 text-center text-sm font-medium text-[#1A1815] hover:border-[#1A1815] transition-colors"
        >
          Search the index
        </Link>
      </div>
    </div>
  );
}

export function AdvisoryCard() {
  return (
    <div className={CARD_CLASS}>
      <div className="md:flex md:items-start md:justify-between md:gap-8">
        <div>
          <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#7A7062]">
            {SITE_NAME} Advisory
          </div>
          <h2
            className="text-xl text-[#1A1815]"
            style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
          >
            Competitive Fee Position Report — {REPORT_PRICE_LABEL} per report, delivered in 48 hours
          </h2>
          <ul className="mt-3 grid gap-x-6 gap-y-1 text-sm text-[#5A5347] sm:grid-cols-2">
            {REPORT_BULLETS.map((bullet) => (
              <li key={bullet} className="flex items-start gap-1.5">
                <span className="text-[#C44B2E]">{CHECK}</span>
                {bullet}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-[#5A5347]">
            Custom competitor sets, board decks and multi-institution work:{" "}
            <TrackLink
              event="contact_sales"
              eventProps={{ placement: "pricing_advisory" }}
              href={`mailto:${CONTACT_EMAIL}?subject=Fee%20Insight%20Advisory`}
              className="font-medium text-[#1A1815] underline underline-offset-2"
            >
              contact us
            </TrackLink>
            .
          </p>
        </div>
        <div className="mt-4 flex-shrink-0 md:mt-0 md:w-56">
          <TrackLink
            event="request_report"
            eventProps={{ placement: "pricing_advisory" }}
            href={REPORT_ANCHOR_HREF}
            className="block w-full rounded-md bg-[#1A1815] px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-[#2A2825] transition-colors"
          >
            Commission a report
          </TrackLink>
        </div>
      </div>
    </div>
  );
}

function faqItems(summary: PublicStatsSummary) {
  return [
    {
      question: "Can I cancel anytime?",
      answer: "Yes. Monthly seats cancel at the end of the current billing period; no long-term commitment.",
    },
    {
      question: "Do you invoice or accept POs?",
      answer: `Yes, for annual seats. Email ${CONTACT_EMAIL} and we will send an invoice or work from your PO.`,
    },
    {
      question: "How do seats work?",
      answer: `One seat per named user. Each seat is billed separately; to add colleagues, email ${CONTACT_EMAIL} and we will set them up on the same workspace.`,
    },
    {
      question: "How often is the data refreshed?",
      answer: `Continuously; ${summary.freshnessLabel}.`,
    },
  ];
}

export function PricingFaq({ summary }: { summary: PublicStatsSummary }) {
  return (
    <section aria-labelledby="pricing-faq-heading">
      <h2
        id="pricing-faq-heading"
        className="mb-4 text-xl text-[#1A1815]"
        style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
      >
        Questions before you start
      </h2>
      <div className="divide-y divide-[#E0D7C9] rounded-xl border border-[#E0D7C9] bg-[#FDFBF8]">
        {faqItems(summary).map((item) => (
          <details key={item.question} className="group px-6 py-4">
            <summary className="cursor-pointer list-none text-sm font-semibold text-[#1A1815] marker:content-none">
              {item.question}
            </summary>
            <p className="mt-2 text-sm leading-relaxed text-[#5A5347]">{item.answer}</p>
          </details>
        ))}
      </div>
      <p className="mt-4 text-sm text-[#5A5347]">
        Prefer to talk it through?{" "}
        <TrackLink
          event="book_walkthrough"
          eventProps={{ placement: "pricing_faq" }}
          href={WALKTHROUGH_HREF}
          className="font-medium text-[#1A1815] underline underline-offset-2"
        >
          Book a 20-minute walkthrough
        </TrackLink>
        .
      </p>
    </section>
  );
}

export function ContactSalesCard() {
  return (
    <div className={`${CARD_CLASS} p-8 text-center`}>
      <h2
        className="mb-2 text-xl font-normal text-[#1A1815]"
        style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
      >
        Need a custom solution?
      </h2>
      <p className="mb-4 text-sm text-[#5A5347]">
        Multi-seat licenses, data feeds, SLA, and dedicated support for large institutions and
        vendors.
      </p>
      <TrackLink
        event="contact_sales"
        eventProps={{ placement: "pricing_enterprise" }}
        href="/contact?source=enterprise"
        className={SECONDARY_BUTTON_CLASS}
      >
        Contact sales
      </TrackLink>
    </div>
  );
}

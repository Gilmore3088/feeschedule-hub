import type { Metadata } from "next";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = {
  title: "Contact - Bank Fee Index",
  description: "Get in touch with Bank Fee Index for enterprise licensing, custom reports, or general inquiries.",
};

export default function ContactPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <div className="mx-auto max-w-2xl px-6 py-14">
      <div className="flex items-center gap-2 mb-4">
        <span className="h-px w-8 bg-[#C44B2E]/40" />
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#C44B2E]/60">
          Contact
        </span>
      </div>

      <h1
        className="text-[1.75rem] sm:text-[2.25rem] leading-[1.12] tracking-[-0.02em] text-[#1A1815]"
        style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
      >
        Get in touch
      </h1>
      <p className="mt-2 text-[14px] text-[#7A7062]">
        Enterprise licensing, custom reports, data partnerships, or general
        questions. We typically respond within one business day.
      </p>

      <div className="mt-8">
        <ContactForm searchParamsPromise={searchParams} />
      </div>

      <div className="mt-10 rounded-xl border border-[#E8DFD1] bg-[#FAF7F2]/50 px-6 py-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#A09788] mb-2">
          Prefer email?
        </p>
        <p className="text-[13px] text-[#7A7062]">
          Reach us directly at{" "}
          <span className="text-[#C44B2E] font-medium select-all">
            hello@bankfeeindex.com
          </span>
        </p>
      </div>
    </div>
  );
}

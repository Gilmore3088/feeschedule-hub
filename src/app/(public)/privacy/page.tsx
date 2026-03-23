import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy - Bank Fee Index",
  description: "Bank Fee Index privacy policy. How we collect, use, and protect your data.",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-14">
      <div className="flex items-center gap-2 mb-4">
        <span className="h-px w-8 bg-[#C44B2E]/40" />
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#C44B2E]/60">
          Legal
        </span>
      </div>

      <h1
        className="text-[1.75rem] sm:text-[2.25rem] leading-[1.12] tracking-[-0.02em] text-[#1A1815]"
        style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
      >
        Privacy Policy
      </h1>
      <p className="mt-2 text-[13px] text-[#A09788]">
        Last updated: March 2026
      </p>

      <div className="mt-8 space-y-6 text-[14px] leading-relaxed text-[#5A5347]">
        <section>
          <h2 className="text-[16px] font-medium text-[#1A1815] mb-2"
            style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}>
            Information We Collect
          </h2>
          <p>
            <strong>Account information.</strong> When you create an account, we collect
            your name, email address, and optionally your institution name, job role,
            state, and asset tier. This information is used to personalize your
            experience and provide relevant benchmarks.
          </p>
          <p className="mt-3">
            <strong>Usage data.</strong> We collect information about how you use
            Bank Fee Index, including pages visited, features used, and AI research
            queries. This helps us improve the product and understand usage patterns.
          </p>
          <p className="mt-3">
            <strong>Payment information.</strong> Subscription payments are processed
            by Stripe. We do not store credit card numbers or full payment details
            on our servers. We retain your Stripe customer ID for subscription
            management.
          </p>
        </section>

        <section>
          <h2 className="text-[16px] font-medium text-[#1A1815] mb-2"
            style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}>
            How We Use Your Information
          </h2>
          <ul className="list-disc pl-6 space-y-1.5">
            <li>Provide and maintain the Bank Fee Index platform</li>
            <li>Personalize fee benchmarks based on your institution profile</li>
            <li>Process subscription payments and manage your account</li>
            <li>Send service-related communications (billing, security, product updates)</li>
            <li>Improve our data coverage and analytical features</li>
            <li>Respond to support requests and inquiries</li>
          </ul>
        </section>

        <section>
          <h2 className="text-[16px] font-medium text-[#1A1815] mb-2"
            style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}>
            Data We Publish
          </h2>
          <p>
            Bank Fee Index aggregates and publishes fee schedule data from
            publicly available sources. All fee data displayed on our platform
            is derived from institutions&apos; own published disclosures and
            regulatory filings. We do not publish any data that is not already
            publicly available.
          </p>
        </section>

        <section>
          <h2 className="text-[16px] font-medium text-[#1A1815] mb-2"
            style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}>
            Cookies
          </h2>
          <p>
            We use essential cookies for authentication (session management)
            and a preference cookie for dark mode settings. We do not use
            third-party advertising cookies or cross-site tracking.
          </p>
        </section>

        <section>
          <h2 className="text-[16px] font-medium text-[#1A1815] mb-2"
            style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}>
            Data Security
          </h2>
          <p>
            We implement industry-standard security measures to protect your
            information. Passwords are hashed using bcrypt. Database connections
            use encryption in transit. Payment processing is handled entirely
            by Stripe, a PCI DSS Level 1 certified provider.
          </p>
        </section>

        <section>
          <h2 className="text-[16px] font-medium text-[#1A1815] mb-2"
            style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}>
            Data Retention
          </h2>
          <p>
            Account data is retained for the duration of your account. If you
            delete your account, we will remove your personal information within
            30 days. Anonymized usage analytics may be retained for product
            improvement purposes.
          </p>
        </section>

        <section>
          <h2 className="text-[16px] font-medium text-[#1A1815] mb-2"
            style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}>
            Third-Party Services
          </h2>
          <ul className="list-disc pl-6 space-y-1.5">
            <li><strong>Stripe</strong> for payment processing</li>
            <li><strong>Anthropic (Claude)</strong> for AI-powered research features</li>
            <li><strong>Fly.io</strong> for application hosting</li>
          </ul>
          <p className="mt-3">
            Each of these providers has their own privacy policy governing
            how they process data.
          </p>
        </section>

        <section>
          <h2 className="text-[16px] font-medium text-[#1A1815] mb-2"
            style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}>
            Your Rights
          </h2>
          <p>
            You may request access to, correction of, or deletion of your
            personal information at any time by contacting us at{" "}
            <a href="mailto:hello@bankfeeindex.com" className="text-[#C44B2E] hover:underline">
              hello@bankfeeindex.com
            </a>.
          </p>
        </section>

        <section>
          <h2 className="text-[16px] font-medium text-[#1A1815] mb-2"
            style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}>
            Changes to This Policy
          </h2>
          <p>
            We may update this privacy policy from time to time. Material
            changes will be communicated via email to registered users.
            Continued use of the platform after changes constitutes acceptance
            of the updated policy.
          </p>
        </section>

        <div className="pt-4 border-t border-[#E8DFD1]">
          <p className="text-[13px] text-[#A09788]">
            Questions about this policy? Contact us at{" "}
            <a href="mailto:hello@bankfeeindex.com" className="text-[#C44B2E] hover:underline">
              hello@bankfeeindex.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

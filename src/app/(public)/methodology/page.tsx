import type { Metadata } from "next";
import { SITE_URL } from "@/lib/constants";

const METHODOLOGY_URL = `${SITE_URL}/methodology`;

const jsonLdData = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "How Bank Fee Index Works",
  description:
    "A transparent account of how Bank Fee Index collects, classifies, and verifies fee data across 4,000+ financial institutions.",
  url: METHODOLOGY_URL,
  datePublished: "2026-04-06T00:00:00Z",
  author: {
    "@type": "Organization",
    name: "Bank Fee Index",
    url: SITE_URL,
  },
  publisher: {
    "@type": "Organization",
    name: "Bank Fee Index",
    url: SITE_URL,
  },
};

export const metadata: Metadata = {
  title: "Methodology — How Bank Fee Index Works",
  description:
    "Bank Fee Index collects fee schedules from 4,000+ banks and credit unions using visible agent runs, deterministic extraction, and statistical validation. Learn how our data is collected, categorized, and verified.",
  alternates: {
    canonical: METHODOLOGY_URL,
  },
  openGraph: {
    title: "Methodology — How Bank Fee Index Works",
    description:
      "A transparent account of how Bank Fee Index collects, classifies, and verifies fee data across 4,000+ financial institutions.",
    url: METHODOLOGY_URL,
    siteName: "Bank Fee Index",
    type: "article",
    publishedTime: "2026-04-06T00:00:00Z",
    authors: ["Bank Fee Index"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Methodology — How Bank Fee Index Works",
    description:
      "A transparent account of how Bank Fee Index collects, classifies, and verifies fee data across 4,000+ financial institutions.",
  },
};

export default function MethodologyPage() {
  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdData) }}
      />
      <div style={{ maxWidth: "760px", margin: "0 auto", padding: "64px 24px 96px" }}>

        {/* Header */}
        <div style={{ borderBottom: "2px solid #1A1815", paddingBottom: "24px", marginBottom: "48px" }}>
          <p style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.12em", color: "#C44B2E", fontWeight: 700, marginBottom: "12px" }}>
            Research Methodology
          </p>
          <h1 style={{ fontSize: "36px", fontWeight: 600, letterSpacing: "-0.02em", color: "#1A1815", marginBottom: "12px", fontFamily: "var(--font-newsreader), Georgia, serif", lineHeight: 1.2 }}>
            How Bank Fee Index Works
          </h1>
          <p style={{ fontSize: "16px", color: "#5A5347", lineHeight: 1.6, maxWidth: "600px" }}>
            A transparent account of how we collect, classify, and verify fee data across 4,000+ financial institutions — and what that means for the accuracy of our benchmarks.
          </p>
          <p style={{ fontSize: "12px", color: "#A09788", marginTop: "16px" }}>
            Bank Fee Index Research &mdash; Updated {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </p>
        </div>

        {/* Section 1: Data Sources */}
        <Section
          label="Data Sources"
          title="We start with every regulated U.S. bank and credit union"
          body={[
            "Bank Fee Index draws its institution universe from two authoritative federal databases: the FDIC's BankFind Suite (which tracks every FDIC-insured bank, thrift, and savings institution) and the NCUA's Research & Data portal (which covers all federally chartered credit unions). Together, these sources provide accurate legal names, charter classifications, asset sizes, physical locations, and primary website URLs for approximately 4,800 active institutions.",
            "We do not use purchased data lists, scraped directories, or self-reported feeds. Every institution in our index is traceable to a federal regulator record with a published institution ID. This is the foundation of our data quality commitment: our institution universe is authoritative before the first fee is collected.",
            "As of the most recent index update, Bank Fee Index actively tracks 4,000+ institutions across all 50 states, Washington D.C., and U.S. territories. Coverage is skewed toward institutions with assets above $100 million, where fee schedules are most consistently published online. Institutions below $50 million in assets are included where fee schedules are publicly discoverable.",
          ]}
        />

        {/* Section 2: Collection Process */}
        <Section
          label="Collection Process"
          title="Agentic collection locates and retrieves fee schedules at scale"
          body={[
            "Fee schedules are collected through a visible agent pipeline that runs on a scheduled basis. The pipeline has three stages: discovery, retrieval, and extraction.",
            "Discovery identifies the URL of each institution's fee schedule through a combination of structured URL pattern matching (most institutions follow predictable URL conventions such as /fee-schedule.pdf or /disclosures/fees) and semantic search against the institution's main website. Discovery success rate varies significantly by institution size: large regional banks publish fee schedules reliably, while community banks and credit unions are more variable. Our current discovery coverage is approximately 68% of tracked institutions.",
            "Retrieval reads the located fee schedule document. HTML pages, plain-text documents, and PDFs with embedded text are supported. Image-only PDFs are tracked separately for OCR instead of being mixed into the general review queue. Retrieval stores source metadata, a content hash for change detection, and a collection timestamp.",
            "Refreshes run on a rolling schedule. Institutions with frequent fee changes are checked more often than those with stable fee structures. The collection system detects unchanged documents via content hash comparison and skips duplicate extraction when the source has not changed.",
          ]}
        />

        {/* Section 3: Extraction */}
        <Section
          label="Extraction"
          title="Conservative extraction identifies fee types and amounts with review gates"
          body={[
            "Fee extraction runs against the readable text of each retrieved fee schedule. The extraction layer identifies fee names, amounts, and applicable conditions such as waivers, tiered pricing, or periodic charges.",
            "Each extracted fee is assigned a confidence and review status. High-confidence rows can move forward automatically, while low-confidence rows, anomalies, and policy conflicts are held for analyst review.",
            "The extraction layer does not infer or estimate fees. If a fee amount is not explicitly stated in the document, the system does not synthesize one. This is the primary safeguard against invented fee data.",
            "Extracted fees are stored with their source document reference, collection timestamp, and review state, enabling a full audit trail from published fee schedule to index entry.",
          ]}
        />

        {/* Section 4: Categorization */}
        <Section
          label="Categorization"
          title="49 standardized fee categories enable cross-institution comparison"
          body={[
            "Raw fee names vary substantially across institutions. \"Monthly service charge,\" \"account maintenance fee,\" and \"checking maintenance\" typically refer to the same economic product. Comparison is only possible after normalization.",
            "Bank Fee Index uses a 49-category taxonomy organized into 9 fee families: account maintenance, overdraft and NSF, wire transfer, ATM and debit, card services, check services, account events, savings and money market, and miscellaneous. Each category has a canonical name, a set of known aliases, and a fee family assignment.",
            "Categorization is performed automatically using alias matching — if a raw fee name matches a known alias, it is assigned the corresponding canonical category. The alias list is maintained by the Bank Fee Index team and updated as new fee naming patterns are observed across the institution universe.",
            "The 49-category system spans what we call \"spotlight\" fees (6 categories that appear at high rates across all institution types: monthly maintenance, overdraft, NSF, ATM non-network, foreign transaction, domestic outgoing wire) through \"core\" and \"extended\" categories. The full taxonomy is disclosed on request.",
          ]}
        />

        {/* Section 5: Statistical Validation */}
        <Section
          label="Statistical Validation"
          title="Confidence thresholds and outlier detection protect index integrity"
          body={[
            "Before any fee enters the published index, it passes a two-stage validation gate.",
            "First, confidence threshold filtering: fees with extraction confidence below 0.70 are excluded from the index entirely. Fees between 0.70 and 0.85 enter a pending queue for analyst review before publication. Only fees with confidence above 0.85 are automatically staged for index inclusion.",
            "Second, statistical outlier detection: fees that deviate more than three standard deviations from the category median are flagged for review. This catches extraction errors where a fee amount is clearly inconsistent with the distribution — for example, an extracted ATM fee of $300 when the category median is $3.00. Flagged fees are reviewed and either confirmed, corrected, or excluded.",
            "The published index includes fees at three maturity levels: \"strong\" (10+ approved observations), \"provisional\" (10+ total observations including staged and pending), and \"insufficient\" (fewer than 10 observations). Maturity indicators appear on all index tables so consumers of our data can assess statistical confidence by category.",
          ]}
        />

        {/* Section 6: Coverage and Limitations */}
        <Section
          label="Coverage and Limitations"
          title="What our data covers — and what it does not"
          body={[
            "Bank Fee Index tracks published fee schedules, not actual fee revenue or transaction-level data. A published fee of $35 does not mean a given institution collected $35 for every overdraft — waiver programs, promotional rates, and negotiated terms affect realized fees. Our data reflects disclosed rates, which are the standard of comparison for regulatory purposes and consumer research.",
            "Our coverage is strongest for retail deposit account fees (maintenance, overdraft, NSF, wire, ATM) and weakest for business account fees, loan fees, and investment-account fees. Fee schedules for these product types are less consistently published in machine-readable formats.",
            "Geographic coverage is reasonably uniform at the state level but skewed toward states with higher institution density (Texas, California, Illinois, Ohio, New York). Fed District 4 (Cleveland), District 7 (Chicago), and District 11 (Dallas) have the strongest coverage. District 10 (Kansas City) and District 12 (San Francisco, excluding California) have the largest gaps relative to institution population.",
            "Source freshness varies by institution and schedule. The national index represents a rolling snapshot of fee schedules collected over the trailing 120 days. State-level indexes use a 90-day window. Fees older than these thresholds are excluded from the live index to prevent stale data from distorting benchmarks.",
          ]}
        />

        {/* Footer */}
        <div style={{ marginTop: "64px", paddingTop: "24px", borderTop: "1px solid #E8DFD1", fontSize: "12px", color: "#A09788" }}>
          <p>Bank Fee Index is independently operated. Our data collection methodology is designed to comply with the terms of service of the financial institutions we monitor. We collect only publicly disclosed fee information.</p>
          <p style={{ marginTop: "8px" }}>Questions about our methodology: hello@bankfeeindex.com</p>
        </div>

      </div>
    </main>
  );
}

// Internal section component — page-local only
function Section({ label, title, body }: { label: string; title: string; body: string[] }) {
  return (
    <section style={{ marginBottom: "48px" }}>
      <p style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.12em", color: "#C44B2E", fontWeight: 700, marginBottom: "8px" }}>
        {label}
      </p>
      <h2 style={{ fontSize: "22px", fontWeight: 600, color: "#1A1815", marginBottom: "16px", fontFamily: "var(--font-newsreader), Georgia, serif", letterSpacing: "-0.01em", lineHeight: 1.3 }}>
        {title}
      </h2>
      {body.map((paragraph, i) => (
        <p key={i} style={{ fontSize: "15px", color: "#3D3830", lineHeight: 1.75, marginBottom: "16px" }}>
          {paragraph}
        </p>
      ))}
    </section>
  );
}

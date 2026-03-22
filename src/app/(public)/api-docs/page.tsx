import type { Metadata } from "next";
import { BreadcrumbJsonLd } from "@/components/breadcrumb-jsonld";
import { SITE_URL } from "@/lib/constants";

export const metadata: Metadata = {
  title: "API Documentation - Bank Fee Index",
  description:
    "REST API for accessing bank and credit union fee data. JSON and CSV endpoints for fee categories, institutions, and the national fee index.",
};

function Endpoint({
  method,
  path,
  description,
  params,
  example,
}: {
  method: string;
  path: string;
  description: string;
  params: { name: string; type: string; description: string }[];
  example: string;
}) {
  return (
    <div className="rounded-xl border border-[#E8DFD1]/80 px-5 py-4">
      <div className="flex items-center gap-2">
        <span className="rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
          {method}
        </span>
        <code className="text-sm font-medium text-[#1A1815]">{path}</code>
      </div>
      <p className="mt-2 text-[13px] text-[#7A7062]">{description}</p>

      {params.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#A09788]">
            Parameters
          </p>
          <div className="mt-1.5 space-y-1">
            {params.map((p) => (
              <div key={p.name} className="flex items-baseline gap-2 text-[13px]">
                <code className="rounded bg-[#E8DFD1]/40 px-1.5 py-0.5 text-[12px] text-[#5A5347]">
                  {p.name}
                </code>
                <span className="text-[11px] text-[#A09788]">{p.type}</span>
                <span className="text-[#7A7062]">{p.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#A09788]">
          Example
        </p>
        <pre className="mt-1.5 overflow-x-auto rounded-md bg-[#1A1815] px-4 py-3 text-[12px] text-[#D4C9BA]">
          {example}
        </pre>
      </div>
    </div>
  );
}

export default function ApiDocsPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-14">
      <BreadcrumbJsonLd
        items={[
          { name: "Home", href: "/" },
          { name: "API Docs", href: "/api-docs" },
        ]}
      />

      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#C4704B]">
        Developer
      </p>
      <h1
        className="mt-1 text-[1.75rem] sm:text-[2.25rem] leading-[1.12] tracking-[-0.02em] font-bold text-[#1A1815]"
        style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
      >
        API Documentation
      </h1>
      <p className="mt-2 max-w-2xl text-[14px] text-[#7A7062]">
        Free REST API for accessing bank and credit union fee data. All
        endpoints return JSON by default. Add{" "}
        <code className="rounded bg-[#E8DFD1]/40 px-1 text-[12px]">format=csv</code>{" "}
        for CSV downloads where supported.
      </p>

      <div className="mt-2 rounded-md border border-amber-200 bg-amber-50/50 px-4 py-2.5 text-[13px] text-amber-800">
        Base URL: <code className="font-medium">{SITE_URL}/api/v1</code>
      </div>

      <div className="mt-8 space-y-6">
        <h2
          className="text-sm font-bold text-[#1A1815]"
          style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
        >
          Fee Categories
        </h2>

        <Endpoint
          method="GET"
          path="/api/v1/fees"
          description="List all 49 fee categories with national median, percentiles, and institution counts."
          params={[
            { name: "format", type: "string", description: '"csv" for CSV download' },
          ]}
          example={`curl ${SITE_URL}/api/v1/fees`}
        />

        <Endpoint
          method="GET"
          path="/api/v1/fees?category={category}"
          description="Get detailed breakdown for a single fee category including charter type, asset tier, district, and state analysis."
          params={[
            { name: "category", type: "string", description: "Fee category slug (e.g., overdraft, nsf, monthly_maintenance)" },
          ]}
          example={`curl ${SITE_URL}/api/v1/fees?category=overdraft`}
        />

        <h2
          className="mt-4 text-sm font-bold text-[#1A1815]"
          style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
        >
          Fee Index
        </h2>

        <Endpoint
          method="GET"
          path="/api/v1/index"
          description="National Fee Index with all categories. Supports filtering by state, charter type, and Fed district."
          params={[
            { name: "state", type: "string", description: "Two-letter state code (e.g., CA, TX)" },
            { name: "charter", type: "string", description: '"bank" or "credit_union"' },
            { name: "district", type: "string", description: "Fed district number(s), comma-separated (e.g., 7 or 2,7,12)" },
            { name: "format", type: "string", description: '"csv" for CSV download' },
          ]}
          example={`# National index
curl ${SITE_URL}/api/v1/index

# California credit unions only
curl "${SITE_URL}/api/v1/index?state=CA&charter=credit_union"

# CSV download for District 7
curl "${SITE_URL}/api/v1/index?district=7&format=csv"`}
        />

        <h2
          className="mt-4 text-sm font-bold text-[#1A1815]"
          style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
        >
          Institutions
        </h2>

        <Endpoint
          method="GET"
          path="/api/v1/institutions"
          description="List financial institutions with fee data. Paginated, filterable by state and charter type."
          params={[
            { name: "state", type: "string", description: "Two-letter state code" },
            { name: "charter", type: "string", description: '"bank" or "credit_union"' },
            { name: "page", type: "number", description: "Page number (default: 1)" },
            { name: "limit", type: "number", description: "Results per page (default: 50, max: 200)" },
          ]}
          example={`curl ${SITE_URL}/api/v1/institutions?state=NY&limit=10`}
        />

        <Endpoint
          method="GET"
          path="/api/v1/institutions?id={id}"
          description="Get a single institution's profile including all extracted fees."
          params={[
            { name: "id", type: "number", description: "Institution ID" },
          ]}
          example={`curl ${SITE_URL}/api/v1/institutions?id=123`}
        />
      </div>

      {/* Data info */}
      <section className="mt-10 rounded-xl border border-[#E8DFD1] bg-[#FAF7F2]/50 px-5 py-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[#A09788]">
          Data Notes
        </h2>
        <ul className="mt-2 space-y-1 text-[13px] text-[#7A7062]">
          <li>All monetary amounts are in USD.</li>
          <li>Medians exclude rejected fee reviews.</li>
          <li>Institution data sourced from FDIC and NCUA registries.</li>
          <li>Fee data extracted from published fee schedules.</li>
          <li>Rate limits: 100 requests per minute per IP.</li>
        </ul>
      </section>
    </div>
  );
}

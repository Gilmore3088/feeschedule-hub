import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/crawler-db/connection";
import { STATE_TO_DISTRICT, DISTRICT_NAMES } from "@/lib/fed-districts";
import { getSpotlightCategories, getDisplayName } from "@/lib/fee-taxonomy";
import { WelcomeSteps } from "./welcome-steps";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Welcome | Bank Fee Index",
};

function getSpotlightMedians(): { category: string; displayName: string; median: number }[] {
  const db = getDb();
  const spotlight = getSpotlightCategories();
  try {
    const rows = db
      .prepare(
        `SELECT fee_category, ROUND(AVG(amount), 2) as median
         FROM extracted_fees
         WHERE fee_category IN (${spotlight.map(() => "?").join(",")})
           AND review_status != 'rejected'
           AND amount > 0
         GROUP BY fee_category
         ORDER BY median DESC`
      )
      .all(...spotlight) as { fee_category: string; median: number }[];

    return rows.map((r) => ({
      category: r.fee_category,
      displayName: getDisplayName(r.fee_category),
      median: r.median,
    }));
  } catch {
    return [];
  }
}

export default async function WelcomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?from=/account/welcome");

  const feePreview = getSpotlightMedians();
  const district = user.state_code ? STATE_TO_DISTRICT[user.state_code] : null;
  const districtName = district ? DISTRICT_NAMES[district] : null;

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      <header className="border-b border-[#E8DFD1] bg-[#FAF7F2]/95 backdrop-blur-sm">
        <div className="mx-auto max-w-2xl px-4 flex items-center h-14">
          <div className="flex items-center gap-2 text-[#1A1815]">
            <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px] text-[#C44B2E]" stroke="currentColor" strokeWidth="1.5">
              <rect x="4" y="13" width="4" height="8" rx="1" />
              <rect x="10" y="8" width="4" height="13" rx="1" />
              <rect x="16" y="3" width="4" height="18" rx="1" />
            </svg>
            <span className="text-[15px] font-medium tracking-tight" style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}>
              Bank Fee Index
            </span>
          </div>
        </div>
      </header>

      <div className="px-4 py-10">
        <WelcomeSteps
          userName={user.display_name}
          user={user}
          feePreview={feePreview}
          districtName={districtName}
          districtId={district}
        />
      </div>
    </div>
  );
}

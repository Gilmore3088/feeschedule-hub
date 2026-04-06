/**
 * GET /pro/brief/preview
 *
 * Renders the peer competitive report template with fixture data.
 * No DB or Claude calls — pure visual verification of template output.
 * Auth-gated: premium users only (T-12-12 mitigation).
 */

import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { canAccessPremium } from "@/lib/access";
import { renderPeerCompetitiveReport } from "@/lib/report-templates/templates/peer-competitive";
import type { PeerCompetitiveData, GenerateSectionOutput } from "@/lib/hamilton/types";

const FIXTURE_DATA: PeerCompetitiveData = {
  title: "Midwest Community Banks — Peer Fee Benchmarking Brief",
  subtitle: "Asset tier $1B–$10B, FDIC Charter, Districts 7 & 8",
  report_date: new Date().toISOString().split("T")[0],
  peer_definition: {
    charter_type: "bank",
    asset_tiers: ["tier_b"],
    fed_districts: [7, 8],
  },
  categories: [
    {
      fee_category: "monthly_maintenance",
      display_name: "Monthly Maintenance",
      peer_median: 12.50,
      national_median: 10.75,
      p25_amount: 8.00,
      p75_amount: 15.00,
      delta_pct: 16.3,
      peer_count: 47,
      is_featured: true,
    },
    {
      fee_category: "overdraft",
      display_name: "Overdraft",
      peer_median: 33.00,
      national_median: 29.50,
      p25_amount: 25.00,
      p75_amount: 35.00,
      delta_pct: 11.9,
      peer_count: 52,
      is_featured: true,
    },
    {
      fee_category: "nsf",
      display_name: "NSF",
      peer_median: 31.00,
      national_median: 28.00,
      p25_amount: 22.00,
      p75_amount: 35.00,
      delta_pct: 10.7,
      peer_count: 48,
      is_featured: true,
    },
    {
      fee_category: "atm_non_network",
      display_name: "ATM (Non-Network)",
      peer_median: 3.00,
      national_median: 3.25,
      p25_amount: 2.50,
      p75_amount: 4.00,
      delta_pct: -7.7,
      peer_count: 41,
      is_featured: true,
    },
    {
      fee_category: "wire_domestic_outgoing",
      display_name: "Wire (Domestic Outgoing)",
      peer_median: 25.00,
      national_median: 27.50,
      p25_amount: 20.00,
      p75_amount: 30.00,
      delta_pct: -9.1,
      peer_count: 53,
      is_featured: true,
    },
    {
      fee_category: "cashiers_check",
      display_name: "Cashier's Check",
      peer_median: 8.00,
      national_median: 7.50,
      p25_amount: 6.00,
      p75_amount: 10.00,
      delta_pct: 6.7,
      peer_count: 38,
      is_featured: false,
    },
    {
      fee_category: "stop_payment",
      display_name: "Stop Payment",
      peer_median: 32.00,
      national_median: 30.00,
      p25_amount: 25.00,
      p75_amount: 35.00,
      delta_pct: 6.7,
      peer_count: 44,
      is_featured: false,
    },
  ],
  total_peer_institutions: 57,
  total_observations: 312,
};

const now = new Date().toISOString();

const FIXTURE_NARRATIVES: {
  executive_summary: GenerateSectionOutput;
  featured_fees: GenerateSectionOutput;
} = {
  executive_summary: {
    narrative:
      "Our analysis of 57 Midwest community banks in the $1B–$10B asset tier reveals a consistent pattern of above-national fee positioning across core retail products. Monthly maintenance fees average $12.50, running 16.3% above the national median of $10.75 — a differential that warrants attention given the sustained competitive pressure from digital-only entrants in this asset class. Overdraft and NSF fees follow the same pattern: peer medians of $33.00 and $31.00 respectively sit approximately 11–12% above national benchmarks. The data indicates these institutions have retained pricing power in penalty fees while showing modest cost advantage in transactional fees such as ATM and wire services.",
    wordCount: 108,
    model: "fixture",
    usage: { inputTokens: 0, outputTokens: 0 },
    section_type: "executive_summary",
    generated_at: now,
  },
  featured_fees: {
    narrative:
      "Monthly maintenance fee positioning notably reflects the deposit franchise strategy of Midwest community banks: at $12.50, peer institutions price this fee 16.3% above the national median, suggesting a deliberate premium positioning consistent with relationship-banking models. Overdraft fees present a more complex picture — the $33.00 peer median exceeds national benchmarks by $3.50, a material differential that regulators have increasingly scrutinized. ATM and wire fees, by contrast, show modest below-national positioning, suggesting competitive pricing in transactional services where fee-free alternatives are most visible to consumers.",
    wordCount: 96,
    model: "fixture",
    usage: { inputTokens: 0, outputTokens: 0 },
    section_type: "peer_competitive",
    generated_at: now,
  },
};

export async function GET(_request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canAccessPremium(user)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const html = renderPeerCompetitiveReport({
    data: FIXTURE_DATA,
    narratives: FIXTURE_NARRATIVES,
  });

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}

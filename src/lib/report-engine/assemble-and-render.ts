/**
 * Report Assembly Orchestrator
 *
 * assembleAndRender() picks the right assembler + Hamilton sections + template by report_type,
 * runs them in sequence, and returns a complete HTML string ready for Modal PDF conversion.
 *
 * Status flow: pending → assembling (set at entry) → caller sets rendering before Modal.
 * On any unhandled error: job status is set to 'failed' before re-throwing.
 *
 * Decision refs: D-01 through D-09 (see 18-CONTEXT.md)
 */

import { getSql } from '@/lib/crawler-db/connection';
import { generateSection } from '@/lib/hamilton/generate';
import { validateNumerics } from '@/lib/hamilton/validate';
import { assembleNationalQuarterly } from '@/lib/report-assemblers/national-quarterly';
import { assembleMonthlyPulse } from '@/lib/report-assemblers/monthly-pulse';
import { assemblePeerCompetitivePayload } from '@/lib/report-assemblers/peer-competitive';
import type { PeerCompetitiveFilters } from '@/lib/report-assemblers/peer-competitive';
import { renderNationalQuarterlyReport } from '@/lib/report-templates/templates/national-quarterly';
import { renderStateFeeIndexReport } from '@/lib/report-templates/templates/state-fee-index';
import { renderMonthlyPulseReport } from '@/lib/report-templates/templates/monthly-pulse';
import { renderPeerCompetitiveReport } from '@/lib/report-templates/templates/peer-competitive';
import type { SectionOutput } from '@/lib/hamilton/types';
import type { ReportType } from '@/lib/report-engine/types';

// ─── State Name Map ────────────────────────────────────────────────────────────

const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama',
  AK: 'Alaska',
  AZ: 'Arizona',
  AR: 'Arkansas',
  CA: 'California',
  CO: 'Colorado',
  CT: 'Connecticut',
  DC: 'District of Columbia',
  DE: 'Delaware',
  FL: 'Florida',
  GA: 'Georgia',
  HI: 'Hawaii',
  ID: 'Idaho',
  IL: 'Illinois',
  IN: 'Indiana',
  IA: 'Iowa',
  KS: 'Kansas',
  KY: 'Kentucky',
  LA: 'Louisiana',
  ME: 'Maine',
  MD: 'Maryland',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MN: 'Minnesota',
  MS: 'Mississippi',
  MO: 'Missouri',
  MT: 'Montana',
  NE: 'Nebraska',
  NV: 'Nevada',
  NH: 'New Hampshire',
  NJ: 'New Jersey',
  NM: 'New Mexico',
  NY: 'New York',
  NC: 'North Carolina',
  ND: 'North Dakota',
  OH: 'Ohio',
  OK: 'Oklahoma',
  OR: 'Oregon',
  PA: 'Pennsylvania',
  RI: 'Rhode Island',
  SC: 'South Carolina',
  SD: 'South Dakota',
  TN: 'Tennessee',
  TX: 'Texas',
  UT: 'Utah',
  VT: 'Vermont',
  VA: 'Virginia',
  WA: 'Washington',
  WV: 'West Virginia',
  WI: 'Wisconsin',
  WY: 'Wyoming',
};

// ─── Fallback Narrative ────────────────────────────────────────────────────────

function fallbackNarrative(message: string): SectionOutput {
  return {
    narrative: message,
    wordCount: message.split(/\s+/).filter(Boolean).length,
    model: 'fallback',
    usage: { inputTokens: 0, outputTokens: 0 },
  };
}

// ─── Validation Helper ─────────────────────────────────────────────────────────

function validateAndWarn(
  section: string,
  output: SectionOutput,
  sourceData: Record<string, unknown>,
): void {
  const result = validateNumerics(output.narrative, sourceData);
  if (!result.passed) {
    console.warn(
      '[assembleAndRender] numeric validation failed:',
      section,
      result.inventedNumbers,
    );
  }
}

// ─── Orchestrator ──────────────────────────────────────────────────────────────

/**
 * Assemble data, generate Hamilton narratives, and render a complete HTML report.
 *
 * @param reportType - One of national_index | state_index | monthly_pulse | peer_brief
 * @param params - Report-specific parameters (state_code, charter_type, etc.)
 * @param jobId - report_jobs.id — used for status updates
 * @returns Complete HTML string ready for Playwright PDF conversion
 */
export async function assembleAndRender(
  reportType: ReportType,
  params: Record<string, unknown>,
  jobId: string,
): Promise<string> {
  const sql = getSql();

  // D-09: Mark job as assembling at entry
  await sql`UPDATE report_jobs SET status = 'assembling' WHERE id = ${jobId}`;

  try {
    switch (reportType) {
      case 'national_index': {
        const payload = await assembleNationalQuarterly();
        const V3_CONTEXT = 'Maximum 75 words. Write 2-3 sentences only. Be strategic, not descriptive. State implications, not observations. This is a McKinsey-grade intelligence product.';

        // V3: Run 6 Hamilton calls in parallel — strategic framing
        const [
          execResult,
          diffResult,
          charterResult,
          revenueResult,
          blindSpotResult,
          futureResult,
        ] = await Promise.allSettled([
          generateSection({
            type: 'executive_summary',
            title: '5 Truths About Banking Fees — Executive Summary',
            data: {
              ...payload.derived,
              total_institutions: payload.total_institutions,
            },
            context: `${V3_CONTEXT}\n\nWrite 2-3 punchy sentences summarizing the 5 key insights. No preamble. Max 75 words.`,
          }),
          generateSection({
            type: 'trend_analysis',
            title: 'The Illusion of Fee Differentiation',
            data: {
              avg_iqr_spread_pct: payload.derived.avg_iqr_spread_pct,
              commoditized_count: payload.derived.commoditized_count,
              total_priced_categories: payload.derived.total_priced_categories,
              tightest_spreads: payload.derived.tightest_spreads,
              widest_spreads: payload.derived.widest_spreads,
            },
            context: `${V3_CONTEXT}\n\nAnalyze fee clustering and commoditization. 2-3 sentences. The data shows tight IQR spreads. What does this mean strategically?`,
          }),
          generateSection({
            type: 'peer_comparison',
            title: 'Banks vs Credit Unions: Two Models',
            data: {
              bank_higher_count: payload.derived.bank_higher_count,
              cu_higher_count: payload.derived.cu_higher_count,
              comparable_count: payload.derived.comparable_count,
              biggest_bank_premiums: payload.derived.biggest_bank_premiums,
              biggest_cu_premiums: payload.derived.biggest_cu_premiums,
            },
            context: `${V3_CONTEXT}\n\nCompare bank vs CU fee strategies. Banks monetize convenience, CUs monetize penalties. 2-3 sentences.`,
          }),
          generateSection({
            type: 'trend_analysis',
            title: 'Where the Money Actually Comes From',
            data: {
              revenue: payload.revenue ?? null,
              revenue_per_institution: payload.derived.revenue_per_institution,
              bank_revenue_share_pct: payload.derived.bank_revenue_share_pct,
              cu_revenue_share_pct: payload.derived.cu_revenue_share_pct,
            },
            context: `${V3_CONTEXT}\n\nAnalyze service charge revenue concentration. What does the bank vs CU split reveal? 2-3 sentences.`,
          }),
          generateSection({
            type: 'findings',
            title: 'The Industry Blind Spot',
            data: {
              categories_with_data_count: payload.derived.categories_with_data_count,
              total_categories: payload.categories.length,
              strong_maturity_count: payload.derived.strong_maturity_count,
              provisional_maturity_count: payload.derived.provisional_maturity_count,
            },
            context: `${V3_CONTEXT}\n\nDiscuss the lack of standardized fee revenue benchmarking. Position Bank Fee Index as solving this. 2-3 sentences.`,
          }),
          generateSection({
            type: 'recommendation',
            title: 'The Future of Fee Strategy',
            data: {
              avg_iqr_spread_pct: payload.derived.avg_iqr_spread_pct,
              bank_higher_count: payload.derived.bank_higher_count,
              total_institutions: payload.total_institutions,
            },
            context: `${V3_CONTEXT}\n\nWrite prescriptive guidance on behavioral pricing, bundling, and dynamic fee strategies. 2-3 sentences.`,
          }),
        ]);

        const executive_summary =
          execResult.status === 'fulfilled'
            ? execResult.value
            : fallbackNarrative('Fee pricing is commoditized across the industry, with limited room for price-based differentiation.');
        const fee_differentiation =
          diffResult.status === 'fulfilled'
            ? diffResult.value
            : fallbackNarrative('IQR spreads reveal tight clustering — pricing alone does not differentiate.');
        const banks_vs_credit_unions =
          charterResult.status === 'fulfilled'
            ? charterResult.value
            : fallbackNarrative('Banks and credit unions pursue fundamentally different fee strategies.');
        const revenue_reality =
          revenueResult.status === 'fulfilled'
            ? revenueResult.value
            : fallbackNarrative('Revenue data sourced from FDIC Call Reports and NCUA 5300 filings.');
        const industry_blind_spot =
          blindSpotResult.status === 'fulfilled'
            ? blindSpotResult.value
            : fallbackNarrative('No standardized fee revenue benchmarking exists across the industry today.');
        const future_strategy =
          futureResult.status === 'fulfilled'
            ? futureResult.value
            : fallbackNarrative('Future fee revenue growth depends on behavioral pricing and intelligent segmentation.');

        // D-07: Validate numerics on key sections
        const derivedData = payload.derived as unknown as Record<string, unknown>;
        validateAndWarn('executive_summary', executive_summary, derivedData);
        validateAndWarn('fee_differentiation', fee_differentiation, derivedData);
        validateAndWarn('banks_vs_credit_unions', banks_vs_credit_unions, derivedData);

        return renderNationalQuarterlyReport({
          data: payload,
          narratives: {
            executive_summary,
            fee_differentiation,
            banks_vs_credit_unions,
            revenue_reality,
            industry_blind_spot,
            future_strategy,
          },
        });
      }

      case 'state_index': {
        // T-18-01: state_code guarded — defaults to 'US' if absent/wrong type
        const stateCode =
          typeof params.state_code === 'string'
            ? params.state_code.toUpperCase()
            : 'US';
        const stateName = STATE_NAMES[stateCode] ?? stateCode;

        // State template is a stub — no fee data, no Hamilton calls
        return renderStateFeeIndexReport({
          stateCode,
          stateName,
          generatedAt: new Date().toISOString().slice(0, 10),
        });
      }

      case 'monthly_pulse': {
        const payload = await assembleMonthlyPulse();

        const pulseData = {
          period_label: payload.period_label,
          total_movers: payload.total_movers,
          total_categories_tracked: payload.total_categories_tracked,
          movers_up: payload.movers_up.slice(0, 5),
          movers_down: payload.movers_down.slice(0, 5),
        };

        let pulse_overview: SectionOutput;
        try {
          pulse_overview = await generateSection({
            type: 'overview',
            title: `Fee Market Movement — ${payload.period_label}`,
            data: pulseData,
            context: 'Write a 1-2 paragraph executive summary. 250 words maximum.',
          });
          validateAndWarn('pulse_overview', pulse_overview, pulseData);
        } catch {
          pulse_overview = fallbackNarrative(
            'Market movement data is presented in the tables below.',
          );
        }

        return renderMonthlyPulseReport({ data: payload, narratives: { pulse_overview } });
      }

      case 'peer_brief': {
        const filters: PeerCompetitiveFilters = {
          charter_type:
            typeof params.charter_type === 'string'
              ? params.charter_type
              : undefined,
          asset_tiers: Array.isArray(params.asset_tiers)
            ? (params.asset_tiers as string[])
            : undefined,
          fed_districts: Array.isArray(params.fed_districts)
            ? (params.fed_districts as number[])
            : undefined,
        };

        const payload = await assemblePeerCompetitivePayload(filters);

        const execSection = payload.sections.find(
          (s) => s.include && s.section_type === 'executive_summary',
        );
        const featuredSection = payload.sections.find(
          (s) => s.include && s.section_type === 'peer_competitive',
        );

        const [execResult, featuredResult] = await Promise.allSettled([
          execSection
            ? generateSection({
                type: 'executive_summary',
                title: execSection.title,
                data: execSection.data,
              })
            : Promise.reject(new Error('No executive_summary section available')),
          featuredSection
            ? generateSection({
                type: 'peer_competitive',
                title: featuredSection.title,
                data: featuredSection.data,
              })
            : Promise.reject(new Error('No peer_competitive section available')),
        ]);

        const executive_summary =
          execResult.status === 'fulfilled'
            ? execResult.value
            : fallbackNarrative(
                'Competitive analysis data is presented in the tables below.',
              );
        const featured_fees =
          featuredResult.status === 'fulfilled'
            ? featuredResult.value
            : fallbackNarrative(
                'Competitive analysis data is presented in the tables below.',
              );

        if (execSection) {
          validateAndWarn('executive_summary', executive_summary, execSection.data);
        }
        if (featuredSection) {
          validateAndWarn('featured_fees', featured_fees, featuredSection.data);
        }

        return renderPeerCompetitiveReport({
          data: payload.data,
          narratives: { executive_summary, featured_fees },
        });
      }

      default: {
        // TypeScript exhaustiveness — should never reach here
        throw new Error(`Unknown report_type: ${String(reportType)}`);
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await sql`UPDATE report_jobs SET status = 'failed', error = ${message} WHERE id = ${jobId}`;
    throw err;
  }
}

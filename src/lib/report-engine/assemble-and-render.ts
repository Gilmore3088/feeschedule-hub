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

        const hasCharterData = payload.categories.some(
          (c) => c.bank_count > 0 && c.cu_count > 0,
        );
        const hasDistrictData = payload.district_headlines.length > 0;

        // Run Hamilton calls in parallel — D-08: any failure degrades gracefully
        const [execResult, nationalResult, charterResult, districtResult] =
          await Promise.allSettled([
            generateSection({
              type: 'executive_summary',
              title: 'National Fee Landscape — Key Findings',
              data: {
                total_institutions: payload.total_institutions,
                total_bank_institutions: payload.total_bank_institutions,
                total_cu_institutions: payload.total_cu_institutions,
                category_count: payload.categories.length,
                top_categories: payload.categories.slice(0, 5).map((c) => ({
                  name: c.display_name,
                  median: c.median_amount,
                  count: c.institution_count,
                })),
              },
            }),
            generateSection({
              type: 'trend_analysis',
              title: 'Fee Distribution Across 49 Categories',
              data: {
                categories: payload.categories.map((c) => ({
                  name: c.display_name,
                  median: c.median_amount,
                  p25: c.p25_amount,
                  p75: c.p75_amount,
                  count: c.institution_count,
                  maturity: c.maturity_tier,
                })),
              },
            }),
            hasCharterData
              ? generateSection({
                  type: 'peer_comparison',
                  title:
                    'Banks vs. Credit Unions — Where Charter Type Drives Fee Divergence',
                  data: {
                    categories: payload.categories
                      .filter((c) => c.bank_count > 0 && c.cu_count > 0)
                      .slice(0, 10)
                      .map((c) => ({
                        name: c.display_name,
                        bank_median: c.bank_median,
                        cu_median: c.cu_median,
                      })),
                  },
                })
              : Promise.reject(new Error('No charter data available')),
            hasDistrictData
              ? generateSection({
                  type: 'regional_analysis',
                  title:
                    'Fed District Economic Conditions Influencing Fee Pressure',
                  data: { headlines: payload.district_headlines },
                })
              : Promise.reject(new Error('No district headlines available')),
          ]);

        const executive_summary =
          execResult.status === 'fulfilled'
            ? execResult.value
            : fallbackNarrative(
                'National fee data is presented in the tables below.',
              );
        const national_index =
          nationalResult.status === 'fulfilled'
            ? nationalResult.value
            : fallbackNarrative(
                'Fee distribution data is presented in the table below.',
              );
        const charter_analysis =
          charterResult.status === 'fulfilled' ? charterResult.value : undefined;
        const district_context =
          districtResult.status === 'fulfilled'
            ? districtResult.value
            : undefined;

        // D-07: Validate numerics, warn on failure — do NOT reject the narrative
        const execData = {
          total_institutions: payload.total_institutions,
          total_bank_institutions: payload.total_bank_institutions,
          total_cu_institutions: payload.total_cu_institutions,
          category_count: payload.categories.length,
        };
        validateAndWarn('executive_summary', executive_summary, execData);
        validateAndWarn('national_index', national_index, {
          categories: payload.categories,
        });
        if (charter_analysis) {
          validateAndWarn('charter_analysis', charter_analysis, {
            categories: payload.categories,
          });
        }
        if (district_context) {
          validateAndWarn('district_context', district_context, {
            headlines: payload.district_headlines,
          });
        }

        return renderNationalQuarterlyReport({
          data: payload,
          narratives: {
            executive_summary,
            national_index,
            ...(charter_analysis ? { charter_analysis } : {}),
            ...(district_context ? { district_context } : {}),
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

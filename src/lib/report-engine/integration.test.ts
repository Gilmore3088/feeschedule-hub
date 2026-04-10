/**
 * Integration test — national_index end-to-end quality gate (Phase 37, D-04/D-05).
 *
 * This test calls the REAL Anthropic API (no mocks).
 * It is skipped automatically when ANTHROPIC_API_KEY is not set.
 *
 * Imports that require DB connectivity (assembleNationalQuarterly) are loaded
 * dynamically inside the test body so module resolution does not fail in CI
 * environments that lack the @/ path alias or a live DB connection.
 *
 * Quality gate assertions (per D-05):
 *   - Global thesis is non-empty
 *   - executive_summary section word count > 0
 *   - Zero major editor flags
 *
 * Run manually when a live key and DB are available:
 *   npx vitest run src/lib/report-engine/integration.test.ts --reporter=verbose
 */

// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { generateGlobalThesis, generateSection } from '../hamilton/generate';
import { runEditorReview } from './editor';
import { validateNumerics } from '../hamilton/validate';
import type { ValidatedSection } from '../hamilton/types';

const hasKey = !!process.env.ANTHROPIC_API_KEY;

describe('national_index end-to-end quality gate', () => {
  it.skipIf(!hasKey)(
    'generates a non-empty thesis, word-counted section, and zero major editor flags',
    async () => {
      // Dynamic imports: assembler uses @/ path alias and DB connectivity.
      // Loaded inside test body so module resolution errors don't break CI skip.
      const { assembleNationalQuarterly, buildThesisSummary } = await import(
        '../report-assemblers/national-quarterly'
      );

      // Step 1: Assemble real production data
      const payload = await assembleNationalQuarterly();

      // Step 2: Generate global thesis from condensed payload
      const summary = buildThesisSummary(payload);
      const thesis = await generateGlobalThesis({ scope: 'quarterly', data: summary });

      // Step 3: Assert thesis quality (D-05 — non-empty thesis)
      expect(thesis.core_thesis).toBeTruthy();
      expect(typeof thesis.core_thesis).toBe('string');
      expect(thesis.core_thesis.length).toBeGreaterThan(0);
      expect(Array.isArray(thesis.tensions)).toBe(true);
      expect(thesis.tensions.length).toBeGreaterThanOrEqual(1);

      // Step 4: Generate executive_summary section with thesis context
      const thesisContext = thesis.narrative_summary
        ? `GLOBAL THESIS (reference this in your analysis — your section is one argument in a unified report):\n${thesis.narrative_summary}\n\n`
        : '';

      const section = await generateSection({
        type: 'executive_summary',
        title: '5 Truths About Banking Fees — Executive Summary',
        data: {
          ...payload.derived,
          total_institutions: payload.total_institutions,
          fred_snapshot: payload.fred
            ? {
                fed_funds_rate: payload.fred.fed_funds_rate,
                unemployment_rate: payload.fred.unemployment_rate,
                cpi_yoy_pct: payload.fred.cpi_yoy_pct,
                as_of: payload.fred.as_of,
              }
            : null,
          beige_book_themes: payload.district_headlines
            .slice(0, 5)
            .map((d: { district: string | number; headline: string }) => `District ${d.district}: ${d.headline}`),
        },
        context: `${thesisContext}Write 2-3 punchy sentences summarizing the 5 key insights. No preamble. Max 75 words.\n\nCROSS-SOURCE INSTRUCTION: Your DATA block contains fred_snapshot (FRED economic indicators) and beige_book_themes (Federal Reserve district reports). You MUST reference at least one FRED indicator and at least one Beige Book theme in your analysis.`,
      });

      // Step 5: Assert section is non-empty (D-05)
      // The exec summary context instructs 75 words max — 150-200 target applies to longer sections.
      expect(section.wordCount).toBeGreaterThan(0);
      expect(section.narrative.length).toBeGreaterThan(0);

      console.info('[integration] thesis.core_thesis:', thesis.core_thesis);
      console.info('[integration] section.wordCount:', section.wordCount);

      // Step 6: Build ValidatedSection wrapper
      const validationResult = validateNumerics(
        section.narrative,
        payload.derived as unknown as Record<string, unknown>,
      );

      const validatedSection: ValidatedSection = {
        ...section,
        validation: validationResult,
        input: {
          type: 'executive_summary',
          title: '5 Truths About Banking Fees — Executive Summary',
          data: {
            ...(payload.derived as unknown as Record<string, unknown>),
            total_institutions: payload.total_institutions,
          },
        },
      };

      // Step 7: Run editor review with thesis
      const editorResult = await runEditorReview([validatedSection], thesis);

      // Step 8: Assert zero major flags (D-05 quality gate)
      const majorFlags = editorResult.flaggedSections.filter((f) => f.severity === 'major');
      expect(majorFlags.length).toBe(0);

      // Log full editor result for inspection
      console.info('[integration] editor review:', {
        approved: editorResult.approved,
        majorFlags: majorFlags.length,
        minorFlags: editorResult.flaggedSections.filter((f) => f.severity === 'minor').length,
        reviewNote: editorResult.reviewNote,
      });
      if (editorResult.flaggedSections.length > 0) {
        console.info('[integration] all editor flags:', editorResult.flaggedSections);
      }
    },
    120_000,
  );
});

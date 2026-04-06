# Phase 16: Public Catalog + Go-to-Market - Context

**Gathered:** 2026-04-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Publish the methodology paper at a permanent public URL, build ISR-cached report landing pages with executive summary + gated full PDF, add OG metadata for LinkedIn/social sharing, create a searchable public report catalog, AND build an admin report management page for one-click report generation, preview, and publishing. This is the go-to-market layer — both the public face and the admin controls.

</domain>

<decisions>
## Implementation Decisions

### Methodology Publication
- **D-01:** The methodology page already exists from Phase 12 at both `/methodology` (public) and `/admin/methodology`. Ensure the public version is the canonical one, properly linked, and SEO-optimized.
- **D-02:** Add structured data (JSON-LD) for the methodology page — schema.org Article type.

### Report Landing Pages
- **D-03:** Each published report gets an ISR-cached landing page at `/reports/[slug]`. Executive summary + 2 key charts visible publicly. Full PDF download behind CTA (email capture or login).
- **D-04:** ISR revalidation triggered when a report is published — `revalidatePath('/reports/[slug]')`.
- **D-05:** Landing page pulls data from `published_reports` table (Phase 13 schema).

### OG Metadata
- **D-06:** Each report landing page has OG title, description, and image. Image can be a static template with report title overlaid (no dynamic chart image generation needed for v2.0).
- **D-07:** LinkedIn-optimized: `og:type=article`, `article:published_time`, `article:author=Bank Fee Index`.

### Public Catalog
- **D-08:** Catalog at `/reports` — lists all published reports with filtering by type and date.
- **D-09:** ISR-cached with revalidation on publish. Search engine indexable (no client-side rendering for catalog content).
- **D-10:** Consumer brand palette, Newsreader headings.

### Content Gating
- **D-11:** Public sees: executive summary, 2 charts, methodology link. Gated: full PDF download requires email (lead capture) or login. Simple email gate for v2.0 — no Stripe required.

### Admin Report Management
- **D-12:** New admin page at `/admin/reports` — the control center for all report generation.
- **D-13:** Report dashboard: table showing all report_jobs (status, type, date, user, download link). Filter by status and type.
- **D-14:** One-click generation buttons: "Generate National Quarterly", "Generate State Index" (state picker dropdown), "Generate Monthly Pulse". Each triggers POST to generate route and shows live polling status inline.
- **D-15:** Preview before publish: after a report completes, admin can preview the PDF, then click "Publish to Catalog" which inserts into published_reports and triggers ISR revalidation.
- **D-16:** Failed report retry: one-click retry button for failed jobs.
- **D-17:** Admin design system (existing gray/monochrome admin palette, not consumer brand).

### Claude's Discretion
- All implementation details
- Email capture component design
- OG image approach
- Catalog filter UI
- Admin page layout and component design

</decisions>

<canonical_refs>
## Canonical References

- `src/app/(public)/methodology/page.tsx` — existing methodology page (Phase 12)
- `src/lib/report-engine/types.ts` — PublishedReport type
- `supabase/migrations/20260406_report_jobs.sql` — published_reports table
- `src/app/globals.css` — consumer brand palette

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable
- Methodology page already built (Phase 12)
- published_reports table schema exists (Phase 13)
- Consumer brand CSS ready
- ISR/revalidation patterns used elsewhere in the app

### Integration Points
- Report publish action → insert into published_reports → revalidatePath
- Public catalog reads from published_reports
- Landing pages read executive summary from report metadata

</code_context>

<specifics>
## Specific Ideas

No specific requirements beyond roadmap.

</specifics>

<deferred>
## Deferred Ideas

None

</deferred>

---

*Phase: 16-public-catalog-go-to-market*
*Context gathered: 2026-04-06*

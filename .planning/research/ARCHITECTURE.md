# Architecture Patterns: Report Generation System

**Domain:** Template + AI hybrid report engine integrated into an existing Next.js App Router app
**Researched:** 2026-04-06
**Overall confidence:** HIGH

---

## Recommended Architecture

A report generation system for Bank Fee Index has five distinct layers. Each layer has a single responsibility and a clear interface to the next.

```
┌──────────────────────────────────────────────────────────────────┐
│  Layer 5: Distribution                                           │
│  Public catalog (ISR), pro download (signed URL), email/Stripe   │
├──────────────────────────────────────────────────────────────────┤
│  Layer 4: Storage                                                │
│  Cloudflare R2 (PDFs) + Supabase (metadata + job state)         │
├──────────────────────────────────────────────────────────────────┤
│  Layer 3: Render                                                 │
│  HTML string → Playwright PDF (Modal worker)                    │
├──────────────────────────────────────────────────────────────────┤
│  Layer 2: Assembly                                               │
│  Data queries → Hamilton Claude calls → Template fill            │
├──────────────────────────────────────────────────────────────────┤
│  Layer 1: Trigger                                                │
│  Next.js Route Handler (on-demand) or cron job (recurring)      │
└──────────────────────────────────────────────────────────────────┘
```

This is the same pattern as the existing FeeScout and URL audit pipelines — a Next.js trigger layer, a Modal async worker layer, Supabase for state, and R2 for artifacts. The report engine reuses every one of those infrastructure components without adding new ones.

---

## Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `app/api/reports/[type]/route.ts` | Trigger: enqueue job, return job ID | Supabase `report_jobs` table |
| `app/api/reports/[id]/status/route.ts` | Polling: return job state + artifact URL | Supabase |
| `src/lib/report-templates/` | Assembly: data fetch + Claude calls + HTML render | Supabase DB queries, Anthropic SDK |
| Modal `generate_report.py` | Render: receive HTML, run Playwright, output PDF bytes | R2 upload, Supabase job update |
| `app/pro/reports/` | Pro download: auth check, generate R2 presigned URL | Supabase, R2 |
| `app/(public)/reports/` | Public catalog: ISR-cached report index + preview pages | Supabase |
| `src/lib/hamilton/` | Hamilton AI persona: prompt system, voice guidelines | Anthropic SDK |

---

## Two Report Modes

The project explicitly requires two modes with different cost profiles. The architecture enforces this distinction at the assembly layer.

### Mode A: Template-Driven (recurring, cheap)

Used for: National Fee Index quarterly, State Fee Index, monthly pulse.

Flow:
```
Cron trigger
  → enqueue job in Supabase
    → Modal worker: call assembleTemplateReport(type, params)
        → fetch data from Supabase (no LLM calls for data)
        → run 1 Hamilton "narrative summary" call ($0.50-1.00)
        → fill HTML template with data + narrative
        → render PDF via Playwright
        → upload to R2
        → mark job complete
```

Cost per report: $0.50-1.50 (one Hamilton narrative call + compute).

### Mode B: Hamilton-Heavy (on-demand, high-value)

Used for: Competitive peer briefs, custom benchmarking reports.

Flow:
```
User trigger (pro route)
  → auth + entitlement check
    → enqueue job in Supabase
      → Modal worker: call assembleHamiltonReport(type, params)
          → fetch data (peer index, peer comparables, district data)
          → 3-6 Hamilton section calls (executive summary, fee analysis,
            peer positioning, recommendations, market context, outlook)
          → assemble HTML with full narrative sections
          → render PDF via Playwright
          → upload to R2
          → notify user (email or UI poll)
```

Cost per report: $5-10 (multiple Claude calls) — matches the project's stated tolerance.

---

## Data Flow: Assembly Layer

The assembly layer is the most complex. It separates three concerns that must stay separate:

```
1. Data fetch (pure Supabase queries, no AI)
   getNationalIndex(), getPeerIndex(), getStateData(), getDistrictData()
   → produces: structured ReportData object

2. Hamilton analysis (pure AI, no DB queries)
   hamiltonNarrative(section, data, voiceGuidelines)
   → produces: prose strings for each report section

3. Template render (pure HTML, no data or AI)
   fillTemplate(templateId, data, narratives)
   → produces: complete HTML string
```

Why this separation matters: Hamilton calls are expensive and slow. Data queries are cheap and fast. Template rendering is synchronous and trivial. Keeping them separate means each can fail independently, be retried independently, and be cached independently.

---

## Render Layer: Playwright on Modal

PDF rendering must happen off the Next.js server. The reasons are definitive:

- Vercel serverless functions cap at 50MB uncompressed. Chromium is ~130MB.
- `@sparticuz/chromium-min` workarounds are fragile and produce inconsistent output.
- McKinsey-grade reports require pixel-perfect CSS, custom fonts, and precise print layout — these require a real Chromium instance, not `@react-pdf/renderer`.

The project already runs Modal workers for the State Agent and FeeScout pipelines. The report render worker is another Modal function using Playwright, the same dependency already installed.

```python
# modal_workers/generate_report.py (pattern)
@app.function(image=crawler_image, timeout=120)
async def render_report_to_pdf(html: str, report_id: str) -> str:
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        await page.set_content(html, wait_until="networkidle")
        pdf_bytes = await page.pdf(
            format="Letter",
            print_background=True,
            margin={"top": "0.75in", "right": "0.75in",
                    "bottom": "0.75in", "left": "0.75in"},
        )
        await browser.close()

    key = f"reports/{report_id}.pdf"
    upload_to_r2(pdf_bytes, key)
    return key
```

`@react-pdf/renderer` is not recommended here. It requires rebuilding every visual element as a React-PDF primitive and cannot use existing Tailwind/CSS styles. The existing `brief-generator.ts` already produces HTML strings — Playwright consuming that HTML is a zero-friction path.

---

## Job Queue Pattern

Report generation is async. The user cannot wait 60 seconds for a synchronous HTTP response.

The recommended pattern uses Supabase as the job store (no external queue service required):

```
report_jobs table:
  id          uuid PK
  type        text  ('national_index' | 'state_index' | 'peer_brief' | 'monthly_pulse')
  params      jsonb (filters, segment, date range)
  status      text  ('pending' | 'assembling' | 'rendering' | 'complete' | 'failed')
  artifact_key text  (R2 object key when complete)
  error       text
  created_at  timestamptz
  completed_at timestamptz
  user_id     uuid FK (null for cron-triggered)
```

Trigger → poll flow:
1. `POST /api/reports` creates a `report_jobs` row, returns `{ jobId }`.
2. Modal worker picks up the job (called directly via `.remote()`, not via a queue poller — same pattern as State Agent).
3. Client polls `GET /api/reports/:jobId/status` every 3 seconds.
4. When `status = 'complete'`, client receives a short-lived presigned R2 URL.

This matches the existing SSE polling pattern used by FeeScout and the State Agent — the codebase already has this infrastructure in `app/api/research/` and `app/api/scout/`. Report jobs use the simpler polling variant (not SSE) since report generation is batch, not streaming.

---

## Storage Pattern: R2 + Supabase

PDFs go to Cloudflare R2. Metadata goes to Supabase. Never store a public URL in the database — store only the R2 object key.

```
R2 bucket layout:
  reports/
    {report_id}.pdf          ← final PDF
    previews/
      {report_id}.png        ← thumbnail (optional, for catalog)
    drafts/
      {report_id}-draft.html ← HTML before PDF render (for debugging)
```

Access control for downloads:
```
User clicks "Download"
  → GET /api/reports/:id/download
    → verify session + subscription tier
      → if authorized: generate R2 presigned URL (15-min TTL)
        → redirect to presigned URL
      → if unauthorized: 403
```

Presigned URLs are treated as bearer tokens — short TTL prevents sharing. This is the canonical R2 pattern for gated downloads.

---

## Distribution: Public Catalog vs. Pro Download

Two distinct surfaces, both served from the same Next.js app:

### Public Report Catalog (`app/(public)/reports/`)

- ISR with `revalidate: 3600` (hourly)
- Lists published reports with title, date, teaser paragraph, chart thumbnail
- Individual report pages show Hamilton executive summary + sample charts
- Full PDF gated behind subscription CTA
- Purpose: SEO, lead generation, authority signal

```
app/(public)/reports/
  page.tsx              ← catalog index (ISR)
  [slug]/
    page.tsx            ← report landing page (ISR)
    page.tsx generates metadata for og:image, title, description
```

### Pro Report Library (`app/pro/reports/`)

- SSR (authenticated, user-specific)
- Lists all reports the user can access given their subscription tier
- On-demand generation trigger for Hamilton-heavy reports
- Download button → presigned URL flow
- Generation status poll UI

```
app/pro/reports/
  page.tsx              ← authenticated library
  [id]/
    page.tsx            ← report detail + download
    generate/
      route.ts          ← POST: trigger generation
      [jobId]/
        route.ts        ← GET: poll status
```

---

## Access Control Pattern

The existing `canAccessPremium()` in `src/lib/access.ts` is the right hook. Report access needs one additional concept: report tier.

```typescript
// Extend existing pattern
type ReportTier = 'public' | 'pro' | 'enterprise'

function canDownloadReport(user: User | null, reportTier: ReportTier): boolean {
  if (reportTier === 'public') return true
  if (!user) return false
  if (reportTier === 'pro') return canAccessPremium(user)
  if (reportTier === 'enterprise') return user.subscription_tier === 'enterprise'
  return false
}
```

Middleware protects `/pro/*` routes. Individual report downloads check tier at the presigned URL generation step.

---

## Hamilton Persona Layer

Hamilton is a voice, not a model configuration. The persona lives in a dedicated module that wraps Claude calls.

```
src/lib/hamilton/
  index.ts          ← public API: generateSection(), generateNarrative()
  voice.ts          ← system prompt, tone guidelines, forbidden phrases
  sections.ts       ← per-section prompt templates
  types.ts          ← HamiltonSection, ReportContext, SectionOutput
```

Key principle: Hamilton calls receive structured data (numbers, percentages, institution counts) and return prose. Hamilton never queries the database. The assembly layer provides the data; Hamilton interprets it.

```typescript
// voice.ts — the system prompt is the product
export const HAMILTON_SYSTEM_PROMPT = `
You are Hamilton, the AI research analyst at Bank Fee Index.
Your tone: authoritative, precise, data-driven — McKinsey, not MBA thesis.
Your readers: bank executives and compliance officers who distrust fluff.
Rules:
- Lead with the finding, not the methodology
- Cite specific numbers in every paragraph
- Never use "it is important to note" or "as we can see"
- Paragraphs are 2-4 sentences. No five-sentence paragraphs.
- End each section with an implication, not a summary
`
```

---

## Template System

Templates are HTML files with typed data slots. They are not JSX — they are plain HTML strings processed server-side (same pattern as the existing `brief-generator.ts`).

```
src/lib/report-templates/
  base-layout.ts         ← shared header, footer, styles
  national-index.ts      ← National Fee Index template
  state-index.ts         ← State Fee Index template
  monthly-pulse.ts       ← Monthly Pulse template
  peer-brief.ts          ← Peer Brief template (extends existing brief-generator.ts)
  types.ts               ← ReportData, TemplateSlot interfaces
```

Each template is a function: `(data: ReportData, narratives: HamiltonNarratives) => string`.

Design constraints for PDF output:
- Use only web-safe or Google Fonts (loaded inline via `@import` in `<style>`)
- Avoid JS-dependent layouts — Playwright renders with `waitUntil: 'networkidle'` but print CSS is evaluated before JS
- Use CSS `@media print` rules to control page breaks
- Avoid Tailwind utility classes in report templates — use explicit CSS properties for print predictability
- Target Letter format (8.5in × 11in), 0.75in margins

---

## Patterns to Follow

### Pattern 1: Report Assembly as Pure Function

Assembly functions take typed inputs and return a typed output. No side effects, no DB writes, no file I/O inside the assembly function itself. This makes templates testable without infrastructure.

```typescript
// src/lib/report-templates/national-index.ts
export async function assembleNationalIndex(
  data: NationalIndexData,
  opts: { includeHamiltonNarrative: boolean }
): Promise<ReportDocument> {
  const narratives = opts.includeHamiltonNarrative
    ? await generateNarratives('national_index', data)
    : PLACEHOLDER_NARRATIVES

  return {
    html: fillNationalIndexTemplate(data, narratives),
    metadata: { type: 'national_index', generatedAt: new Date() },
  }
}
```

### Pattern 2: Modal Worker as Thin Orchestrator

The Modal function calls the assembly function (imported from the Next.js codebase via a shared package or API call), then renders. It does not contain business logic.

```python
@app.function(image=crawler_image, timeout=180)
async def generate_report(job_id: str) -> None:
    job = get_job(job_id)  # fetch from Supabase
    update_job_status(job_id, 'assembling')

    html = await assemble_report(job['type'], job['params'])  # calls Next.js API or shared lib

    update_job_status(job_id, 'rendering')
    pdf_key = await render_to_pdf(html, job_id)

    update_job_status(job_id, 'complete', artifact_key=pdf_key)
```

### Pattern 3: ISR for Public Report Pages

Public report pages use ISR with a 1-hour revalidation. When a new report is published, call `revalidatePath('/reports')` from the API route that marks a job complete. This avoids manual cache busting.

```typescript
// api/reports/[id]/publish/route.ts
await supabase.from('reports').update({ published: true }).eq('id', id)
revalidatePath('/reports')
revalidatePath(`/reports/${slug}`)
```

### Pattern 4: Strict Separation of Public and Pro Routes

Public report pages render HTML previews with deliberately truncated data — enough for SEO and authority, not enough to replace a subscription. The rule: public pages show executive summary + 2 charts. Full data tables, peer comparisons, and Hamilton recommendations are pro-only.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: PDF Generation in a Next.js Route Handler

Running Playwright or Puppeteer inside a Next.js API route works locally and breaks in every deployment that matters (Vercel, Railway with small instances). Even on a VPS, tying the Next.js process to a Chromium instance creates memory pressure that kills the web server under concurrent load.

Consequence: Intermittent 502s on report generation. Reports take 30-60 seconds; Next.js route handler timeouts are typically 10-30 seconds on serverless.

Prevention: All PDF rendering happens inside Modal functions. The Next.js layer only enqueues jobs and polls status. This is already the established pattern for FeeScout.

### Anti-Pattern 2: Synchronous Report Generation

Generating a Hamilton-heavy report takes 30-90 seconds (6 Claude calls + Playwright render). Treating this as a synchronous API response means users see spinner timeouts and retries cause duplicate jobs.

Prevention: Always async. Trigger returns a job ID immediately. Client polls status. This is identical to the existing State Agent flow.

### Anti-Pattern 3: Using @react-pdf/renderer for McKinsey-Grade Output

`@react-pdf/renderer` produces PDFs by constructing a PDF document from scratch using its own layout engine. It does not render CSS. It cannot use existing Tailwind styles. Complex multi-column layouts, custom fonts, and data tables require reimplementing everything in react-pdf primitives.

The existing `brief-generator.ts` already produces styled HTML. Playwright consuming that HTML output is the zero-migration path.

### Anti-Pattern 4: Public URLs for Report PDFs

Storing a public R2 URL in the database means any user who finds the URL (via browser history, shared link, dev tools) can download gated content. R2 presigned URLs expire — they enforce access control at the resource level, not just at the UI level.

### Anti-Pattern 5: Embedding Hamilton Prompts in Template Files

When prompts are inlined inside template rendering functions, they become invisible to future Hamilton calibration work. Iterate on voice, tone, and section structure without touching template layout code by keeping them in `src/lib/hamilton/sections.ts`.

---

## Scalability Considerations

| Concern | At 10 reports/month | At 100 reports/month | At 1,000 reports/month |
|---------|--------------------|--------------------|----------------------|
| Modal compute | Single function, on-demand | Same, no change | Add concurrency limit |
| R2 storage | < 1GB | ~5-10GB | Still free tier (10GB free egress) |
| Supabase job table | Trivial | Add index on `status, created_at` | Partition by month |
| Claude API cost | $50-100/mo | $500-1,000/mo | Cache common sections, add tiers |
| PDF cache hits | Not needed | Cache state-level reports (same data) | Cache by data hash |

---

## Build Order

Each step depends on the ones before it.

**Step 1 — Supabase schema**
Create `report_jobs` and `published_reports` tables. Add R2 bucket (`bfi-reports`). No code yet.

**Step 2 — Hamilton persona module**
`src/lib/hamilton/` — system prompt, `generateSection()` function. Write unit tests with fixture data before touching templates.

**Step 3 — Extend brief-generator.ts to template system**
`src/lib/report-templates/` — start with `peer-brief.ts` (extends the existing generator), then `national-index.ts`. Each template is a pure function.

**Step 4 — Assembly functions**
`assembleTemplateReport()` and `assembleHamiltonReport()` — compose data fetch + Hamilton calls + template fill. Test with stub Claude responses.

**Step 5 — Modal render worker**
`modal_workers/generate_report.py` — call assembly (via Next.js API or shared lib), Playwright PDF, R2 upload, Supabase update.

**Step 6 — Next.js API routes**
`POST /api/reports` (trigger), `GET /api/reports/:id/status` (poll), `GET /api/reports/:id/download` (presigned URL). Wire to job table.

**Step 7 — Pro UI**
`app/pro/reports/` — report library, generation trigger, polling UI, download button.

**Step 8 — Public catalog**
`app/(public)/reports/` — ISR catalog, individual report pages, SEO metadata, CTA for non-subscribers.

---

## Sources

- [PDF Generation in Next.js 15 with Puppeteer — Dev Genius](https://blog.devgenius.io/pdf-generation-in-next-js-15-with-puppeteer-3023df1ead95) — MEDIUM confidence (verified architecture pattern)
- [Creating a Next.js API to Convert HTML to PDF with Puppeteer (Vercel-Compatible) — DEV Community](https://dev.to/harshvats2000/creating-a-nextjs-api-to-convert-html-to-pdf-with-puppeteer-vercel-compatible-16fc) — MEDIUM confidence (serverless constraints confirmed)
- [How to Generate PDFs in 2025 — DEV Community](https://dev.to/michal_szymanowski/how-to-generate-pdfs-in-2025-26gi) — MEDIUM confidence (comparison of approaches)
- [Building Secure, Scalable Downloads with Cloudflare R2 + Next.js — MD Pabel](https://www.mdpabel.com/blog/secure-file-downloads-with-cloudflare-r2-and-next-js-complete-setup-guide) — MEDIUM confidence (R2 presigned URL pattern)
- [Presigned URLs — Cloudflare R2 docs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/) — HIGH confidence (official docs)
- [Background Jobs for Node.js using Next.js, Inngest, Supabase, and Vercel — Medium](https://medium.com/@cyri113/background-jobs-for-node-js-using-next-js-inngest-supabase-and-vercel-e5148d094e3f) — MEDIUM confidence (async job pattern)
- [How I Solved Background Jobs using Supabase Tables and Edge Functions — jigz.dev](https://www.jigz.dev/blogs/how-i-solved-background-jobs-using-supabase-tables-and-edge-functions) — MEDIUM confidence (Supabase table-as-queue pattern)
- [Building Blocks of LLM Report Generation: Beyond Basic RAG — LlamaIndex](https://www.llamaindex.ai/blog/building-blocks-of-llm-report-generation-beyond-basic-rag) — MEDIUM confidence (multi-agent report pattern, WebSearch)
- [Stripe Subscription Lifecycle in Next.js — DEV Community](https://dev.to/thekarlesi/stripe-subscription-lifecycle-in-nextjs-the-complete-developer-guide-2026-4l9d) — MEDIUM confidence (access control pattern)
- [PptxGenJS — npm](https://www.npmjs.com/package/pptxgenjs) — HIGH confidence (official package, confirmed Node.js server-side support)
- Existing codebase: `src/app/pro/brief/route.ts`, `src/lib/brief-generator.ts` — HIGH confidence (direct inspection, establishes baseline)

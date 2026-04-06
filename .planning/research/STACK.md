# Technology Stack: Hamilton Report Engine + B2B Content Platform

**Project:** Bank Fee Index — v2.0 Hamilton (Report & Content Engine)
**Domain:** B2B financial intelligence — PDF/PPTX report generation, AI narrative analysis, subscription portal
**Researched:** 2026-04-06
**Overall confidence:** HIGH for core choices; MEDIUM for chart rendering path

---

## What This Stack Covers

This document covers **only the additions** needed for the Hamilton milestone. The existing stack
(Next.js 16 App Router, React 19, Tailwind v4, Python 3.12 on Modal, Claude Haiku, Supabase) is
already in production and is not reconsidered here.

The additions span three distinct areas:

1. **Report generation engine** — PDF and PPTX output from structured data + Hamilton narrative
2. **Hamilton AI analyst** — Claude model selection, prompt architecture, cost management
3. **B2B subscription portal** — Stripe billing, Supabase RLS gating, Next.js protected routes

---

## Part 1: Report Generation Engine

### Core Strategy: HTML-to-PDF via Playwright (Python, runs on Modal)

The report pipeline lives in Python alongside the existing data pipeline. Generate reports
server-side on Modal as background jobs. Store output in the existing Cloudflare R2 bucket.
Expose download URLs to the Next.js frontend.

**Why HTML-to-PDF rather than ReportLab or WeasyPrint:**
ReportLab requires building layouts imperatively in Python — every chart position, font, and
spacing is code. This is fast but produces rigid, programmer-aesthetic output. McKinsey-grade
reports need precise typographic control, multi-column layouts, bleed, and CSS effects that are
trivial to specify in HTML+CSS but extremely tedious in ReportLab's canvas API.

Playwright (already a pipeline dependency at `playwright>=1.40`) renders Chromium headlessly
and calls `page.pdf()`, capturing pixel-perfect CSS layout. You design the report in HTML+CSS
once and generate it at scale. This is the same approach used by Notion, Linear, and financial
SaaS companies for PDF exports. ReportLab is a fallback only if PDF file sizes become a
performance problem.

### PDF Generation

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Playwright (Python) | `>=1.40` (already installed) | HTML-to-PDF via headless Chromium | Already a pipeline dependency; `page.pdf()` supports `format`, `margin`, `print_background`; PDF generation works only in Chromium — confirmed. No extra install cost. |
| Jinja2 | `>=3.1` | HTML template engine for report layout | Standard Python templating. Loops over data arrays, conditional sections, filter support for currency/percent formatting. Already likely a transitive dependency. |
| WeasyPrint | `>=62.0` | Fallback for lightweight PDFs (no JS required) | If Playwright is too heavy for simple one-page pulse reports, WeasyPrint renders HTML+CSS without a browser. Slower at CSS rendering edge cases but no browser dependency. Reserve for monthly pulse reports only. |

**Confidence:** HIGH — Playwright `page.pdf()` is official API, confirmed in docs. Jinja2 is
the standard Python templating choice with no meaningful alternatives at this scope.

### PPTX Generation

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| python-pptx | `>=1.0.0` | Programmatic PowerPoint generation | The only maintained Python library for `.pptx` output. v1.0.0 released 2024, stable API. Does not require PowerPoint to be installed; works on Modal Linux containers. Supports slide masters, custom layouts, tables, text runs, charts (via embedded OOXML), and image insertion. |
| Matplotlib | `>=3.9` | Chart image generation (PNG) embedded in PPTX/PDF | Renders charts to `BytesIO` buffers server-side — no DOM required. Use `matplotlib.use("Agg")` backend on Modal (headless). Export charts as PNG, embed in Jinja2 HTML for PDF or insert via `python-pptx` for PPTX. The pipeline already uses pandas; Matplotlib integrates directly. |

**Why not Recharts for chart generation?** Recharts is a React/D3 client-side library. Rendering
it server-side for static image export would require spinning up a Node.js headless browser
separately just to capture chart screenshots — two headless browsers instead of one, adding
complexity and cost. Matplotlib runs in the same Python process as the data queries, eliminates
a network hop, and produces publication-quality static figures.

**Confidence:** HIGH — python-pptx 1.0.0 confirmed on PyPI/official docs. Matplotlib Agg
backend for headless server rendering is well-established.

### Chart Rendering Detail

Use the `Agg` (non-interactive) backend: `matplotlib.use("Agg")` at module top. This is
required on Modal containers (no display server). Render charts to `io.BytesIO`, then:
- For PDF: encode to base64 and embed as `<img src="data:image/png;base64,...">` in Jinja2 HTML
- For PPTX: pass the `BytesIO` buffer directly to `slide.shapes.add_picture()`

Seaborn is acceptable as a Matplotlib wrapper for statistical charts (distributions, heatmaps)
but add it only if needed — Matplotlib alone covers bar, line, scatter, waterfall, and box plots
sufficient for fee benchmarking reports.

### Report Storage

Modal jobs generate the file, upload to the existing Cloudflare R2 bucket via the S3-compatible
API, and write a record to the Supabase `reports` table with the R2 key and metadata. The
Next.js frontend generates a signed R2 URL on-demand for download. No new storage infrastructure
is required.

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `boto3` | `>=1.35` | R2 upload from Modal Python job | R2 is S3-compatible; boto3 with a custom `endpoint_url` is the standard approach. Already likely used for existing pipeline storage. |

---

## Part 2: Hamilton AI Analyst

### Model Selection

Use **Claude Sonnet 4.6** (not Opus 4) for Hamilton report generation.

**Rationale:**
- Sonnet 4.6: ~$3/M input, ~$15/M output — a 2,000-token output costs ~$0.03
- Opus 4: ~$15/M input, ~$75/M output — same output costs ~$0.15, 5x more expensive
- A complete Hamilton report (4-6 narrative sections) totals ~5,000-8,000 output tokens = $0.08-0.12 at Sonnet rates
- Sonnet 4.6 is the current production Sonnet model (confirmed: this is the model powering the current session)
- For Hamilton's use case — structured analysis with clear data inputs — Sonnet 4.6 quality is
  indistinguishable from Opus for well-engineered prompts

**Reserve Opus 4.6 for:** competitive peer briefs where a client is paying $500+ per report and
document quality justifies the cost. Gate the model choice on report type in the job config.

**Prompt caching:** Enable prompt caching on the Hamilton system prompt and the fee taxonomy
context block. These are large, stable, and reused across every report call. Caching reduces
cost by up to 90% on the repeated context. Use `cache_control: {"type": "ephemeral"}` on the
system prompt blocks in the messages API.

**Batch API:** For monthly automated reports (pulse, state index), use the Anthropic Batch API
(~50% cost reduction) since these do not require real-time response.

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `anthropic` SDK | `>=0.40` (already installed) | Hamilton narrative generation | Already in production for Haiku extraction. Upgrade to structured outputs (`output_format` param) for section-by-section JSON responses that map cleanly to Jinja2 template slots. |

### Structured Output Schema

Use Anthropic's structured outputs (released November 2025) for Hamilton. Define a Pydantic
schema for each report type:

```python
class HamiltonReportSection(BaseModel):
    headline: str          # One-sentence insight title
    body: str              # 2-3 paragraph narrative
    key_stat: str          # Single pull-quote statistic
    footnote: str | None   # Data caveat if needed

class HamiltonReport(BaseModel):
    executive_summary: str
    sections: list[HamiltonReportSection]
    methodology_note: str
```

This prevents malformed output from breaking report assembly and eliminates JSON parsing errors
in the template pipeline.

**Confidence:** HIGH — Anthropic structured outputs confirmed in official docs (November 2025 GA).

---

## Part 3: B2B Subscription Portal

### Authentication

Supabase Auth is already in production. No change. The subscription layer builds on top of it.

### Stripe Integration

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `stripe` (Python SDK) | `>=10.0` | Webhook handling in Python (on Modal or Vercel) | Stripe webhooks update subscription status in Supabase. Python SDK matches the existing pipeline language; process webhooks in a Modal web endpoint or Next.js API route. |
| `@stripe/stripe-js` | `>=4.0` | Stripe.js + Elements on frontend | Official client-side Stripe library. Required for Stripe Checkout redirect and Customer Portal link generation. |
| `stripe` (npm) | `>=16.0` | Server-side Stripe calls in Next.js | Customer Portal session creation, checkout session creation, webhook verification. Use in Next.js Server Actions. |

**Subscription state pattern:** Mirror Stripe subscription status into a Supabase `subscriptions`
table. Do NOT query Stripe on every request — cache locally. Listen to these webhook events:
`customer.subscription.created`, `customer.subscription.updated`,
`customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`.

### Access Gating

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@supabase/ssr` | `>=0.6` | Supabase auth in Next.js middleware | The current `@supabase/auth-helpers-nextjs` is deprecated; `@supabase/ssr` is the current package for App Router. Manages session cookies in middleware cleanly. |
| Next.js Middleware | built-in | Route-level subscription gating | Check `subscriptions` table (via Supabase) in `middleware.ts` before serving `/reports/*` and `/portal/*` routes. Redirect unauthenticated or unpaid users to `/pricing`. |

**RLS policy for report access:**
```sql
-- Users can only download reports they have an active subscription for
create policy "report_access_by_subscription"
on reports for select
using (
  exists (
    select 1 from subscriptions
    where subscriptions.user_id = auth.uid()
    and subscriptions.status = 'active'
    and subscriptions.tier >= reports.required_tier
  )
);
```

**Confidence:** MEDIUM for RLS policy pattern — the `@supabase/ssr` package and middleware
pattern are confirmed in current Supabase docs; the exact RLS policy above is derived from
documented patterns but will need validation against actual schema.

### Consumer-Facing Pages

No new libraries required. Consumer fee lookup pages use the existing Next.js App Router +
Tailwind v4 stack. Server Components fetch from Supabase directly. No client-side state
management library is needed at this scale.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| PDF generation | Playwright HTML-to-PDF | ReportLab | ReportLab requires imperative layout code — cannot match CSS-designed McKinsey templates without enormous boilerplate |
| PDF generation | Playwright HTML-to-PDF | WeasyPrint (primary) | WeasyPrint's CSS support lags Chromium; flexbox/grid layouts and web fonts render inconsistently. Use WeasyPrint only as fallback for simple pages. |
| Chart generation | Matplotlib (Python, server) | Recharts (React, client) | Recharts requires a DOM; rendering to static PNG for PDF embed requires a second headless Node.js process. Matplotlib runs in the same Python process as data queries. |
| PPTX | python-pptx | Aspose.Slides | Aspose requires a commercial license; python-pptx is MIT and sufficient for all slide types needed |
| AI model | Claude Sonnet 4.6 | Claude Opus 4.6 | Opus is 5x more expensive; quality difference is negligible for structured narrative tasks with well-engineered prompts. Use Opus only for on-demand premium competitive briefs. |
| Subscription billing | Stripe | Paddle | Stripe is already confirmed in project memory (test keys present). No reason to switch. |
| Auth | Supabase Auth | Clerk | Supabase Auth already in production; Clerk adds a new vendor with no benefit at this scale |
| Frontend charts (web UI) | Recharts (existing) | Chart.js / ECharts | Recharts is already used in the existing admin dashboard. Consistency over marginal gains. |

---

## Installation

```bash
# Python additions (fee_crawler/requirements.txt or requirements-report.txt)
jinja2>=3.1
python-pptx>=1.0.0
matplotlib>=3.9
boto3>=1.35
# anthropic and playwright are already installed
# stripe Python SDK (if webhook handling in Python)
stripe>=10.0
```

```bash
# Node additions (package.json)
npm install stripe @stripe/stripe-js
npm install @supabase/ssr
# playwright, @anthropic-ai/sdk, recharts already installed
```

---

## Modal Configuration Notes

- Playwright on Modal: use the `playwright` image with Chromium; it is already in use for
  crawling — the same image and container can run `page.pdf()` for report generation
- Matplotlib Agg: set `MPLBACKEND=Agg` as a Modal environment variable to guarantee headless
  rendering without needing `matplotlib.use("Agg")` in every script
- Report jobs: define a `@app.function(timeout=300)` for PDF generation — allow up to 5 minutes
  for complex reports with many charts; typical simple reports will finish in 15-30 seconds

---

## Sources

- Playwright `page.pdf()` official API: https://playwright.dev/python/docs/api/class-page#page-pdf (confirmed)
- python-pptx 1.0.0 docs: https://python-pptx.readthedocs.io/ (confirmed)
- Anthropic structured outputs (November 2025 GA): https://claude.com/blog/structured-outputs-on-the-claude-developer-platform (confirmed)
- Anthropic pricing (Sonnet 4.6 vs Opus 4.6): https://platform.claude.com/docs/en/about-claude/pricing (confirmed)
- Anthropic prompt caching: https://platform.claude.com/docs/en/build-with-claude/prompt-caching (official docs)
- Modal cloud bucket mounts (R2 support): https://modal.com/docs/guide/cloud-bucket-mounts (confirmed)
- @supabase/ssr package (replaces deprecated auth-helpers): https://supabase.com/docs/guides/auth/auth-helpers/nextjs (confirmed)
- Stripe Next.js 2025 guide: https://www.pedroalonso.net/blog/stripe-nextjs-complete-guide-2025/ (MEDIUM — community source)
- Matplotlib Agg backend (headless server rendering): https://matplotlib.org/stable/users/explain/backends.html (confirmed)
- WeasyPrint vs Playwright comparison: https://dev.to/claudeprime/generate-pdfs-in-python-weasyprint-vs-reportlab-ifi (MEDIUM — community source)

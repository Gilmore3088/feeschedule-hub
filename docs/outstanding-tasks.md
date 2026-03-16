# Outstanding Tasks

## Needs James (can't be done by Claude alone)

| # | Task | Why You | Effort | Impact |
|---|------|---------|--------|--------|
| 1 | Rotate FRED API key | Need to register new key at fred.stlouisfed.org | 2 min | Security |
| 2 | Set up S3 backup bucket | Need to sign up at backblaze.com, create bucket | 5 min | Data safety |
| 3 | Sign up for Resend (email) | Need account at resend.com, verify bankfeeindex.com domain | 10 min | Lead notifications |
| 4 | Test Stripe checkout end-to-end | Need to run `stripe listen` in terminal + test payment flow | 15 min | Payment flow |
| 5 | Switch Stripe to live keys | When ready to charge real money -- swap test keys for live in Fly.io secrets | 5 min | Revenue |
| 6 | Decide on launch date | Flip `COMING_SOON = false` in proxy.ts | 1 min | Go live |

## Can Be Done by Claude (next session)

| # | Task | Description | Priority |
|---|------|-------------|----------|
| 7 | Wire Resend email notifications | After James signs up, add lead notification + welcome emails | High |
| 8 | Configure Litestream with S3 | After James creates bucket, set env vars on Fly.io | High |
| 9 | Production Stripe webhook | Create production webhook endpoint in Stripe Dashboard for feeinsight.com (not test) | High |
| 10 | Mobile nav hamburger menu | No mobile menu exists -- B2B users are mostly desktop but it's unprofessional | Medium |
| 11 | SEO meta images (OG/Twitter) | No social share images -- links shared on LinkedIn/Twitter look bare | Medium |
| 12 | Favicon update | Currently code-generated, should match brand (bar chart icon) | Low |
| 13 | Consumer landing page search bar | Add inline institution search widget to /consumer hero | Medium |
| 14 | Admin dashboard lead count widget | Show new leads count on admin dashboard home | Low |

## Known Bugs

| # | Bug | Severity |
|---|-----|----------|
| 1 | Stripe webhook doesn't auto-activate (server-side fallback works) | Medium -- payment works, just requires page refresh |
| 2 | Some "Fee Insight" may remain in brand.ts secondary fields | Low -- not user-visible |
| 3 | /pro/page.tsx still has some "Request Access" mailto CTAs (consulting section) | Low |

## Completed (for reference)

- Data pipeline: 7 new commands, 229k rows, refresh-data orchestrator
- Fly.io deployment + GitHub Actions CI/CD
- 3 domains configured (feeinsight.com, bankfeeindex.com, thebankfeeindex.com)
- Coming soon page with lead capture form
- Customer auth (register, login, account, welcome onboarding)
- Stripe checkout (test mode) with 3 products
- Free vs premium access gating on all pages
- Unified branding (Bank Fee Index, cream/terra cotta)
- Institution search page
- Shared CustomerNav + CustomerFooter
- User journey audit (100% link coverage)
- Admin leads page
- Pro page reskinned to match brand
- 22 verified page routes, no dead ends

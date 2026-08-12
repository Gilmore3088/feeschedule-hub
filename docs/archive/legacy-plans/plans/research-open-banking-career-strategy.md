# Research: Open Banking + Bank Fee Index Career & Product Strategy

> **Type:** Strategic Research & Opportunity Analysis
> **Date:** 2026-02-16
> **Status:** Draft

---

## Executive Summary

Open Banking is a regulatory and technology framework that requires banks to share consumer financial data (with consent) via secure APIs. In the US, CFPB Section 1033 was finalized in October 2024 but is currently **enjoined and under reconsideration** -- compliance timelines have slipped to 2027+. Despite regulatory limbo, the market is moving: JPMorgan has established data-access fee agreements with Plaid/Yodlee/Akoya, FDX API 6.0 covers 620+ data elements, and 76M+ consumer accounts already share data via FDX.

**Your Bank Fee Index sits at a unique intersection**: you have the "disclosed" side (crawled fee schedules for 8,751 institutions across 49 categories) while Open Banking APIs provide the "actual" side (real transaction-level fees). Nobody else has both. This creates three strategic paths: build a fee intelligence product, pivot into an Open Banking career, or both.

---

## Part 1: What Is Open Banking?

### Core Concept

Open Banking replaces screen-scraping (apps storing your bank credentials) with standardized, token-based API access. The premise: **your financial data belongs to you**, and you can authorize any third party to access it.

### How It Works

1. Consumer grants consent via their bank's OAuth 2.0 / FAPI authorization server
2. Third party receives an access token (never the consumer's credentials)
3. Third party calls standardized APIs (FDX standard) for account data, transactions, balances
4. Data flows through intermediaries (Plaid, MX, Akoya) or directly via bank APIs
5. Consumer can revoke access at any time

### Global Regulatory Landscape

| Region | Regulation | Status |
|--------|-----------|--------|
| **EU** | PSD2 (2018), evolving to PSD3/PSR | PSD3 expected effective 2026-2028 |
| **UK** | Open Banking (OBIE) | Most mature. 7M+ users since 2018 |
| **US** | Section 1033 / CFPB | **Enjoined**. Under reconsideration. Timeline slipped to 2027+ |
| **Australia** | Consumer Data Right (CDR) | Active. Expanding to energy/telecom |
| **Canada** | Open Banking framework | Targeting early 2026 |
| **Brazil** | Open Finance | Live since 2021. Includes insurance, investments |

---

## Part 2: US Open Banking -- The Section 1033 Saga

### Timeline

| Date | Event |
|------|-------|
| Oct 2024 | CFPB finalizes Section 1033 (Personal Financial Data Rights) |
| Jan 2025 | Rule becomes effective |
| Apr 2026 | **Original**: largest banks must comply |
| Jul 2025 | Court **stays** the rule pending CFPB reconsideration |
| Aug 2025 | CFPB issues Advance Notice of Proposed Rulemaking |
| Oct 2025 | Court **enjoins** CFPB from enforcing the rule |
| Dec 2025 | CFPB signals an "interim final rule" (will face immediate legal challenge) |
| Feb 2026 | Rule remains enjoined. Interim final rule expected |

### What the Rule Would Require Banks to Share

- **Transaction history** (24 months): amounts, dates, payment types, merchant names, **fees and finance charges**
- **Account balances**
- **Terms and conditions**: APR, APY, **fees and pricing information**
- **Upcoming bill information**
- **Basic identity verification**
- Data providers **may not charge fees** for data access

### Four Issues Under Reconsideration

1. Who qualifies as a "representative" making requests on behalf of consumers?
2. Should **fees be permitted** to defray data provider costs? (Banks want this.)
3. Data security threat models and cost-benefit implications
4. Data privacy threat models

### The JPMorgan Precedent

While regulation stalled, the market moved. In November 2025, JPMorgan reached agreements with Plaid, Yodlee, and Akoya to **charge for data access** -- covering 95%+ of open banking requests to JPMorgan. Wells Fargo and PNC are pushing fintechs to route through Akoya (the bank-owned intermediary).

**Large banks are establishing a toll-booth model for data access while the regulatory framework remains in limbo.**

### What This Means

- **Risk**: Products dependent on free, frictionless data access face headwinds if banks can charge
- **Opportunity**: Confusion creates demand for expertise navigating the patchwork
- **Strategic read**: Open banking in the US is happening regardless of regulation, driven by market forces

---

## Part 3: CSI's Open Banking Initiative

### Who Is CSI?

CSI (Computer Services, Inc.), headquartered in Paducah, Kentucky, is a nearly 60-year-old banking technology provider. Their **NuPoint core banking platform powers 10.1% of all US banks** -- the #2 most-used core platform nationally (per FedFis). CSI primarily serves community and regional banks.

### CSI's Open Banking = Three Components

**1. NuPoint Core Platform**
Cloud-based core banking system (system of record for deposits, loans, transactions). Its open architecture allows third-party APIs to connect directly -- the key differentiator from legacy closed-system cores.

**2. Open Banking Marketplace**
A curated directory of pre-integrated fintech solutions, vetted and certified against CSI's APIs. Categories include:
- Account opening and onboarding
- Payment processing (FedNow, P2P, ACH, wire, cards)
- Fraud detection (WatchDOG AML via Hawk AI)
- Regulatory compliance and reporting
- Lending (via Hawthorn River, acquired 2023)
- Digital banking (via Apiture, acquired October 2025)
- Deposit growth (via Velocity Solutions, acquired 2024)

**3. CSIBridge Developer Portal**
Sandbox environment for custom API development:
- API documentation with technical and application guides
- Code samples promoting standardization
- Test environments for evaluating integrations
- Real-time analytics for monitoring API connections

### CSI's Key Distinction: Open Banking vs. BaaS

From CSI's own content:
> "Open banking uses APIs to access financial data, whereas BaaS uses APIs to access banking functionality."

- **Open Banking**: Banks plug in new features (digital banking, faster payments). Data sharing between institutions.
- **BaaS**: Banks lend their charter to fintechs for a fee, enabling non-regulated companies to offer financial services.

CSI positions both as competitive necessities: "institutions that don't take advantage of this technology risk losing out to the competition."

### Integration Models

| Model | Description |
|-------|------------|
| **Real-Time API** | Secure, instantaneous connections for dynamic data exchange |
| **File-Based (SFTP)** | Scheduled secure file exchanges for fraud, compliance, reporting |
| **Marketplace Pre-Integrated** | Turnkey solutions already tested and certified |

### Getting on the CSI Marketplace

For **pre-listed solutions**: Select > notify CSI RM > activation project > go live
For **new fintechs**: Evaluation > CSI Open Banking contact > contracting + technical review > sandbox + development > certification > production

**Important**: CSI's Developer Portal requires bank sponsorship. You need a CSI bank customer willing to champion your integration. This is a walled-garden model, not an open developer ecosystem like Plaid or Stripe.

### Recent CSI Developments

| Date | Event |
|------|-------|
| 2023 | Acquired Hawthorn River (loan origination) |
| 2024 | Acquired Velocity Solutions (deposit growth, liquidity) |
| Jul 2024 | Launched expanded Developer Portal |
| Aug 2025 | Announced acquisition of Apiture (digital banking) |
| Oct 2025 | Completed Apiture acquisition |
| Jan 2026 | Released 2026 Banking Priorities Report (AI = top opportunity AND threat) |
| H1 FY2025 | 18 new core deals, 27% growth in Hawthorn River customers, record revenue |

### Apiture's My Data Exchange (via CSI acquisition)

Critical capability now inside CSI:
- Replaces legacy screen-scraping with secure API-based data sharing
- Integrates with **Plaid** and **Finicity** directly
- Consumer dashboard to view/manage third-party data connections
- Aligns with Section 1033 consumer data rights
- Connects with 40+ core banking solutions, serves 250+ banks and credit unions

---

## Part 4: The Competitive Landscape

### CSI vs. Data Aggregators

| Dimension | CSI | Plaid / MX / Finicity / Akoya |
|-----------|-----|-------------------------------|
| **Role** | Core provider enabling open banking FROM the bank | Aggregator pulling data FROM banks to fintechs |
| **Data flow** | Bank outward (bank controls) | Fintech inward (fintech initiates) |
| **Primary customer** | The bank | The fintech/app developer |
| **Revenue model** | Bank pays for core + platform | Fintech pays per API call / connection |
| **Data scope** | Full core banking data | Typically accounts, transactions, identity |
| **Developer access** | Gated (requires bank sponsorship) | Open (any developer can sign up) |

**Key insight**: CSI is NOT a competitor to Plaid/MX. CSI is the **data provider side**. Plaid/MX are the **data consumer side**. Through Apiture, CSI now integrates directly with Plaid and Finicity.

### Data Aggregators Comparison

| Company | Strength | Connections | Notable |
|---------|----------|-------------|---------|
| **Plaid** | Broadest US coverage, developer UX | 11,500+ | Market leader. Best auth flows |
| **MX** | Data quality, enrichment, classification | 50,000+ | Best for analytics/insights products |
| **Finicity/Mastercard** | Lending/underwriting, cash-flow verification | ~15,000 | Mortgage standard. Mastercard backing |
| **Akoya** | Bank-owned, API-only (no scraping) | Growing | **The banks' answer** to aggregators |
| **Yodlee/Morningstar** | Longest history, global reach | 17,000+ | Being repositioned under Morningstar |

### FDX Standard (Financial Data Exchange)

- Nonprofit standards body. API specification is **royalty-free**
- Current: FDX API 6.0 (2025), covering **620+ unique data elements**
- Covers: accounts, transactions, terms, rewards, tax documents, payroll data
- Security: references FAPI 1.0 Advanced (OpenID Foundation)
- **76 million consumer accounts** sharing data via FDX (2024)
- CFPB-recognized standard-setting body (January 2025)

---

## Part 5: Where Bank Fee Index Meets Open Banking

### Your Unique Position

Your Bank Fee Index has the **disclosed** side:
- 8,751 institutions crawled
- 49 fee categories across 9 families
- 4-tier system (spotlight/core/extended/comprehensive)
- National and peer-group benchmarks (median, P25/P75, min/max)
- Fed district, charter type, and asset tier segmentation

Open Banking APIs provide the **actual** side:
- Real transaction-level fee charges
- Frequency of fee occurrence
- Waiver patterns
- Effective vs. stated amounts

**Nobody else has both sides.**

### The Four-Layer Vision

```
Layer 1: "Fee Schedule Truth" (Disclosed Fees)
  What you have today. The published fee schedule. The PROMISE.

Layer 2: "Transaction Fee Reality" (Actual Fees via Open Banking)
  With consumer consent, extract actual fee transactions via Plaid/MX.
  Section 1033 explicitly includes "fees or finance charges." The REALITY.

Layer 3: "Fee Gap Analysis" (Promise vs. Reality)
  - Does the bank actually charge the disclosed amount?
  - How often are fees waived? What is the effective fee rate?
  - Are there fees in transactions NOT in the fee schedule?
  - What is the total fee burden per consumer?

Layer 4: "Fee Intelligence Platform"
  Aggregate anonymous, consented data across thousands of users:
  - Actual median fees paid (not just disclosed) per institution
  - Fee waiver rates by institution and category
  - Fee burden scores (annual fees as % of average balance)
  - Switching savings calculators
  - Regulatory data feeds for CFPB, state AGs, consumer groups
```

### Technical Integration Architecture

```
Existing Stack                    Open Banking Layer
--------------                    ------------------
crawler.db (SQLite)        <-->   Plaid Transactions API
  fee_schedules table               - fee transaction detection
  fee_categories (49)                - merchant/category enrichment
  institutions (8,751)            MX Data Enrichment
                                     - clean categorization
fee-taxonomy.ts            <-->   FDX API 6.0
  9 families, 49 cats                - 620+ data elements
  4-tier system                      - terms & conditions
                                     - fee/pricing fields
National/Peer Index        <-->   Aggregated User Data
  getMedian(), getP25/P75()          - actual fees paid
  maturity badges                    - waiver rates
                                     - effective vs. stated
```

### Transferable Skills from This Codebase

| Your Existing Skill | Open Banking Application |
|--------------------|------------------------|
| 6 federal API integrations (FDIC, NCUA, CFPB, FRED, Fed RSS, Claude) | FDX API, Plaid SDK, MX SDK integration |
| Fee taxonomy (49 categories, 200+ aliases) | Transaction categorization and enrichment |
| Peer comparison engine (scored matching, percentiles) | Peer benchmarking with Open Banking data |
| Validation engine (multi-severity, category-specific bounds) | Open Banking data quality and consent validation |
| Admin review workflow (role-based auth, audit trails) | Consent management and data access monitoring |
| Pipeline patterns (pagination, upserts, content hashing, retry logic) | Open Banking data ingestion pipelines |

---

## Part 6: Three Strategic Paths

### Path A: Build a Fee Intelligence Product

**What**: Evolve Bank Fee Index into a platform combining disclosed fees (crawler) with actual fees (Open Banking APIs).

**Product Concepts**:

1. **"Bank Fee Index Pro" (B2C)**: Consumers connect accounts. Shows: "Your bank charges $35 for overdrafts. You've been charged 4 times this year ($140). National median: $29. Banks with $0 overdraft: [list]. Estimated savings if you switch: $280."

2. **"Fee Transparency API" (B2B)**: API for fintechs and comparison sites. Endpoints like `GET /institutions/{id}/fee-reality` returning disclosed vs. actual fee comparisons.

3. **"Fee Audit for SMBs" (B2B)**: Small businesses connect accounts. Tool identifies every fee, maps to taxonomy, benchmarks against peers, generates audit report.

4. **"Regulatory Data Feed" (B2G)**: Anonymized, aggregated fee data for CFPB, state banking departments, consumer advocacy groups.

**Revenue Model**: Freemium consumer tool + API subscription ($49-299/mo) + data licensing for regulators

**Timeline**: 3-6 months to MVP with Plaid sandbox data

**Risk**: Plaid/MX transaction data may not categorize fees at sufficient granularity. Test in sandbox first.

### Path B: Open Banking Career Pivot

**What**: Join an aggregator, core provider, or bank's open banking team.

**Target Companies**:
- **MX** -- Data quality focus aligns with your taxonomy work
- **Plaid** -- Market leader, scale (Senior Engineer: ~$465K; Staff: ~$690K)
- **Akoya** -- Bank-side strategy
- **Mastercard/Finicity** -- Lending data, Mastercard career ecosystem
- **Jack Henry** -- Most open API strategy among core providers
- **Major bank** (JPMorgan, Capital One) -- Internal open banking compliance team

**Roles**:
- Senior/Staff Engineer in data quality, enrichment, or compliance
- Product Manager for data-sharing products
- Financial Data Analyst for fee analysis and benchmark construction

**Your Competitive Advantage**: 45,000+ open banking job postings, but most candidates are generic engineers without financial domain expertise. Your 49-category fee taxonomy demonstrates the exact financial data modeling aggregators need.

**Portfolio Piece**: Bank Fee Index + a Plaid sandbox PoC showing "disclosed vs. actual" fee comparison.

### Path C: Open Banking Consulting

**What**: Advise community banks on Section 1033 readiness, FDX compliance, and data-sharing strategy.

**Why**: Community banks (CSI, Jack Henry, Fiserv cores) are least prepared for open banking. They need help understanding what data to share, how to connect to aggregator networks, and how to audit fee disclosures.

**Engagement Model**: $5K-20K per bank compliance assessment. Your fee schedule data provides the baseline for each audit.

**Timeline**: Can start immediately with existing data and knowledge.

---

## Part 7: Technical Skills Gap Analysis

### What You Have

| Skill | Status |
|-------|--------|
| Next.js / React 19 / Tailwind v4 | Strong |
| SQLite / financial data modeling | Strong |
| Web crawling / data extraction / LLM extraction | Strong |
| Fee taxonomy (49 categories, validation rules) | Unique differentiator |
| Banking domain knowledge (FDIC, NCUA, CFPB, Fed) | Strong |
| Server components / App Router | Strong |

### What You Need

| Skill | Priority | How to Learn |
|-------|----------|-------------|
| **OAuth 2.0 / FAPI 2.0 security** | Must-have | FAPI 2.0 extends OAuth for financial APIs. Requires PKCE, mTLS, DPoP |
| **FDX API specification** | Must-have | 620+ data elements. Royalty-free spec at financialdataexchange.org |
| **Plaid or MX SDK integration** | Must-have | Free sandbox accounts. Test fee transaction data quality |
| **SOC 2 / compliance frameworks** | Important | Required for any bank partnership or marketplace listing |
| **PostgreSQL (production)** | Important | Your RESEARCH_FINDINGS.md already documents Supabase migration path |
| **Cloud-native deployment** | Nice-to-have | AWS Lambda, API Gateway, S3, DynamoDB |

---

## Part 8: 2026 Trends

1. **Open Banking becomes Open Finance**: Beyond bank accounts into investments, insurance, pensions, mortgages, tax data
2. **Agentic AI + Financial Data**: AI agents that monitor accounts, detect fee patterns, automatically recommend actions (switch banks, request waivers, dispute charges)
3. **Real-Time Payments**: FedNow + RTP combined with Open Banking enables instant account-to-account transfers
4. **Data Access Economics Crystallize**: Premium on data quality and enrichment. Raw transaction data is commodity; taxonomized data (what you build) is the value layer
5. **Embedded Finance**: $185B TAM growing 25% YoY. Non-financial brands embedding banking products
6. **Regulatory Fragmentation**: Multi-jurisdiction compliance (PSD3, CDR, Section 1033) creates demand for compliance platforms

---

## Part 9: Critical Questions to Answer Before Committing

### Must Answer (blocks everything)

1. **Does Plaid/MX transaction data categorize fees at sufficient granularity?** If fees appear as generic debits with no category metadata, the "disclosed vs. actual" thesis requires building a fee-transaction classifier (adds 2-3 months). Test in sandbox.

2. **What does Plaid/MX production access cost for a pre-revenue startup?** If $25K+/year, the economics change. Plaid Development tier (free, 100 test institutions) is sufficient for PoC only.

3. **Is your strategic goal "build a product" or "get hired"?** Different optimization targets. "Build product" = revenue in 6 months. "Get hired" = portfolio piece in 2-3 months.

### Should Answer

4. **Does Section 1033 require banks to expose fee schedule data (not just transaction fees) in machine-readable format?** If yes, your crawling advantage erodes for covered institutions. If only transaction data, your crawled disclosed fees remain uniquely valuable.

5. **Who is the buyer for "disclosed vs. actual" fee comparison?** Consumers don't pay. Banks might pay for competitive intelligence. Regulators have slow procurement.

6. **What are CSI's marketplace vendor requirements?** Technical standards, timeline, cost, insurance requirements. Don't invest engineering before validating.

---

## Part 10: Recommended Action Plan

### Week 1: Research and Validation (no code)

- [ ] Sign up for Plaid and MX developer sandbox accounts
- [ ] Test whether transaction data includes fee categorization at needed granularity
- [ ] Read CFPB Section 1033 final rule technical standards for fee data requirements
- [ ] Research CSI marketplace vendor onboarding requirements (contact partnership team)
- [ ] Competitive analysis: do Plaid, MX, or Yodlee already offer fee intelligence products?

### Week 2: Decision Point

- [ ] **Make the primary path decision**: Product (Path A) vs. Career (Path B) vs. Consulting (Path C)
- [ ] If product: prioritize content platform (`feat-content-platform-strategy.md`) first as Phase 1
- [ ] If career: build a focused Plaid sandbox PoC (1-2 week sprint)
- [ ] If consulting: package existing fee data into a compliance assessment offering

### Week 3+: Execute

- [ ] Regardless of path: make Bank Fee Index publicly accessible (content platform Phase 1)
- [ ] Build Open Banking PoC integrating Plaid sandbox with existing fee taxonomy
- [ ] If pursuing CSI: only after confirming marketplace requirements

### The "And" Strategy (Recommended)

These paths are not mutually exclusive. The optimal sequence:

1. **Ship content platform Phase 1** (uses existing data, creates public-facing product)
2. **Build Plaid sandbox PoC** (adds "disclosed vs. actual" comparison, proves Open Banking thesis)
3. **Use both as portfolio** (whether pitching to employers, investors, or bank partners)
4. **Pursue CSI marketplace** only after validating demand with direct bank sales

---

## Sources

### CSI
- [CSI Open Banking Platform](https://www.csiweb.com/how-we-help/core-banking-software/open-banking/)
- [CSI Open Banking vs BaaS](https://www.csiweb.com/what-to-know/content-hub/blog/open-banking-and-banking-as-a-service-whats-the-difference/)
- [CSI Developer Portal Launch](https://www.csiweb.com/who-we-are/csi-newsroom/csi-launches-expanded-developer-portal-fortifies-focus-on-community-bank-partnerships-and-fintech-integrations/)
- [CSI Completes Apiture Acquisition](https://www.csiweb.com/who-we-are/csi-newsroom/csi-completes-acquisition-of-digital-banking-provider-apiture/)
- [CSI NuPoint #2 Core Platform](https://www.csiweb.com/who-we-are/csi-newsroom/csi-nupoint-becomes-the-no-2-most-used-core-banking-platform-in-the-us-per-fedfis/)
- [CSI 2026 Banking Priorities](https://www.csiweb.com/what-to-know/content-hub/blog/2026s-industry-outlook-community-banks/)
- [CSI BaaS Capabilities](https://www.businesswire.com/news/home/20230208005299/en/CSIs-Banking-as-a-Service-Capabilities-Facilitate-New-Fintech-Partnerships)

### Regulatory
- [CFPB Personal Financial Data Rights](https://www.consumerfinance.gov/personal-financial-data-rights/)
- [Section 1033 Rule Stayed](https://www.consumerfinancialserviceslawmonitor.com/2025/07/cfpb-section-1033-open-banking-rule-stayed-as-cfpb-initiates-new-rulemaking/)
- [CFPB Enjoined](https://www.mvalaw.com/data-points/cfpb-enjoined-from-enforcing-personal-financial-data-rights-rule-1033)
- [JPMorgan Data Fees - CNBC](https://www.cnbc.com/2025/11/14/jpmorgan-chase-fintech-fees.html)
- [Bank Fees Threaten Open Banking - American Banker](https://www.americanbanker.com/opinion/bank-fees-for-data-access-threaten-the-foundations-of-open-banking)

### FDX & Standards
- [Financial Data Exchange](https://financialdataexchange.org/)
- [CFPB Recognizes FDX](https://www.consumerfinance.gov/about-us/newsroom/cfpb-approves-application-from-financial-data-exchange-to-issue-standards-for-open-banking/)
- [FDX API 6.0](https://www.financialdataexchange.org/FDX/FDX/News/Press-Releases/Financial%20Data%20Exchange%20Releases%20FDX%20API%206.0.aspx)
- [FDX - Plaid](https://plaid.com/resources/open-finance/what-is-fdx/)
- [FDX - Stripe](https://stripe.com/resources/more/what-is-the-financial-data-exchange-fdx-here-is-what-you-should-know)

### Market & Trends
- [Apiture My Data Exchange](https://www.apiture.com/apitures-my-data-exchange-empowers-banks-and-credit-unions-with-secure-seamless-data-sharing-access-for-account-holders/)
- [Plaid vs MX vs Finicity](https://www.fintegrationfs.com/post/plaid-vs-mx-vs-finicity-which-us-open-banking-api-should-you-integrate)
- [Banking Predictions 2026 - Backbase](https://www.backbase.com/banking-predictions-report-2026)
- [Fintech Trends 2026 - M2P](https://m2pfintech.com/blog/10-banking-and-fintech-trends-that-will-redefine-2026-and-beyond/)
- [Open Banking Trends - Mastercard](https://www.mastercard.com/us/en/news-and-trends/Insights/2025/Open-Banking-2025-Thoughts-Trends.html)
- [SMB Banking 2026 - nCino](https://www.ncino.com/blog/2026-growth-engine-small-business-banking)
- [FAPI 2.0 - Auth0](https://auth0.com/blog/fapi-2-0-the-future-of-api-security-for-high-stakes-customer-interactions/)

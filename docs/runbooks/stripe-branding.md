# Stripe branding runbook

Manual dashboard steps only. Nothing here is automated — the app never calls
Stripe write APIs to change product, account, or statement-descriptor
branding. Run this in **both** the test-mode and live-mode Stripe dashboards
for the Fee Insight account (they are configured independently).

## Why

Fee Insight is the site/company; Bank Fee Index is the product; Hamilton is
the Pro workspace (see `CLAUDE.md` brand rules). Stripe checkout, invoices,
receipts, and card-statement descriptors must read "Fee Insight" so
customers recognize the charge — never "Bank Fee Index" or "Hamilton."

## 1. Rename the Pro product

1. Open the [Stripe Dashboard](https://dashboard.stripe.com) → **Product
   catalog** → **Products**.
2. Toggle the mode switch (top-left) to **Test mode**; repeat this whole
   section later in **Live mode**.
3. Open the product currently backing the Pro subscription prices (the one
   whose price IDs match `STRIPE_PRICE_ID_MONTHLY` /
   `STRIPE_PRICE_ID_ANNUAL` in the environment config).
4. Click **Edit product**.
5. Set **Name** to:
   ```
   Fee Insight Pro — Seat License (Monthly/Annual)
   ```
6. Leave the existing Price IDs untouched — do not create new prices or
   archive the existing ones; renaming the product does not change price
   IDs, so no app config changes are needed.
7. Save.

## 2. Set the account's public business name

1. Go to **Settings** → **Business settings** → **Public details** (URL:
   `https://dashboard.stripe.com/settings/public`).
2. Set **Public business name** to:
   ```
   Fee Insight
   ```
3. Save. This name appears on the Stripe Checkout page header and hosted
   invoice pages.

## 3. Set the statement descriptor

1. Still under **Settings** → **Business settings**, open **Bank and card
   payments** → **Statement descriptor**
   (`https://dashboard.stripe.com/settings/public` also links to this, or
   go directly to `https://dashboard.stripe.com/settings/statement_descriptor`).
2. Set **Statement descriptor** to:
   ```
   FEE INSIGHT
   ```
   (Stripe truncates/uppercases card-network statement text; keep it at or
   under 22 characters, all caps, no special characters beyond spaces.)
3. If a separate **Shortened descriptor** field is present for card
   networks with stricter limits, set it to `FEE INSIGHT` as well.
4. Save.

## 4. Repeat in live mode

Test mode and live mode are separate Stripe environments with separate
product catalogs and business settings. Repeat steps 1–3 with the mode
toggle set to **Live mode** before this is customer-facing.

## 5. Verify

- Start a test-mode Checkout session (e.g. via `/subscribe` in a non-prod
  environment) and confirm the Checkout page header shows "Fee Insight" and
  the line item shows "Fee Insight Pro — Seat License (Monthly/Annual)".
- Confirm a test invoice/receipt email shows "Fee Insight" as the sender
  business name.
- Statement descriptor cannot be verified without a real card statement;
  Stripe's dashboard shows the configured value as confirmation instead.

## Out of scope

This task does not touch Stripe webhook config, price IDs, tax settings, or
payment methods. Do not create, archive, or modify Prices while doing this
— only the Product display name, the account's public business name, and
the statement descriptor change.

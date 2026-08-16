# DNS & Email Runbook — bankfeeindex.com / feeinsight.com

Status as measured 2026-08-15 (dig). Records live at GoDaddy for bankfeeindex.com.

**UPDATE 2026-08-15 (late evening): Fix 1 DNS steps are DONE** — SPF now
`v=spf1 include:spf.protection.outlook.com -all`, and both DKIM CNAMEs
(selector1/selector2._domainkey → …NETORGFT20495808.onmicrosoft.com) are live on
authoritative NS (verified via dig against ns69/ns70.domaincontrol.com).
**DKIM ENABLED 2026-08-16 ~00:15 — Defender shows Status: Valid, Toggle: Enabled.**
(Note: tenant required Microsoft's NEW CNAME targets `…r-v1.dkim.mail.microsoft`,
not the legacy `onmicrosoft.com` pattern — the Defender error dialog supplies the
exact values.) Email auth chain complete: SPF ✓ DKIM ✓ DMARC ✓.
Final proof (user): send test mail from hello@bankfeeindex.com to Gmail →
"Show original" → expect SPF/DKIM/DMARC all PASS.
Fix 2 (feeinsight.com alias domain) still open.

## Current state (verified)

| Record | bankfeeindex.com | feeinsight.com |
|---|---|---|
| MX | Microsoft 365 (`bankfeeindex-com.mail.protection.outlook.com`) | **none — cannot receive mail** |
| SPF | `v=spf1 include:secureserver.net -all` (GoDaddy only — M365 NOT authorized) | none |
| DKIM (selector1, M365) | **missing** | n/a |
| DMARC | `p=quarantine`, rua → onsecureserver.net | none |
| Web | 301 → feeinsight.com | live site (Vercel) |

## Why this blocks outreach

Mail is hosted on Microsoft 365, but SPF only authorizes GoDaddy servers and
DKIM is not published. With DMARC at `p=quarantine`, any email sent from
hello@bankfeeindex.com via M365/Outlook fails both SPF alignment and DKIM →
recipient filters are told to quarantine it. Cold outreach to bank CEOs would
land in spam.

## Fix 1 — make hello@bankfeeindex.com deliverable (do before ANY outreach)

1. **SPF**: change the TXT record on bankfeeindex.com to
   `v=spf1 include:spf.protection.outlook.com -all`
   (add ` include:secureserver.net` back only if something still sends via GoDaddy).
2. **DKIM**: In Microsoft 365 Defender portal → Email authentication → DKIM →
   bankfeeindex.com → enable. It will give two CNAMEs to add:
   `selector1._domainkey` and `selector2._domainkey` → add both, then click Enable.
3. **DMARC**: keep `p=quarantine`; optionally point `rua=` at a mailbox you read.
4. **Verify**: send a test to a Gmail account → open "Show original" → confirm
   SPF=pass, DKIM=pass, DMARC=pass.

## Fix 2 — mail on feeinsight.com (when the Fee Insight brand goes primary)

Cheapest path: in Microsoft 365 admin, add feeinsight.com as an **alias domain**
of the existing tenant. M365 will supply MX + SPF + DKIM records to add at
feeinsight.com's DNS host. Then hello@feeinsight.com delivers to the same
mailbox as hello@bankfeeindex.com, and copy can switch addresses safely.
Until this is done, ALL public copy must keep using hello@bankfeeindex.com
(enforced in code as of 2026-08-15 — it is the only address anywhere).

## Standing decision

- Company brand: **Fee Insight** (feeinsight.com). Product: **Bank Fee Index**
  (bankfeeindex.com redirects in — correct, keep).
- Single contact address until Fix 2 lands: **hello@bankfeeindex.com**.

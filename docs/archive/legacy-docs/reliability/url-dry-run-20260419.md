# URL Re-Validation Dry-Run Report

- Generated: 2026-04-19 01:13:39 UTC
- Mode: FIX
- Elapsed: 180.3s
- URLs checked: 4726
- Alive (<400): 4685
- Soft-keep (403/429/401 — NOT rejected): 8
- Transient (timeouts / DNS / reset — NOT rejected): 6
- **Rejection candidates: 27**

## Tightened rejection rules applied

- Reject on: 404, 410, persistent 5xx (>=3 consecutive across retries)
- Never reject on: 403, 429, 401, timeouts, connection reset, DNS temp failure
- Max attempts per URL: 3 (HEAD -> GET, exponential backoff)

## Candidates grouped by reason

| Reason | Count |
|---|---:|
| `http_404` | 27 |

## Candidate URLs (CSV-compatible)

institution_name,state_code,url,http_status,failure_reason,retry_count,status_history
Armstrong Bank,OK,https://www.armstrong.bank/_/api/asset/kPYZysIC%252FTruth%2520In%2520Savings%2520Disclosure%2520-%2520Savings.pdf,404,http_404,1,404
Arrow Bank National Association,NY,https://www.arrowbank.com/pdfs/disclosures/Products%2520and%2520Services.pdf%3Fver%3D20250916,404,http_404,1,404
"Auburn Savings Bank, FSB",ME,https://auburnsavings.com/schedule-of-fees-and-charges-04-01-2019/,404,http_404,1,404
"Chain Bridge Bank, National Association",VA,https://www.chainbridgebank.com/_/api/asset/idwc9VZB%252FDisclosures%25202022.pdf,404,http_404,1,404
County National Bank,MI,https://www.cnbb.bank/Portals/0/PDFs/CNB%2520Fees%25202024.pdf%3Fver%3DkyTPELz7_jS0WVRaltMKGA%253D%253D,404,http_404,1,404
Educational Employees Federal Credit Union,CA,https://www.myeecu.org/home/fiFiles/static/documents/EECU%2520Schedule_of_Fees.pdf,404,http_404,1,404
First American Bank and Trust,LA,https://www.fabt.com/files/Service%2520Charges%2520and%2520Fees.pdf,404,http_404,1,404
First National Bank,ME,https://www.fnbalaska.com/wp-content/uploads/2026/03/Personal-Fee-Schedule-eff-04-2026.pdf,404,http_404,1,404
First National Bank in Pinckneyville,IL,https://www.fnbpville.com/documents/privacy.pdf,404,http_404,1,404
Fivepoint Federal Credit Union,TX,https://www.5pointcu.org/getmedia/9a153a84-4c71-436a-b9e0-4f1e12601332/Bus-Fee-Schedule-5-11-20.pdf,404,http_404,1,404
Frontwave Federal Credit Union,CA,https://www.frontwavecu.com/getmedia/e3f03870-3d7f-4813-bdde-ea887c8f5bce/Fronwave_Military_Visa_TIL.pdf,404,http_404,1,404
Great Southern Bank,MO,https://www.greatsouthernbank.com/assets/files/TNu05M2h/r/Personal%2BFee%2BSchedule.pdf,404,http_404,1,404
Greenville National Bank,OH,https://www.bankgnb.bank/assets/files/jBwvYqmt/2024%200810%20All%20Accounts%20ESign%20Disclosure.pdf,404,http_404,1,404
"Heritage Bank, Inc.",KY,https://www.ourheritage.bank/hubfs/Website%2520Disclosures%2520and%2520Disclaimers/Reg%2520E%2520consumer%2520disclosure%25209.12.19.pdf,404,http_404,1,404
Main Street Bank Corp.,OH,https://www.mymainstreetbank.bank/Portals/0/pdfs/Personal%2520Account%2520Combined%2520Disclosures%252004-01-2026.pdf%3Fver%3D2026-03-31-180830-977,404,http_404,1,404
Martha's Vineyard Bank,MA,https://20905720.fs1.hubspotusercontent-na1.net/hubfs/20905720/Windward%2520Bank%2520Documents/Advantage-Money-Market-TISA-DISCLOSURE.pdf,404,http_404,1,404
North Easton Savings Bank,MA,https://www.northeastonsavingsbank.com/application/files/1016/2758/1508/Fee_Schedule_7.29.21.pdf,404,http_404,1,404
Ozark Federal Credit Union,MO,https://www.ozarkfcu.com/cmsAdmin/uploads/2/rate-sheet-12-4-25.pdf,404,http_404,1,404
Premier America Federal Credit Union,CA,https://www.premieramerica.com/getmedia/aee175b6-b912-45c4-9463-0ec2f7579e05/SA20-MemberScheduleofFees.pdf,404,http_404,1,404
Queensborough National Bank & Trust Company,GA,https://www.qnbtrust.bank/Portals/0/pdfs/ConsumerBusinessDisclosurePacket_Effective2024-09-02.pdf%3Fver%3DDXPwQKYngHfKQGaNsssJZg%253D%253D,404,http_404,1,404
SSB Bank,PA,https://images.listingmanager.com/clientfiles/285/files/privacynotice_noaffil_nooptout_012121.pdf?v=1771509347,404,http_404,1,404
Sanborn Savings Bank,IA,https://www.sanbornbank.com/gotodownloadfile.php?file=10,404,http_404,1,404
"Servbank, National Association",IL,https://servbank.com/depository-fee-schedule/,404,http_404,1,404
Singing River Federal Credit Union,MS,https://www.srfcu.org/_/kcms-doc/951/85317/Website-Fee-List.pdf,404,http_404,1,404
The Focus Federal Credit Union,OK,http://www.focusok.com/fee-schedule,404,http_404,1,404
Trumark Financial Federal Credit Union,PA,https://www.trumarkonline.org/docs/default-source/pdfs/Service-fee-disclosure.pdf,404,http_404,1,404
Yakima Federal Savings and Loan Association,WA,https://www.yakimafed.com/%3Fs%3Dfees,404,http_404,1,404

## Sample soft-keep URLs (would have been rejected under old logic)

| Institution | State | Status | URL |
|---|---|---:|---|
| The Fahey Banking Company | OH | 403 | https://irp.cdn-website.com/d465fd58/files/uploaded/ScheduleofFees_-_corrected_3 |
| Great Meadow Federal Credit Union | NY | 403 | http://www.greatmeadowfcu.org/disclosures/ |
| Birmingham City Federal Credit Union | AL | 403 | https://www.bhamcu.org/fees |
| Oriental Bank | PR | 403 | https://cibng.ibanking-services.com/eAM/Credential/Index?orgId=878_221571415&FIF |
| Cedar Rapids Bank and Trust Company | IA | 403 | https://www.lpl.com/content/dam/lpl-www/documents/disclosures/lpl-financial-rela |
| UBS Bank USA | UT | 403 | https://www.ubs.com/content/dam/assets/rc/services/payments/international-paymen |
| Selfreliance Federal Credit Union | IL | 403 | https://www.selfreliance.com/pdf/Fees_and_Charges.pdf%3F1 |
| Envista Federal Credit Union | KS | 403 | https://www.lpl.com/content/dam/lpl-www/documents/disclosures/lpl-financial-rela |

# Fee Insight explainer — voice-over script

**Audience:** the buyer, not the end user. A retail/deposit executive, CFO, or
pricing lead at a community or mid-size bank deciding on a **$5,000/year**
seat. They are not shopping for a checking account — they *set* these prices.

**Runtime:** 72s · **Words:** 118 · **Pace:** ~110 wpm — slower than consumer
video on purpose. Executives are persuaded by arithmetic delivered calmly, and
the pauses are where the numbers land.

**Read:** peer-to-peer. Never salesy, never urgent. The film's job is to make
one uncomfortable gap obvious and then price the fix below the threshold where
anyone needs approval to buy it.

---

| In | Out | Line | On screen |
| --- | --- | --- | --- |
| 0:00 | 0:06 | You set forty-nine prices. Most banks benchmark three. | 49-cell grid, 3 lit |
| 0:06 | 0:12 | Price too high, and you're the outlier when the examiner asks. | Risk pole |
| 0:12 | 0:19 | Price too low, and you're giving away fee income you'll never see. | Revenue pole |
| 0:19 | 0:25 | Fee Insight shows you exactly where you sit. | Your dot in the peer cloud |
| 0:25 | 0:32 | Every fee, against the peer set you actually compete with. | Median + delta callout |
| 0:32 | 0:42 | Three dollars under median, across twelve thousand accounts, is four hundred and thirty-two thousand dollars a year. | Calculation builds |
| 0:42 | 0:47 | That's one fee. You have forty-eight more. | Total holds |
| 0:47 | 0:56 | Every figure traced to a competitor's published schedule — so it holds up in front of your board. | Full schedule vs peers |
| 0:56 | 1:03 | Board-ready the day you need it. | Report types |
| 1:03 | 1:09 | Five thousand dollars a year. Less than one analyst-week — and an analyst can't do this. | Price + anchor |
| 1:09 | 1:12 | — (silent) | Wordmark and URL |

---

## Why this script and not the last one

The previous cut opened on "the same overdraft fee costs $35 at one bank and $5
at another." That is a *consumer's* insight — interesting to someone choosing a
bank, worthless to someone setting the price. It gave the buyer nothing to
take to a budget conversation.

**The hook is now an accusation about their own practice.** "You set
forty-nine prices. Most banks benchmark three." An executive cannot dismiss
this, because they know it is true of their own shop. Discomfort earns the
next five seconds far better than a fact about the market.

**The stakes are two-sided on purpose.** Priced high is an examiner and
attrition problem; priced low is forgone revenue. Naming only one halves the
audience — some viewers are over-priced and some under-priced, and both need to
see themselves.

**The arithmetic beat is the sale.** 12,000 × $3 × 12 = $432,000 against a
$5,000 line item is an 86× return, shown rather than claimed. Everything before
it is setup; everything after is reassurance. If one beat survives editing,
this is it.

**The price is stated out loud, with an anchor.** $5,000 sounds like a
purchase. "Less than one analyst-week" reframes it as cheaper than the status
quo — because the alternative is a junior analyst manually collecting
competitor PDFs, which costs more, takes weeks, and goes stale on delivery.

**"You have forty-eight more" is the multiplier.** It stops the viewer
computing a single $432k and starts them computing a portfolio.

## Recording

Prefer a human read — a synthetic voice on a research brand undercuts the
credibility being sold. Place a mono WAV at `studio/vo/narration.wav`, then:

```bash
npm run render -- --vo vo/narration.wav
```

Caption timings live in `CAPTIONS` in `scene.html` and must stay in sync with
the table above.

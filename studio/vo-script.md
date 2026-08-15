# Fee Insight explainer — voice-over script

**Audience:** the buyer. A retail/deposit executive, CFO, or pricing lead at a
community or mid-size bank. They do not shop for fees — they set them, and once
a year they have to defend every one of them.

**Runtime:** 70s · **Words:** 116 · **Pace:** ~110 wpm — slower than consumer
video on purpose. The pauses are where the numbers land.

**Read:** peer-to-peer. Never salesy, never urgent.

---

| In | Out | Line | On screen |
| --- | --- | --- | --- |
| 0:00 | 0:04 | It's time for the annual fee review. | The whole schedule, filling the frame |
| 0:04 | 0:09 | Who's going to benchmark every fee? | Question lands over the list |
| 0:10 | 0:16 | Today that means collecting competitor schedules by hand. PDF by PDF. For weeks. | PDFs pile up, week counter climbing |
| 0:16 | 0:19 | And it's stale before you present it. | "Stale on arrival" |
| 0:20 | 0:26 | With Fee Insight, it's already done. | Clutter resolves into the standardised index |
| 0:27 | 0:32 | Every fee you charge, positioned against the peers you compete with. | Peer distribution, your position |
| 0:33 | 0:38 | Percentile. Gap to median. Risk profile. | Metric tiles populate |
| 0:39 | 0:44 | Move a price, and watch what moves with it. | Fee slides; the dot travels the axis |
| 0:44 | 0:51 | Revenue, percentile and risk — before you commit. | Tiles update live; risk flips Low → Medium |
| 0:52 | 0:56 | Then let Hamilton write it up. | Hamilton's four modes |
| 0:57 | 1:02 | Board-ready, every figure traced to a competitor's published schedule. | Peer Brief assembling |
| 1:03 | 1:08 | Your annual fee review, in an afternoon. | Close |

---

## Direction notes

**The open is a calendar event, not a market fact.** "It's time for the annual
fee review" is a sentence the buyer has heard in a real meeting, and the
follow-up — "who's going to benchmark every fee?" — is the question nobody in
that meeting wants to answer. That recognition is the hook. Earlier cuts opened
on price dispersion, which is a consumer's observation and gave the buyer
nothing.

**Never quote a count.** No "forty-nine fees," no "forty-eight more." Counts
invite arithmetic about the product instead of about the decision, and they
date the film the moment the taxonomy changes. Say "every fee" and let the
frame show the volume.

**The simulate beat is the demonstration and the proof at once.** It is the
only place the product visibly *does* something: the fee moves, the dot travels,
the percentile climbs, the risk chip flips from Low to Medium, and the revenue
figure resolves. Do not cut it short — the credibility comes from watching the
numbers respond, not from being told they would.

**Do not narrate the arithmetic.** The screen shows the calculation. The VO
says what it means. If the line and the frame say the same words, cut the line.

**No price in this cut.** The film sells the afternoon, not the invoice.
Pricing is a conversation for the page it links to, and naming a number here
would invite the viewer to evaluate cost before they have felt the problem.

**Hamilton is named, deliberately.** A named analyst that produces a cited,
board-ready brief is more concrete than "reporting features," and the four
modes — Analyze, Simulate, Report, Monitor — are the real ones.

## Recording

Prefer a human read; a synthetic voice on a research brand undercuts the
credibility being sold. Place a mono WAV at `studio/vo/narration.wav`, then:

```bash
npm run render -- --vo vo/narration.wav
```

Caption timings live in `CAPTIONS` in `scene.html`. Note that the open and the
close are **not** captioned — those lines are set as display headlines on
screen, and captioning them again just doubles the words.

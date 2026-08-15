# Fee Insight brand explainer — voice-over script

**Runtime:** 66s · **Word count:** 143 · **Pace:** ~145 wpm (measured, editorial —
not announcer). **Read:** calm, factual, unhurried. This is a research brand;
the numbers do the persuading, so the delivery should not.

Every line below is also burned into the film as a caption, so the cut works
with sound off. Caption timings live in `CAPTIONS` in `scene.html` and must
stay in sync with this script.

---

| In | Out | Line | On screen |
| --- | --- | --- | --- |
| 0:00 | 0:04 | The same overdraft fee costs thirty-five dollars at one bank, and five at another. | Two prices, same fee label |
| 0:04 | 0:07 | Both prices are public. | Prices hold |
| 0:07 | 0:11 | Both are buried in a PDF almost nobody reads. | PDFs scatter across frame |
| 0:11 | 0:15 | No two banks publish fees the same way — so almost no one ever compares them. | Clutter intensifies |
| 0:15 | 0:19 | Fee Insight is the Bank Fee Index. | Clutter resolves into rows |
| 0:19 | 0:23 | One structured record of what American banks actually charge. | Index title |
| 0:23 | 0:28 | Look up any institution and see its full fee schedule. | Institution profile |
| 0:28 | 0:33 | Every fee measured against its peers. | Peer deltas land |
| 0:33 | 0:38 | See how a single fee is priced across the entire market. | Distribution plot |
| 0:38 | 0:42 | The spread is wider than most banks think. | Median and quartiles |
| 0:42 | 0:46 | Compare any state against the rest of the country. | State cartogram |
| 0:46 | 0:50 | What you pay depends on where you bank. | Map completes |
| 0:50 | 0:55 | Turn any of it into a board-ready brief in minutes. | Report cards fan in |
| 0:55 | 0:59 | Every figure traced to the published schedule it came from. | Credibility beat |
| 0:59 | 1:03 | Consumers search free. Institutions benchmark against their peers. | Two CTAs |
| 1:03 | 1:06 | Fee Insight dot com. | Wordmark + URL |

---

## Direction notes

**The hook is the whole gamble.** Muted autoplay gives roughly two seconds. The
film opens on a concrete price gap rather than a definition, because a number
in tension is the only thing that earns the next five seconds. Do not soften
this line into "fees vary widely" — the specificity is the hook.

**Do not let the VO narrate the visuals.** Where the screen already shows a
state map, the line is about what it means ("what you pay depends on where you
bank"), not what it is ("this is a map of state medians"). Redundant narration
is the most common failure in product video.

**The credibility line at 0:55 is the close, not a footnote.** It is the only
differentiation claim in the film — the reason to trust these numbers over
anyone else's — and it earns its own beat immediately before the CTA.

**Segment the CTA.** The film serves two audiences with opposite intents.
Naming both in one line lets each viewer self-select instead of guessing.

## Recording

Prefer a human read. If synthesising, the pipeline expects a single mono WAV or
MP3 at `studio/vo/narration.wav`, timed to the table above:

```bash
npm run render -- --vo vo/narration.wav
```

The renderer muxes it as AAC and leaves the video stream untouched, so
re-rendering audio does not require re-rendering frames.

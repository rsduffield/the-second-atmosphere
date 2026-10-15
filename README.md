# THE SECOND ATMOSPHERE

A fullscreen generative colour field and sound piece by Robert Sherwood Duffield,
driven by GDELT's live record of world events.

Live: https://second-atmosphere.pages.dev

## Files

- `index.html`, `main.js` (WebGL colour field), `signal.js` (signal pipeline),
  `gdelt-adapter.js`, `audio.js` (Planetary Resonance), `debug.js` (press H), `styles.css`
- `worker/worker.js` — source of the `second-atmosphere-gdelt` Cloudflare Worker.
  Deployed separately in the Cloudflare dashboard, not by Pages.

## What drives the field

The Worker reads GDELT 2.0's 15-minute global event export and reports five signals
(50 = an ordinary 15 minutes for the world):

| Signal    | GDELT measure                                  | In the artwork                 |
|-----------|------------------------------------------------|--------------------------------|
| attention | volume of events                               | brightness                     |
| curiosity | verbal cooperation (diplomacy, meetings)       | cyan / blue fields open out    |
| hope      | material cooperation (aid, trade, releases)    | amber                          |
| fear      | conflict (material + half verbal)              | turbulence, cold violet shift  |
| wonder    | stability (mean Goldstein scale)               | rotation, blue-violet          |

## Years

Each 15-minute window opens on the present, then travels forward through the same
moment in every year from 1979, arriving at last year just as the next live update
brings the present back. The year shaping the field is shown small in the bottom left.

    0:00 present · 1979 · 1980 · … · 2025 · 15:00 next present   (48 steps of ~19 s)

- **1979–2014:** the same day, from GDELT 1.0. `tools/build_daily_history.py` reads the
  archive (several GB) and writes `history/daily/MMDD.json`; it runs as the
  *Build daily history* GitHub Action whenever it changes, or by hand from the Actions tab.
- **2015 on:** the same 15 minutes, from GDELT 2.0, via the Worker's
  `/history?at=…&year=…` route (cached 30 days).
- Every year is measured against its own ordinary (`history/daily/years.json`,
  `YEAR_BASELINES` in the Worker), because GDELT's coverage has changed so much.
- `years.js` runs the sequence; `signal.js` keeps live values separate, so moving
  between years never triggers a Global Event.
- Preview with `?years=fast` (3 s per step, looping).

## Publishing

Cloudflare Pages builds from the `main` branch of this repo — no build step,
output directory is the repository root.

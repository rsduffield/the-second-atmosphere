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

Within each 15-minute window the field leaves the present, passes through the same
15-minute moment (same date and UTC time) in every earlier year back to 2015, and
returns. The year whose data is shaping the field is shown small in the bottom left.

    0:00 present · 3:00 → 2015, 2016 … 2025 (equal shares of 11 min) · 14:00 present

- `years.js` runs the sequence; `signal.js` keeps live values separate, so moving
  between years never triggers a Global Event.
- The Worker's `/history?at=…&year=…` route reads that slot from GDELT's archive
  (cached 30 days; neighbouring slot used if the archive has a gap).
- `/calibrate?year=…` measures a year's ordinary 15 minutes; paste the result into
  `YEAR_BASELINES` in the Worker so each year is judged against its own norms.
- Preview a compressed window with `?years=fast`.

## Publishing

Cloudflare Pages builds from the `main` branch of this repo — no build step,
output directory is the repository root.

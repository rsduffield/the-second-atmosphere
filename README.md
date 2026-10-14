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

## Publishing

Cloudflare Pages builds from the `main` branch of this repo — no build step,
output directory is the repository root.

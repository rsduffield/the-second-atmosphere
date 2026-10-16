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
- Preview with `?years=fast` (about 2.7 s per step, looping).

## For the exhibition (EMAF 2027)

Everything below is switched on by a URL parameter; without them the
online piece behaves as before.

**Archive seams.** Each year's record density — how many events GDELT
holds for an ordinary day of that year, from about 1,200 in 1979 to about
177,000 in 2015 — shapes the field. Thin years break into a coarse grid with
empty cells; the grid fills as the archive grows. A line under the year
gives the count (`EVENTS_PER_DAY` in `years.js`).

**The speculative future.** After 1979 to last year the field returns to
the present, then runs through five years marked `?`: each signal's
fifteen-year trend carried forward with widening uncertainty. The field
disperses, drains of colour and closes in from the edges.

**The visitors' archive** (`visitors.js`, `add.html`). People leave one
word for today and whether the day feels heavy or light. The words become
a sixth, warm light drawn over the seams, and surface briefly in the field.
Stored by the Worker's `/archive` route in the D1 database
`second-atmosphere-visitors`. `?gallery` shows a QR code to `add.html`.
To hide a word: `UPDATE entries SET hidden = 1 WHERE id = …;`

**The physical trace** (`printer.js`, `printer/`). `?printer` sends a line
per year, and each visitor word, to a thermal receipt printer. See
`printer/README.md`.

**Spatial sound.** `?speakers=N` (3–16) gives each voice its own place in
a ring of N speakers (output 1 in front, then clockwise), folded into
stereo when the device has fewer outputs. `?speakermap` shows the ring.

**The film cut** (`film.js`). `?film` records one complete window with
its sound at 1920 × 1080 (`?film=4k`, `?film=720` for other sizes), with
an opening title and closing credits, and downloads it when done.
`&years=fast` makes a 2½-minute test; `&filmseconds=N` records only N
seconds.

A gallery machine would open, for example:

    index.html?gallery&printer&speakers=6

## Publishing

Cloudflare Pages builds from the `main` branch of this repo — no build step,
output directory is the repository root.

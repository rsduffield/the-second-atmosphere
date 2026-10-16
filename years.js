/**
 * THE SECOND ATMOSPHERE — years.js
 * ─────────────────────────────────────────────────────────────
 * The field remembers. Each 15-minute window opens on the present,
 * then travels forward through the same moment in every year from
 * 1979, arriving at last year just as the next live update brings
 * the present back. The year whose data is shaping the field is
 * shown small in the bottom left.
 *
 * One window (live data arrives at 0:00), 48 equal steps of ~19 s:
 *
 *   0:00 present (2026) · 1979 · 1980 · … · 2024 · 2025 · 15:00 next present
 *
 * Two archives:
 *   1979–2014  the same DAY (UTC date), from GDELT 1.0 — read from
 *              history/daily/MMDD.json, built by a GitHub Action
 *   2015 on    the same 15 MINUTES, from GDELT 2.0 — via the
 *              Worker's /history route
 * A year whose data is missing is passed over; the year before it
 * stays a little longer.
 *
 * Add ?years=fast to the URL to preview: 3 s per step, looping.
 *
 * Reads:  window.gdeltAdapter.fetchYear, window.planetarySignal
 * Listens: 'planetary-live' (dispatched by signal.js)
 * Public: window.yearMemory.{ state, restart() }
 */

(function () {

  const FAST = new URLSearchParams(location.search).get('years') === 'fast';

  const WINDOW_SECONDS = FAST ? 48 * 3 : 15 * 60;   // matches signal.js's update interval

  const FIRST_YEAR = 1979;
  const FIRST_15MIN_YEAR = 2015;                    // GDELT 2.0 begins
  const LABEL_FADE_MS = 1400;


  /* ── Archive density ──────────────────────────────────────
     How many events GDELT recorded on an ordinary day of each year.
     1979–2014 from GDELT 1.0 (history/daily/years.json, per day);
     2015 on from GDELT 2.0 (the Worker's YEAR_BASELINES and BASELINE,
     per 15 minutes × 96). The two archives count a little differently,
     so these are orders of magnitude, not exact comparisons.

     The record grows a hundredfold between 1979 and 2015, then thins
     again as GDELT's sources fall away. Density is placed on a log
     scale between DENSITY_FLOOR and DENSITY_FULL events a day, and
     drives the archive seams in main.js. */

  const EVENTS_PER_DAY = {
    1979: 1181, 1980: 1534, 1981: 1859, 1982: 2094, 1983: 2325, 1984: 2386,
    1985: 2707, 1986: 2951, 1987: 2991, 1988: 3233, 1989: 2952, 1990: 3088,
    1991: 4030, 1992: 2998, 1993: 3591, 1994: 4862, 1995: 4878, 1996: 7632,
    1997: 10006, 1998: 11693, 1999: 13026, 2000: 12406, 2001: 13688, 2002: 12098,
    2003: 15140, 2004: 12686, 2005: 9685, 2006: 17386, 2007: 30803, 2008: 39156,
    2009: 64287, 2010: 61650, 2011: 86306, 2012: 93727, 2013: 96336, 2014: 133056,
    2015: 177024, 2016: 170688, 2017: 153600, 2018: 172416, 2019: 176544, 2020: 139872,
    2021: 115296, 2022: 92352, 2023: 116544, 2024: 121632, 2025: 119328, 2026: 95136,
  };
  const DENSITY_FLOOR = 800;
  const DENSITY_FULL  = 180000;

  function densityOf(year) {
    const e = EVENTS_PER_DAY[year] ?? EVENTS_PER_DAY[Math.max(...Object.keys(EVENTS_PER_DAY).map(Number))];
    return Math.max(0, Math.min(1, Math.log(e / DENSITY_FLOOR) / Math.log(DENSITY_FULL / DENSITY_FLOOR)));
  }

  /* Small line under the year: how thick the record is */
  const recordLabel = document.getElementById('record-label');
  function setRecord(year) {
    const latest = Math.max(...Object.keys(EVENTS_PER_DAY).map(Number));
    const e = EVENTS_PER_DAY[year] ?? EVENTS_PER_DAY[latest];
    window.setArchiveDensity?.(densityOf(year));
    if (!recordLabel) return;
    const text = e ? `${e.toLocaleString('en-AU')} events recorded a day` : '';
    if (recordLabel.textContent === text) return;
    recordLabel.classList.add('is-changing');
    setTimeout(() => {
      recordLabel.textContent = text;
      recordLabel.classList.remove('is-changing');
    }, LABEL_FADE_MS / 2);
  }


  /* ── Year label (bottom left, above the phase label) ─────── */

  const label = document.getElementById('year-label');
  let shownText = '';

  function setLabel(text) {
    if (!label || text === shownText) return;
    shownText = text;
    label.classList.add('is-changing');
    setTimeout(() => {
      label.textContent = text;
      label.classList.remove('is-changing');
    }, LABEL_FADE_MS / 2);
  }


  /* ── State ──────────────────────────────────────────────── */

  const state = {
    slot:    '',
    liveYear: new Date().getUTCFullYear(),
    years:   new Map(),   // year → signal values, for the current slot
    timers:  [],
    phase:   'present',   // 'present' | 'past'
    showing: null,        // year currently shaping the field
  };

  function clearTimers() {
    state.timers.forEach(clearTimeout);
    state.timers = [];
  }

  function later(seconds, fn) {
    state.timers.push(setTimeout(fn, seconds * 1000));
  }


  /* ── Present ────────────────────────────────────────────── */

  function showPresent() {
    state.phase = 'present';
    state.showing = state.liveYear;
    window.planetarySignal?.showLive();
    setLabel(String(state.liveYear));
    setRecord(state.liveYear);
  }


  /* ── Past ───────────────────────────────────────────────── */

  function showPast(year) {
    const values = state.years.get(year);
    if (!values) return false;
    state.phase = 'past';
    state.showing = year;
    window.planetarySignal?.showYear(values, String(year));
    setLabel(String(year));
    setRecord(year);
    return true;
  }

  /* 1979–2014: one small file holds this date for every year */
  async function loadDailyYears(slot) {
    try {
      const res = await fetch(`history/daily/${slot.slice(4, 8)}.json`,
                              { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const days = await res.json();
      if (slot !== state.slot) return;
      for (const [year, v] of Object.entries(days)) {
        const y = parseInt(year, 10);
        if (y >= FIRST_YEAR && y < FIRST_15MIN_YEAR) {
          state.years.set(y, { attention: v[0], curiosity: v[1], hope: v[2], fear: v[3], wonder: v[4] });
        }
      }
    } catch (err) {
      console.warn('[years] daily history unavailable:', err.message);
    }
  }

  /* 2015 on: one at a time from the Worker (gentle; usually edge-cached).
     They aren't needed until about two thirds of the way through. */
  async function loadRecentYears(slot) {
    for (let y = FIRST_15MIN_YEAR; y < state.liveYear; y++) {
      if (slot !== state.slot) return;           // a newer window began
      const data = await window.gdeltAdapter?.fetchYear(slot, y);
      if (data && slot === state.slot) state.years.set(y, data.signal);
    }
  }

  /* The present, then every year from 1979 in equal turns, filling the
     window. A year whose data hasn't arrived by its turn is passed over,
     and the year before it stays a little longer. */
  function scheduleJourney() {
    const count = state.liveYear - FIRST_YEAR;
    if (count <= 0) return;

    const each = WINDOW_SECONDS / (count + 1);
    for (let i = 0; i < count; i++) {
      later((i + 1) * each, () => showPast(FIRST_YEAR + i));
    }
    // The next live update normally arrives right on time and takes over.
    // If it's late, return to the present rather than linger in the past;
    // in preview mode, start the journey again.
    later(WINDOW_SECONDS + (FAST ? 0 : 45), () => {
      if (FAST) startWindow(state.slot, true);
      else showPresent();
    });
  }


  /* ── Window ─────────────────────────────────────────────── */

  function startWindow(slot, keepYears = false) {
    clearTimers();
    const sameSlot = keepYears && slot === state.slot;
    state.slot = slot || '';
    if (!sameSlot) state.years = new Map();
    if (state.slot) state.liveYear = parseInt(state.slot.slice(0, 4), 10);

    showPresent();
    if (!state.slot) return;                      // simulated data: no archive to visit

    if (!sameSlot) {
      loadDailyYears(state.slot);
      loadRecentYears(state.slot);
    }
    scheduleJourney();
  }

  window.addEventListener('planetary-live', (e) => {
    // The adapter can hand back the same slot twice; don't restart for it
    if (e.detail.slot && e.detail.slot === state.slot) return;
    startWindow(e.detail.slot);
  });

  setLabel(String(state.liveYear));
  setRecord(state.liveYear);


  /* ── Public ─────────────────────────────────────────────── */

  window.yearMemory = {
    get state() {
      return { slot: state.slot, phase: state.phase, showing: state.showing,
               loaded: [...state.years.keys()].sort((a, b) => a - b),
               stepSeconds: WINDOW_SECONDS / (state.liveYear - FIRST_YEAR + 1) };
    },
    restart() { startWindow(state.slot); },
    density: densityOf,
    eventsPerDay: EVENTS_PER_DAY,
  };

})();

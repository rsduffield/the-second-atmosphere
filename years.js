/**
 * THE SECOND ATMOSPHERE — years.js
 * ─────────────────────────────────────────────────────────────
 * The field remembers. Within each 15-minute window it leaves the
 * present, passes through the same 15-minute moment in every
 * earlier year back to 2015 (the start of GDELT 2.0's archive),
 * and returns. The year whose data is shaping the field is shown
 * small in the bottom left.
 *
 * One window (live data arrives at 0:00):
 *
 *   0:00 ── present ──┐ 3:00 ── 2015 · 2016 · … · 2025 ── 14:00 ── present ── 15:00
 *                     └── each year gets an equal share of 11 minutes
 *
 * Years are the same month, day and time of day (UTC) as the live
 * export. A year whose archive file can't be read is simply left
 * out of that window.
 *
 * Add ?years=fast to the URL to preview a compressed window
 * (10 s present, 6 s per year).
 *
 * Reads:  window.gdeltAdapter.fetchYear, window.planetarySignal
 * Listens: 'planetary-live' (dispatched by signal.js)
 * Public: window.yearMemory.{ state, restart() }
 */

(function () {

  const FAST = new URLSearchParams(location.search).get('years') === 'fast';

  const CONFIG = FAST
    ? { presentOpen: 10, journey: 66, presentClose: 10 }
    : { presentOpen: 180, journey: 660, presentClose: 60 };   // seconds, total 15 min

  const FIRST_YEAR = 2015;
  const LABEL_FADE_MS = 1400;


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
  }


  /* ── Past ───────────────────────────────────────────────── */

  function showPast(year) {
    const values = state.years.get(year);
    if (!values) return false;
    state.phase = 'past';
    state.showing = year;
    window.planetarySignal?.showYear(values, String(year));
    setLabel(String(year));
    return true;
  }

  /* Load each earlier year one after another (gentle on the Worker;
     usually edge-cached). They land well within the opening present. */
  async function loadYears(slot) {
    for (let y = FIRST_YEAR; y < state.liveYear; y++) {
      if (slot !== state.slot) return;           // a newer window began
      const data = await window.gdeltAdapter?.fetchYear(slot, y);
      if (data && slot === state.slot) state.years.set(y, data.signal);
    }
  }

  /* Every earlier year gets a fixed turn. A year whose data hasn't
     arrived by its turn (or never will) is passed over, and the year
     before it simply stays a little longer. */
  function beginJourney() {
    const count = state.liveYear - FIRST_YEAR;
    if (count <= 0) return;

    const each = CONFIG.journey / count;
    for (let i = 0; i < count; i++) {
      later(i * each, () => showPast(FIRST_YEAR + i));
    }
    later(CONFIG.journey, showPresent);
  }


  /* ── Window ─────────────────────────────────────────────── */

  function startWindow(slot) {
    clearTimers();
    state.slot = slot || '';
    state.years = new Map();
    if (state.slot) state.liveYear = parseInt(state.slot.slice(0, 4), 10);

    showPresent();
    if (!state.slot) return;                      // simulated data: no archive to visit

    loadYears(state.slot);
    later(CONFIG.presentOpen, beginJourney);
  }

  window.addEventListener('planetary-live', (e) => {
    // The adapter can hand back the same slot twice; don't restart for it
    if (e.detail.slot && e.detail.slot === state.slot) return;
    startWindow(e.detail.slot);
  });

  setLabel(String(state.liveYear));


  /* ── Public ─────────────────────────────────────────────── */

  window.yearMemory = {
    get state() {
      return { slot: state.slot, phase: state.phase, showing: state.showing,
               loaded: [...state.years.keys()], config: CONFIG };
    },
    restart() { startWindow(state.slot); },
  };

})();

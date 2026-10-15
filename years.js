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


  /* ── Public ─────────────────────────────────────────────── */

  window.yearMemory = {
    get state() {
      return { slot: state.slot, phase: state.phase, showing: state.showing,
               loaded: [...state.years.keys()].sort((a, b) => a - b),
               stepSeconds: WINDOW_SECONDS / (state.liveYear - FIRST_YEAR + 1) };
    },
    restart() { startWindow(state.slot); },
  };

})();

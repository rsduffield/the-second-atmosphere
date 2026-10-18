/**
 * THE SECOND ATMOSPHERE — now.js
 * ─────────────────────────────────────────────────────────────
 * Gallery only (?gallery). Tells the Worker which year is shaping
 * the field and its five values, each time the year changes and
 * once a minute besides, so the colour table can be shown on
 * visitors' phones (add.html?place=gallery) instead of on screen.
 *
 * Listens: 'field-year' (dispatched by years.js)
 * Posts:   WORKER_URL/now
 */

(function () {

  const PARAMS = new URLSearchParams(window.SA_PARAMS ?? location.search);
  if (!PARAMS.has('gallery')) return;
  if (typeof WORKER_URL !== 'string' || !WORKER_URL) return;

  const API = `${WORKER_URL}/now`;
  const HEARTBEAT_MS = 60 * 1000;
  let last = null;

  async function report() {
    if (!last) return;
    try {
      await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(last),
        signal: AbortSignal.timeout(10000),
      });
    } catch { /* the next change or heartbeat will try again */ }
  }

  window.addEventListener('field-year', (e) => {
    const d = e.detail || {};
    if (!d.values) return;
    last = {
      year: d.year,
      phase: d.phase,
      values: {
        attention: d.values.attention,
        curiosity: d.values.curiosity,
        fear:      d.values.fear,
        hope:      d.values.hope,
        wonder:    d.values.wonder,
      },
      eventsPerDay: d.eventsPerDay ?? null,
    };
    report();
  });

  setInterval(report, HEARTBEAT_MS);

})();

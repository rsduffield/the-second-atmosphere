/**
 * THE SECOND ATMOSPHERE — printer.js
 * ─────────────────────────────────────────────────────────────
 * The physical trace. In the gallery a small thermal receipt
 * printer prints one line for every year the field passes through,
 * and a line for every word the visitors leave. Over five weeks the
 * paper piles up on the floor: an archive you can touch, made by a
 * work about archives.
 *
 * Off unless the page is opened with ?printer. This file only sends
 * each line to the print server (printer/print_server.py), which
 * owns the layout and the printer itself:
 *
 *   ?printer                      → http://localhost:8787
 *   ?printer=http://10.0.0.5:8787 → a print server elsewhere
 *
 * If the server is unreachable lines wait in a short queue and are
 * retried; the artwork never waits for the printer.
 *
 * Listens: 'field-year' (years.js), 'visitor-word' (visitors.js)
 * Public:  window.fieldPrinter.{ state }
 */

(function () {

  const param = new URLSearchParams(location.search).get('printer');
  if (param === null) return;

  const SERVER = (param && /^https?:\/\//.test(param) ? param : 'http://localhost:8787').replace(/\/$/, '');
  const MAX_QUEUE = 200;
  const RETRY_MS = 5000;

  const state = { server: SERVER, queued: 0, sent: 0, failed: 0, connected: null };
  const queue = [];
  let sending = false;

  function enqueue(item) {
    queue.push(item);
    if (queue.length > MAX_QUEUE) queue.shift();   // a long outage loses the oldest lines, not the newest
    state.queued = queue.length;
    pump();
  }

  async function pump() {
    if (sending || !queue.length) return;
    sending = true;
    while (queue.length) {
      try {
        const res = await fetch(`${SERVER}/line`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(queue[0]),
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        queue.shift();
        state.sent++;
        state.connected = true;
      } catch (err) {
        state.failed++;
        if (state.connected !== false) console.warn('[printer] print server unreachable:', err.message);
        state.connected = false;
        sending = false;
        setTimeout(pump, RETRY_MS);
        return;
      } finally {
        state.queued = queue.length;
      }
    }
    sending = false;
  }

  window.addEventListener('field-year', (e) => {
    const d = e.detail;
    enqueue({ kind: d.phase === 'present' ? 'present' : 'year', at: Date.now(), ...d });
  });

  window.addEventListener('visitor-word', (e) => {
    const w = e.detail;
    enqueue({ kind: 'word', at: Date.now(), word: w.word, tone: w.tone, place: w.place || 'web' });
  });

  window.fieldPrinter = { get state() { return { ...state }; } };
  console.log(`[printer] sending lines to ${SERVER}`);

})();

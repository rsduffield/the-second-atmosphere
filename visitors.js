/**
 * THE SECOND ATMOSPHERE — visitors.js
 * ─────────────────────────────────────────────────────────────
 * The visitors' archive. A second archive running beside GDELT's:
 * kept by people rather than read by machines. Anyone can leave
 * one word for today and say whether the day feels heavy or light
 * (add.html). The words accumulate across the exhibition and become
 * the field's sixth light — warm lamplight, outside the five
 * digital primaries, and drawn over the archive seams rather than
 * broken by them.
 *
 *   strength  grows with the number of words (log scale; full at
 *             FULL_AT words, so it builds across the five weeks)
 *   tone      average of the last 60 words, heavy (0) → light (1)
 *   flash     a new word flares the light and appears, faintly,
 *             in the field for a few seconds
 *
 * Storage: the Worker's /archive route (D1). If the route isn't
 * deployed yet, words are kept in this browser only (preview).
 *
 * Modes:
 *   ?gallery    shows a QR code (bottom right) to add.html?place=gallery
 *   otherwise   a small "Leave a word" link
 *
 * Public: window.visitorArchive.{ state, refresh(), simulate(n, tone) }
 */

(function () {

  const API = (typeof WORKER_URL === 'string' && WORKER_URL) ? `${WORKER_URL}/archive` : null;
  const PARAMS = new URLSearchParams(window.SA_PARAMS ?? location.search);
  const GALLERY = PARAMS.has('gallery');

  // The film is the machines' archive alone; the visitors' archive
  // belongs to the room.
  if (PARAMS.has('film')) return;

  const POLL_MS = 20 * 1000;
  const FULL_AT = 1500;              // words for full strength
  const WORD_SHOW_MS = 9000;
  const LOCAL_KEY = 'second-atmosphere:visitor-words';

  const state = {
    count: 0,
    tone: 50,
    recent: [],
    source: 'initialising',          // 'worker' | 'local'
    lastSeenAt: 0,
  };

  /* ── Field ──────────────────────────────────────────────── */

  let strengthTarget = 0, toneTarget = 0.5, flash = 0;

  function strengthOf(count) {
    if (count <= 0) return 0;
    return Math.min(1, 0.12 + 0.88 * Math.log(1 + count) / Math.log(1 + FULL_AT));
  }

  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(now - last, 50); last = now;
    const u = window.fieldUniforms;
    if (!u) return;
    const k = Math.min(1, dt * 0.0008);
    u.u_visitors.value    += (strengthTarget - u.u_visitors.value) * k;
    u.u_visitorTone.value += (toneTarget - u.u_visitorTone.value) * k;
    flash = Math.max(0, flash - dt / 7000);
    u.u_visitorFlash.value = flash * flash;
  }
  requestAnimationFrame(frame);


  /* ── Overlay: newest word + count ───────────────────────── */

  const wordEl = document.createElement('div');
  wordEl.className = 'visitor-word';
  wordEl.setAttribute('aria-live', 'polite');
  document.body.appendChild(wordEl);

  const corner = document.createElement('aside');
  corner.className = 'visitor-corner ui-overlay';
  corner.innerHTML = `
    <div class="visitor-qr" hidden></div>
    <a class="visitor-link" href="add.html" target="_blank" rel="noopener">Leave a word</a>
    <span class="visitor-count"></span>`;
  document.body.appendChild(corner);
  const countEl = corner.querySelector('.visitor-count');

  if (GALLERY && window.qrcode) {
    const target = new URL('add.html?place=gallery', location.href).href;
    const qr = window.qrcode(0, 'M');
    qr.addData(target);
    qr.make();
    const box = corner.querySelector('.visitor-qr');
    box.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    box.hidden = false;
    corner.querySelector('.visitor-link').textContent = 'Scan to see the colours and leave a word';
    corner.classList.add('is-gallery');
    // The colour table is on visitors' phones in the gallery, not on screen
    document.querySelectorAll('header .hint').forEach((h) => {
      h.textContent = 'Scan the code, bottom right, for the colour table';
    });
  }

  let wordTimer = null;
  function showWord(entry) {
    wordEl.textContent = entry.word;
    wordEl.style.setProperty('--x', `${18 + Math.random() * 64}%`);
    wordEl.style.setProperty('--y', `${22 + Math.random() * 52}%`);
    wordEl.classList.remove('is-showing');
    void wordEl.offsetWidth;
    wordEl.classList.add('is-showing');
    clearTimeout(wordTimer);
    wordTimer = setTimeout(() => wordEl.classList.remove('is-showing'), WORD_SHOW_MS);
    flash = 1;
  }

  function render() {
    strengthTarget = strengthOf(state.count);
    toneTarget = state.tone / 100;
    countEl.textContent = state.count
      ? `The visitors’ archive · ${state.count.toLocaleString('en-AU')} ${state.count === 1 ? 'word' : 'words'}`
      : 'The visitors’ archive is empty';
  }


  /* ── Data ───────────────────────────────────────────────── */

  function readLocal() {
    try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); } catch { return []; }
  }

  function summarise(entries) {
    const last60 = entries.slice(-60);
    return {
      count: entries.length,
      tone: last60.length ? Math.round(last60.reduce((a, e) => a + e.tone, 0) / last60.length) : 50,
      recent: entries.slice(-24).reverse(),
    };
  }

  async function refresh() {
    let data = null;
    if (API) {
      try {
        const res = await fetch(API, { signal: AbortSignal.timeout(10000) });
        if (res.ok) { data = await res.json(); state.source = 'worker'; }
      } catch { /* fall through to local */ }
    }
    if (!data || typeof data.count !== 'number') {
      data = summarise(readLocal());
      state.source = 'local';
    }

    const newest = data.recent?.[0];
    const isNew = newest && newest.at > state.lastSeenAt;
    const firstLoad = state.lastSeenAt === 0;
    state.count = data.count;
    state.tone = data.tone;
    state.recent = data.recent || [];
    if (newest) state.lastSeenAt = Math.max(state.lastSeenAt, newest.at);
    render();
    if (isNew && !firstLoad) {
      showWord(newest);
      window.dispatchEvent(new CustomEvent('visitor-word', { detail: { ...newest } }));
    }
  }

  // add.html in another tab of this browser (preview, local mode)
  window.addEventListener('storage', (e) => { if (e.key === LOCAL_KEY) refresh(); });

  render();
  refresh();
  setInterval(refresh, POLL_MS);


  /* ── Public ─────────────────────────────────────────────── */

  window.visitorArchive = {
    get state() { return { ...state, strength: strengthTarget }; },
    refresh,
    // For previews: pretend n words have been left, at this tone.
    simulate(n = 300, tone = 50, word = 'listening') {
      state.count = n; state.tone = tone; render();
      showWord({ word, tone, at: Date.now() });
    },
  };

})();

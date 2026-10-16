/**
 * THE SECOND ATMOSPHERE — debug.js
 * Debug overlay — press H, or tap the table button beside the
 * speaker icon, to show/hide. In the gallery (?gallery) there is no
 * button: visitors see the colour table on their phones instead
 * (add.html, via the QR code), and H still works for installing.
 * Displays Planetary Signal values and current mode.
 * Redesigned to match the reference UI aesthetic.
 */

(function () {
  'use strict';

  const overlay = document.createElement('div');
  overlay.id = 'debug-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  document.body.appendChild(overlay);

  let visible = false;
  let rafId   = null;

  // A button beside the speaker icon does what H does, for phones and
  // tablets (and anyone who'd rather tap or click).
  const btn = document.createElement('button');
  btn.id = 'table-toggle';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Show the colour table');
  btn.setAttribute('aria-pressed', 'false');
  btn.title = 'Colour table (H)';
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true">
      <line x1="5" y1="7"  x2="19" y2="7"/>
      <line x1="5" y1="12" x2="15" y2="12"/>
      <line x1="5" y1="17" x2="11" y2="17"/>
    </svg>`;
  const GALLERY = new URLSearchParams(window.SA_PARAMS ?? location.search).has('gallery');
  if (!GALLERY) document.body.appendChild(btn);

  function toggle() {
    visible = !visible;
    overlay.style.display = visible ? 'block' : 'none';
    btn.classList.toggle('is-active', visible);
    btn.setAttribute('aria-pressed', String(visible));
    btn.setAttribute('aria-label', visible ? 'Hide the colour table' : 'Show the colour table');
    if (visible && !rafId) startRendering();
  }

  btn.addEventListener('click', toggle);

  document.addEventListener('keydown', e => {
    if (e.target.closest?.('input, textarea')) return;
    if (e.key === 'h' || e.key === 'H') toggle();
  });

  const SIGNALS = ['attention', 'curiosity', 'fear', 'hope', 'wonder'];

  // Display names: the internal keys predate the GDELT remapping
  // (see README). The overlay shows what each signal now measures.
  const LABELS = {
    attention: 'event volume',
    curiosity: 'diplomacy',
    fear:      'conflict',
    hope:      'aid & trade',
    wonder:    'stability',
  };

  // Dot colours matching the five chromatic primaries
  const DOT_COLORS = {
    attention: '#ff00cc',  // magenta
    curiosity: '#ffe800',  // yellow
    fear:      '#ff0a00',  // red
    hope:      '#00e64d',  // green
    wonder:    '#0038ff',  // blue
  };

  // Bar fill colours
  const BAR_FILL = {
    attention: '#ff00cc',
    curiosity: '#ffe800',
    fear:      '#ff1400',
    hope:      '#00e64d',
    wonder:    '#0038ff',
  };

  function formatVal(v) {
    return v.toFixed(1).padStart(5);
  }

  function buildBar(value, color, width = 120) {
    const filled = Math.round((value / 100) * width);
    return `
      <div class="dbg-bar-track">
        <div class="dbg-bar-fill" style="width:${filled}px; background:${color}"></div>
      </div>
    `;
  }

  function buildHTML(sig) {
    const meta        = sig.meta || {};
    const source      = meta.source       || 'initialising';
    const articleCount= meta.articleCount || 0;
    const fetchedAt   = meta.fetchedAt    || 0;
    const mode        = meta.mode         || 'background';
    const eventLabel  = meta.eventLabel   || '';

    const secsAgo    = fetchedAt ? Math.round((Date.now() - fetchedAt) / 1000) : null;
    const updatedStr = secsAgo === null ? 'not yet fetched'
      : secsAgo < 60 ? `updated ${secsAgo}s ago`
      : `updated ${Math.round(secsAgo / 60)}m ago`;

    const isGdelt    = source.startsWith('gdelt');
    const sourceDot  = isGdelt ? '#a8ffb0' : source === 'injected' ? '#ffe888' : '#888899';
    const sourceText = isGdelt
      ? `gdelt live${articleCount ? ` · ${articleCount} events` : ''}`
      : source;

    const modeIsEvent = mode === 'global-event';
    const modeLabel   = modeIsEvent
      ? `⚡ ${eventLabel || 'Global Event'}`
      : null;

    let html = `
      <div class="dbg-section-label">PLANETARY SIGNAL</div>
      <div class="dbg-source-row">
        <span class="dbg-dot" style="background:${sourceDot}"></span>
        <span class="dbg-source-text">${sourceText}</span>
      </div>
      <div class="dbg-updated">${updatedStr}</div>
    `;

    if (modeIsEvent) {
      html += `<div class="dbg-event-label">${modeLabel}</div>`;
    }

    html += `<div class="dbg-divider"></div>`;
    html += `<div class="dbg-section-label">WORLD EVENTS</div>`;

    for (const key of SIGNALS) {
      const cur   = sig.current[key];
      const tgt   = sig.target[key];
      const dot   = DOT_COLORS[key];
      const fill  = BAR_FILL[key];

      html += `
        <div class="dbg-signal-row">
          <span class="dbg-dot" style="background:${dot}"></span>
          <span class="dbg-signal-name">${LABELS[key]}</span>
          ${buildBar(cur, fill)}
          <span class="dbg-signal-val">${formatVal(cur)}</span>
          <span class="dbg-signal-tgt">→ ${formatVal(tgt)}</span>
        </div>
      `;
    }

    html += `<div class="dbg-divider"></div>`;
    html += `<div class="dbg-hint">H or the table button · hide</div>`;

    if (window.gdeltAdapter && !window.gdeltAdapter.configured) {
      html += `<div class="dbg-warn">GDELT not configured — set WORKER_URL in gdelt-adapter.js</div>`;
    }

    return html;
  }

  function render() {
    if (!visible) { rafId = null; return; }
    const sig = window.planetarySignal;
    if (sig) overlay.innerHTML = buildHTML(sig);
    rafId = requestAnimationFrame(render);
  }

  function startRendering() {
    if (!rafId) rafId = requestAnimationFrame(render);
  }

})();

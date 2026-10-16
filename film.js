/**
 * THE SECOND ATMOSPHERE — film.js
 * ─────────────────────────────────────────────────────────────
 * The film cut: one complete fifteen-minute window, recorded as a
 * single-channel video with its sound — present, 1979 to last year,
 * the present again, five uncertain years — for the festival's
 * Film section.
 *
 * Open the page with ?film (add &years=fast for a 2½-minute test).
 * The frame is fixed at 1920 × 1080; ?film=4k records 3840 × 2160,
 * ?film=720 records 1280 × 720. Press Begin: the sound starts,
 * the live data is refreshed so the journey runs uninterrupted, and
 * the field, the year captions and the sound are recorded together.
 * When the window ends the file downloads by itself:
 * the-second-atmosphere_YYYYMMDD-HHMM.mp4 (or .webm where the browser
 * can't write MP4).
 *
 * Recording happens in real time, so keep the tab in front, the
 * computer awake and on mains power, and close other heavy apps.
 * Chrome on a machine with a real graphics card gives the best result.
 *
 * Reads: window.yearMemory, window.planetaryAudio, window.planetarySignal
 * Uses:  window.onFieldFrame (called by main.js after every frame)
 */

(function () {

  const PARAMS = new URLSearchParams(window.SA_PARAMS ?? location.search);
  if (!PARAMS.has('film')) return;

  const W = window.FILM_SIZE?.w || 1920, H = window.FILM_SIZE?.h || 1080;
  const S = H / 1080;                      // captions are laid out at 1080 and scaled
  const FPS = 30;
  const TITLE_SECONDS = 9;
  const END_SECONDS = 10;
  const FIRST_YEAR = 1979, FUTURE_YEARS = 5;

  document.body.classList.add('film-mode');

  /* ── Compositor: the field plus captions, drawn each frame ── */

  // What is shown is exactly what is recorded
  const comp = document.createElement('canvas');
  comp.className = 'film-frame';
  comp.width = W; comp.height = H;
  document.body.appendChild(comp);
  const g = comp.getContext('2d');

  const yearEl = document.getElementById('year-label');
  const recordEl = document.getElementById('record-label');

  const film = {
    state: 'ready',      // 'ready' | 'preview' | 'recording' | 'ending' | 'done'
    startedAt: 0,
    windowSeconds: 0,
    recordedAt: null,
  };

  // Captions fade as the page's labels do
  const fade = { year: 0, record: 0 };
  function captionAlpha(el, key) {
    const target = el && el.textContent && !el.classList.contains('is-changing') ? 1 : 0;
    fade[key] += (target - fade[key]) * 0.08;
    return fade[key];
  }

  function serif(px, italic = false, weight = 300) {
    return `${italic ? 'italic ' : ''}${weight} ${px * S}px "Cormorant Garamond", Georgia, serif`;
  }

  function spaced(text, x, y, spacing) {
    if ('letterSpacing' in g) { g.letterSpacing = `${spacing * S}px`; g.fillText(text, x, y); g.letterSpacing = '0px'; }
    else g.fillText(text, x, y);
  }

  function smooth(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }

  function drawFrame(glCanvas) {
    g.globalAlpha = 1;
    g.drawImage(glCanvas, 0, 0, W, H);

    const t = film.startedAt ? (performance.now() - film.startedAt) / 1000 : 0;
    const live = film.state === 'recording' || film.state === 'ending' || film.state === 'preview';

    // Year and record captions, bottom left, as on the page
    g.textBaseline = 'alphabetic';
    g.textAlign = 'left';
    g.shadowColor = 'rgba(0,0,0,0.7)';
    g.shadowBlur = 18 * S;
    const ya = captionAlpha(yearEl, 'year') * (live ? smooth((t - TITLE_SECONDS + 2) / 2) : 1);
    if (ya > 0.01) {
      g.globalAlpha = ya * 0.66;
      g.fillStyle = '#ffffff';
      g.font = serif(34);
      spaced(yearEl.textContent, 112 * S, 966 * S, 11);
    }
    const ra = captionAlpha(recordEl, 'record') * (live ? smooth((t - TITLE_SECONDS + 2) / 2) : 1);
    if (ra > 0.01) {
      g.globalAlpha = ra * 0.45;
      g.font = serif(24, true);
      spaced(recordEl.textContent, 112 * S, 1004 * S, 2);
    }

    // Opening title over the first seconds of the present
    if (live && t < TITLE_SECONDS) {
      const a = smooth(t / 2.5) * (1 - smooth((t - (TITLE_SECONDS - 3)) / 3));
      g.globalAlpha = a * 0.92;
      g.textAlign = 'center';
      g.font = serif(76);
      spaced('THE SECOND ATMOSPHERE', W / 2, H / 2 - 6 * S, 15);
      g.globalAlpha = a * 0.6;
      g.font = serif(30, true);
      spaced('Robert Sherwood Duffield', W / 2, H / 2 + 56 * S, 2);
    }

    // End: credits over a fade to black
    if (film.state === 'ending' || film.state === 'done') {
      const e = (performance.now() - film.endingAt) / 1000;
      g.shadowBlur = 0;
      g.globalAlpha = smooth(e / 4) * 0.94;
      g.fillStyle = '#000';
      g.fillRect(0, 0, W, H);
      const a = smooth((e - 1.5) / 2) * (1 - smooth((e - (END_SECONDS - 2)) / 2));
      g.globalAlpha = a * 0.8;
      g.fillStyle = '#fff';
      g.textAlign = 'center';
      g.font = serif(44);
      spaced('THE SECOND ATMOSPHERE', W / 2, H / 2 - 70 * S, 9);
      g.globalAlpha = a * 0.55;
      g.font = serif(26, true);
      const when = film.recordedAt;
      const lines = [
        `The same moment in every year from ${FIRST_YEAR}, then five years that have not happened.`,
        'Data: the GDELT Project event archive, 1979 onward.',
        when ? `Recorded ${when.toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC` : '',
      ];
      lines.forEach((line, i) => spaced(line, W / 2, H / 2 + i * 42 * S, 1));
      g.globalAlpha = 1;
      g.fillStyle = '#000';
      g.globalAlpha = smooth((e - (END_SECONDS - 1.5)) / 1.5);
      g.fillRect(0, 0, W, H);
    }

    g.globalAlpha = 1;
    g.shadowBlur = 0;
  }

  window.onFieldFrame = drawFrame;


  /* ── Panel ──────────────────────────────────────────────── */

  const panel = document.createElement('div');
  panel.className = 'film-panel';
  panel.innerHTML = `
    <h2>The film</h2>
    <p>Records one complete window — the present, every year from ${FIRST_YEAR}, the present again,
       and five years that have not happened — at ${W} × ${H}, with its sound.</p>
    <p class="film-length"></p>
    <p class="film-note">Recording runs in real time. Keep this tab in front and the computer awake.</p>
    <div class="film-actions">
      <button type="button" data-act="record">Begin recording</button>
      <button type="button" data-act="preview">Preview only</button>
    </div>
    <p class="film-status" role="status"></p>`;
  document.body.appendChild(panel);
  const status = panel.querySelector('.film-status');
  const lengthEl = panel.querySelector('.film-length');

  function windowSeconds() {
    const st = window.yearMemory?.state;
    const liveYear = parseInt((st?.slot || '').slice(0, 4), 10) || new Date().getUTCFullYear();
    const steps = 1 + (liveYear - FIRST_YEAR) + 1 + FUTURE_YEARS;
    return (st?.stepSeconds || 15 * 60 / steps) * steps;
  }

  function showLength() {
    const s = windowSeconds() + END_SECONDS;
    lengthEl.textContent = `Length: ${Math.floor(s / 60)} min ${Math.round(s % 60)} s.`;
  }
  showLength();
  setTimeout(showLength, 3000);

  function pickType() {
    const types = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    return types.find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
  }

  let recorder = null, chunks = [];

  async function begin(record) {
    panel.classList.add('is-busy');
    status.textContent = 'Fetching the latest data…';
    window.planetaryAudio?.start();

    // A fresh live update now means the next one falls just as the window ends
    try { await window.planetarySignal?.forceUpdate(); } catch { /* simulated data still runs */ }
    await new Promise(r => setTimeout(r, 1500));

    // ?filmseconds=N records only the first N seconds (for testing)
    const limit = parseFloat(PARAMS.get('filmseconds'));
    film.windowSeconds = limit > 0 ? Math.min(limit, windowSeconds()) : windowSeconds();
    film.recordedAt = new Date();

    if (record) {
      const type = pickType();
      if (!type) { status.textContent = 'This browser cannot record video. Try Chrome.'; panel.classList.remove('is-busy'); return; }
      const stream = comp.captureStream(FPS);
      try {
        const audio = window.planetaryAudio?.tap();
        audio?.getAudioTracks().forEach(tr => stream.addTrack(tr));
      } catch (err) { console.warn('[film] no sound in the recording:', err.message); }
      recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: Math.round(20_000_000 * (W * H) / (1920 * 1080)), audioBitsPerSecond: 256_000 });
      chunks = [];
      recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      recorder.onstop = () => save(type);
      recorder.start(1000);
    }

    window.yearMemory?.restart();
    film.startedAt = performance.now();
    film.state = record ? 'recording' : 'preview';
    panel.classList.add('is-hidden');
    document.body.classList.add('film-running');

    setTimeout(() => {
      film.state = 'ending';
      film.endingAt = performance.now();
      setTimeout(() => {
        film.state = 'done';
        if (recorder && recorder.state !== 'inactive') recorder.stop();
        else finish('Preview finished.');
      }, END_SECONDS * 1000);
    }, film.windowSeconds * 1000);
  }

  function save(type) {
    const blob = new Blob(chunks, { type });
    const ext = type.startsWith('video/mp4') ? 'mp4' : 'webm';
    const d = film.recordedAt;
    const stamp = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}-${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `the-second-atmosphere_${stamp}.${ext}`;
    document.body.appendChild(a);
    a.click();
    finish(`Saved ${a.download} (${(blob.size / 1e6).toFixed(0)} MB).`);
    window.filmResult = { name: a.download, size: blob.size, type };
  }

  function finish(text) {
    document.body.classList.remove('film-running');
    panel.classList.remove('is-hidden', 'is-busy');
    status.textContent = text;
  }

  panel.addEventListener('click', (e) => {
    const act = e.target.closest('button')?.dataset.act;
    if (act === 'record') begin(true);
    if (act === 'preview') begin(false);
  });

  window.filmCut = { get state() { return { ...film }; }, frame: comp };

})();

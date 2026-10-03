/**
 * THE SECOND ATMOSPHERE — audio.js
 * Iteration 34: Living Sonic Ecology
 * ─────────────────────────────────────────────────────────────
 * Rewrite of the internal synthesis engine. The outer shell —
 * feature detection, the self-injected speaker icon, click
 * handling, fade in/out — is unchanged from Iteration 31 and
 * needs no further explanation; see those comments below.
 *
 * WHAT CHANGED: the previous version had four fixed voices, each
 * a handful of oscillators with independently automated gain and
 * filter parameters. It behaved as a drone because nothing about
 * the RELATIONSHIPS between oscillators ever changed — only their
 * loudness and brightness did.
 *
 * This version is organised around one idea: sound comes from
 * relationships, not sources. Twelve resonant voices (roughly
 * three per colour, matching the cloud's five-colour chromatic
 * system) are governed by a shared COHERENCE parameter — driven
 * by hope (which tightens relationships toward harmonic lock) and
 * fear (which loosens them toward drift and roughness). Individual
 * voices still have their own slow, mutually-irrational LFOs, but
 * WHERE those LFOs are allowed to wander is set by coherence, not
 * by the voice alone. This is what makes voices "approach, lock,
 * drift apart" — the brief's central request.
 *
 * Colour → Signal mapping (consistent with the visual chromatic
 * model established in main.js):
 *   BLUE     → attention   (foundation, overall presence)
 *   MAGENTA  → wonder      (wandering, spacious, threads through others)
 *   YELLOW   → curiosity   (fine shimmering filaments, appear/dissolve)
 *   GREEN    → hope        (soft filtered air, connects the whole field)
 *   RED      → fear        (latent conflict, destabilises everything)
 */

(function () {
  'use strict';

  /* ============================================================
     0. FEATURE DETECTION
     ============================================================ */

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    console.warn('[audio] Web Audio API not available — Planetary Resonance disabled.');
    return;
  }

  let ctx           = null;
  let graphBuilt     = false;
  let masterGain     = null;
  let presenceGain   = null;  // signal-driven overall presence (was "attentionGain")
  let isOn           = false;
  let graphStartTime = null;  // performance.now() at graph build — clock for JS-side envelopes


  /* ============================================================
     1. SPEAKER ICON — unchanged from Iteration 31
     ============================================================ */

  const btn = document.createElement('button');
  btn.id = 'audio-toggle';
  btn.setAttribute('aria-label', 'Toggle Planetary Resonance');
  btn.setAttribute('title', 'Planetary Resonance — click to listen');
  document.body.appendChild(btn);

  const ICON_OFF = `
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 9v6h4l5 4V5L8 9H4z"/>
      <line x1="16" y1="9" x2="21" y2="15"/>
      <line x1="21" y1="9" x2="16" y2="15"/>
    </svg>`;

  const ICON_ON = `
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 9v6h4l5 4V5L8 9H4z"/>
      <path d="M16.5 8.5a5 5 0 0 1 0 7"/>
      <path d="M19 6a9 9 0 0 1 0 12"/>
    </svg>`;

  btn.innerHTML = ICON_OFF;

  btn.addEventListener('click', () => {
    if (!ctx) buildAudioGraph();
    toggleResonance();
  });


  /* ============================================================
     2. SIGNAL SMOOTHING
     Same delay mechanism as before: audio lags the visual field
     by roughly 15–30 seconds, giving the "feeling happens first,
     resonance follows" quality. Unchanged in principle.
     ============================================================ */

  const audioSignal = { attention: 50, curiosity: 50, fear: 50, hope: 50, wonder: 50 };
  const AUDIO_SMOOTH_TAU_MS = 16000;

  let audioPulse = 0;
  const PULSE_SMOOTH_TAU_MS = 6000;

  // Coherence: the single relationship parameter that governs the
  // whole ecology. 1.0 = maximally locked/harmonic. 0.0 = maximally
  // drifted/rough. Smoothed independently so it evolves gradually —
  // relationships don't snap, they resolve.
  let coherence = 0.55;
  const COHERENCE_SMOOTH_TAU_MS = 9000;

  let voices = null;
  let noiseBuffer = null;


  /* ============================================================
     3. NOISE BUFFER — for Green's filtered air
     ────────────────────────────────────────────────────────────
     Web Audio has no native noise oscillator, only periodic
     waveforms (sine/square/sawtooth/triangle). Broadband air/wind
     texture requires noise. This buffer is filled with Math.random()
     at construction time — it is generated by code, not loaded from
     any file, exactly satisfying "everything synthesised in real
     time." Looping white noise has no audible seam (unlike a
     musical loop, there is no waveform or rhythm to repeat) — this
     is the standard, universally-used technique for procedural wind
     and air textures, distinct from the "no samples/no loops"
     instruction which concerns pre-recorded musical content.
     ============================================================ */

  function createNoiseBuffer(ctx) {
    const seconds = 4;
    const length  = Math.floor(ctx.sampleRate * seconds);
    const buffer  = ctx.createBuffer(1, length, ctx.sampleRate);
    const data    = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }


  /* ============================================================
     4. AUDIO GRAPH CONSTRUCTION
     ============================================================ */

  function buildAudioGraph() {
    ctx = new AudioContextClass();
    graphStartTime = performance.now();
    noiseBuffer = createNoiseBuffer(ctx);

    masterGain = ctx.createGain();
    masterGain.gain.value = 0;

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value      = 12;
    limiter.ratio.value     = 8;
    limiter.attack.value    = 0.02;
    limiter.release.value   = 0.4;
    masterGain.connect(limiter);
    limiter.connect(ctx.destination);

    // Presence gain — attention's role. Subtler than before (0.70–1.15)
    // because in this iteration attention is mostly Blue's own concern;
    // this is just a light overall-presence trim, not a dramatic swing.
    presenceGain = ctx.createGain();
    presenceGain.gain.value = 0.85;
    presenceGain.connect(masterGain);

    voices = {
      blue:    buildBlueVoice(ctx, presenceGain),
      magenta: buildMagentaVoice(ctx, presenceGain),
      yellow:  buildYellowVoice(ctx, presenceGain),
      green:   buildGreenVoice(ctx, presenceGain),
      red:     buildRedVoice(ctx, presenceGain),
    };

    // ── Cross-voice relationships (wired once, at construction) ──
    wireCrossVoiceThreads(voices);

    graphBuilt = true;
    startUpdateLoop();
  }


  /* ────────────────────────────────────────────────────────────
     BLUE — Deep awareness. Foundation. Geological.
     ────────────────────────────────────────────────────────────
     Three oscillators in a widely-spaced, dense low register:
     fundamental (40 Hz), a fifth above (60 Hz), an octave (80 Hz).
     This density of close low-frequency partials is what reads
     as "immense" and "foundational" — not volume, mass.

     Depth technique: low-pass filtered (distant, muffled) AND fed
     into a slow cross-feed delay network (0.6s / 0.85s, deliberately
     mismatched so it never becomes a rhythmic echo) for the sense
     of a resonance continuing far beyond where it started — the
     "immense resonances, almost geological" quality.

     Relationship: each oscillator's detune drifts on an extremely
     slow LFO (period in MINUTES — 137s, 191s, 251s, mutually
     irrational). The drift amplitude is scaled by (1 − coherence):
     when coherence is high the three partials sit close to their
     pure ratios (locked, resonant); when coherence is low they
     drift apart into a duller, less resolved mass.
     ──────────────────────────────────────────────────────────── */

  function buildBlueVoice(ctx, dest) {
    const voiceGain = ctx.createGain();
    voiceGain.gain.value = 0;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 260;
    filter.Q.value = 0.6;

    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;

    // Cross-feed delay — the "immense" spatial quality
    const delayA = ctx.createDelay(2.0);
    const delayB = ctx.createDelay(2.0);
    delayA.delayTime.value = 0.60;
    delayB.delayTime.value = 0.85;
    const fbA = ctx.createGain(); fbA.gain.value = 0.42;
    const fbB = ctx.createGain(); fbB.gain.value = 0.42;
    delayA.connect(fbA).connect(delayB);
    delayB.connect(fbB).connect(delayA);

    filter.connect(voiceGain);
    filter.connect(delayA);
    delayA.connect(voiceGain);
    delayB.connect(voiceGain);

    if (panner) { voiceGain.connect(panner); panner.connect(dest); }
    else voiceGain.connect(dest);

    const base = 40;
    const ratios = [1.0, 1.5, 2.0];
    const driftPeriods = [137, 191, 251]; // seconds — mutually irrational, minute-scale

    const oscs = ratios.map((ratio, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = base * ratio;

      const g = ctx.createGain();
      g.gain.value = [0.42, 0.30, 0.20][i];
      osc.connect(g).connect(filter);
      osc.start();

      // Slow detune-drift LFO — audio-rate connection, always running.
      // Its DEPTH (not its existence) is what applyAudioParams scales
      // via coherence, using the driftDepth gain node below.
      const drift = ctx.createOscillator();
      drift.type = 'sine';
      drift.frequency.value = 1 / driftPeriods[i];
      const driftDepth = ctx.createGain();
      driftDepth.gain.value = 6; // base cents — scaled live by coherence
      drift.connect(driftDepth).connect(osc.detune);
      drift.start();

      return { osc, gain: g, driftDepth };
    });

    return { voiceGain, filter, panner, oscs, fbA, fbB, base };
  }


  /* ────────────────────────────────────────────────────────────
     MAGENTA — Imagination. Wandering. Threading.
     ────────────────────────────────────────────────────────────
     Two oscillators (190 Hz, 285 Hz — a fifth apart) each with a
     genuine frequency GLIDE, not just cents-level detune: their
     actual pitch wanders across a real range (±25–35 Hz) on very
     slow LFOs (113s, 151s periods). This is "wandering," not
     drifting-in-place.

     A short modulated delay (28ms, its time itself wobbled by a
     slow LFO) gives a cheap chorus-like weave without the cost of
     a true chorus effect — the "gentle weaving motion."

     One of the two oscillators additionally carries a very slow
     presence envelope (280–420s periods) so it occasionally recedes
     to near-silence and returns — "reappear... vanish" extended
     beyond Yellow's faster filaments to Magenta's slower scale.

     Threading: magenta's own wander LFO is tapped (see
     wireCrossVoiceThreads) to gently modulate Blue's stereo pan and
     Yellow's filter cutoff — magenta audibly moves THROUGH the
     other voices rather than sitting in its own lane.
     ──────────────────────────────────────────────────────────── */

  function buildMagentaVoice(ctx, dest) {
    const voiceGain = ctx.createGain();
    voiceGain.gain.value = 0;

    const chorusDelay = ctx.createDelay(0.1);
    chorusDelay.delayTime.value = 0.028;
    const chorusLfo = ctx.createOscillator();
    chorusLfo.type = 'sine';
    chorusLfo.frequency.value = 1 / 17.3; // slow wobble, irrational period
    const chorusDepth = ctx.createGain();
    chorusDepth.gain.value = 0.006;
    chorusLfo.connect(chorusDepth).connect(chorusDelay.delayTime);
    chorusLfo.start();

    const dry = ctx.createGain(); dry.gain.value = 0.7;
    const wet = ctx.createGain(); wet.gain.value = 0.5;

    dry.connect(voiceGain);
    chorusDelay.connect(wet).connect(voiceGain);

    const configs = [
      { base: 190, glideDepth: 27, glidePeriod: 113, presencePeriods: null },
      { base: 285, glideDepth: 34, glidePeriod: 151, presencePeriods: [307, 419] },
    ];

    const oscs = configs.map(cfg => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle'; // a little warmer/more overtone content than pure sine
      osc.frequency.value = cfg.base;

      const g = ctx.createGain();
      g.gain.value = 0.30;

      osc.connect(g);
      g.connect(dry);
      g.connect(chorusDelay);
      osc.start();

      // Genuine frequency wander — audio-rate, connects directly
      // to .frequency (Hz), not .detune (cents) — a real glide.
      const wander = ctx.createOscillator();
      wander.type = 'sine';
      wander.frequency.value = 1 / cfg.glidePeriod;
      const wanderDepth = ctx.createGain();
      wanderDepth.gain.value = cfg.glideDepth;
      wander.connect(wanderDepth).connect(osc.frequency);
      wander.start();

      return { osc, gain: g, wander, wanderDepth, presencePeriods: cfg.presencePeriods };
    });

    return { voiceGain, oscs, chorusDelay };
  }


  /* ────────────────────────────────────────────────────────────
     YELLOW — Curiosity. Filaments. Constant tiny events.
     ────────────────────────────────────────────────────────────
     Three high oscillators (base 1400 Hz region). Each carries its
     own presence envelope — a sum of three mutually-irrational sine
     waves passed through a threshold gate (computed in JS, applied
     via setTargetAtTime) — producing irregular pulses of audibility
     that never repeat within a realistic session.

     The filament technique: whenever an oscillator's envelope drops
     to silence, its frequency is instantly retuned (inaudibly, while
     silent) to a new, continuously-random ratio of the base
     frequency before it reappears. This is what makes filaments
     "appear... at a different pitch... dissolve... reappear
     elsewhere" rather than simply fading the same tone in and out.

     A shared bandpass filter keeps Yellow bright and close —
     unfiltered high partials read as near and immediate, the
     opposite spatial character from Blue's distant, filtered mass.
     ──────────────────────────────────────────────────────────── */

  function buildYellowVoice(ctx, dest) {
    const voiceGain = ctx.createGain();
    voiceGain.gain.value = 0;

    const sharedFilter = ctx.createBiquadFilter();
    sharedFilter.type = 'bandpass';
    sharedFilter.frequency.value = 1800;
    sharedFilter.Q.value = 0.5;
    sharedFilter.connect(voiceGain);
    voiceGain.connect(dest);

    const base = 1400;
    const envPeriods = [
      [47.3, 71.9, 113.7],
      [58.1, 83.3, 131.2],
      [39.7, 97.4, 149.5],
    ];

    const partials = envPeriods.map((periods, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = base * (1.2 + Math.random() * 1.8);

      const g = ctx.createGain();
      g.gain.value = 0; // envelope-driven, starts silent

      const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      if (panner) {
        osc.connect(g).connect(panner).connect(sharedFilter);
        const panLfo = ctx.createOscillator();
        panLfo.type = 'sine';
        panLfo.frequency.value = 1 / (13 + i * 6.7);
        const panDepth = ctx.createGain();
        panDepth.gain.value = 0.75;
        panLfo.connect(panDepth).connect(panner.pan);
        panLfo.start();
      } else {
        osc.connect(g).connect(sharedFilter);
      }

      osc.start();
      return { osc, gain: g, periods, wasPresent: false };
    });

    return { voiceGain, sharedFilter, partials, base };
  }


  /* ────────────────────────────────────────────────────────────
     GREEN — Recovery. Soft filtered air. Connective tissue.
     ────────────────────────────────────────────────────────────
     Filtered noise (see createNoiseBuffer) through a bandpass whose
     centre frequency and Q breathe on a slow LFO (~31s period) —
     genuine air/wind character, not a tone. A single deeply
     lowpassed low sine (130 Hz) sits underneath, almost inaudible
     on its own — "felt rather than heard."

     Connective role: Green's own breathing LFO is tapped (see
     wireCrossVoiceThreads) into every OTHER voice's gain at a tiny
     depth (±2%), giving the whole ecology one shared, barely
     perceptible pulse — Green literally connects the field.
     ──────────────────────────────────────────────────────────── */

  function buildGreenVoice(ctx, dest) {
    const voiceGain = ctx.createGain();
    voiceGain.gain.value = 0;
    voiceGain.connect(dest);

    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuffer;
    noiseSrc.loop = true;

    const bandpass = ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.value = 420;
    bandpass.Q.value = 1.2;

    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.55;

    noiseSrc.connect(bandpass).connect(noiseGain).connect(voiceGain);
    noiseSrc.start();

    // Breathing LFO — modulates the noise filter AND (via
    // wireCrossVoiceThreads) reaches into every other voice.
    const breath = ctx.createOscillator();
    breath.type = 'sine';
    breath.frequency.value = 1 / 31.4;
    const breathToFilter = ctx.createGain();
    breathToFilter.gain.value = 140; // Hz swing on the bandpass centre
    breath.connect(breathToFilter).connect(bandpass.frequency);
    breath.start();

    // The underlying low sine — "felt, not heard"
    const under = ctx.createOscillator();
    under.type = 'sine';
    under.frequency.value = 130;
    const underFilter = ctx.createBiquadFilter();
    underFilter.type = 'lowpass';
    underFilter.frequency.value = 90;
    const underGain = ctx.createGain();
    underGain.gain.value = 0.12;
    under.connect(underFilter).connect(underGain).connect(voiceGain);
    under.start();

    return { voiceGain, bandpass, noiseGain, breath, underGain };
  }


  /* ────────────────────────────────────────────────────────────
     RED — Conflict. Latent. Destabilising.
     ────────────────────────────────────────────────────────────
     Two near-unison oscillators (85 Hz, 87 Hz — ~2 Hz apart) sit
     essentially silent at rest. Fear does not simply raise their
     gain: it also widens their separation (faster, rougher beating)
     and opens a resonant bandpass filter's Q (building "pressure").

     Critically, Red's presence in the mix is the SMALLER half of
     its role. Its larger role is destabilising every OTHER voice
     by pulling the shared coherence parameter down — see
     applyAudioParams(). This is how fear "destabilises the entire
     acoustic ecology" rather than just adding its own sound.
     ──────────────────────────────────────────────────────────── */

  function buildRedVoice(ctx, dest) {
    const voiceGain = ctx.createGain();
    voiceGain.gain.value = 0; // silent at rest — latent

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 86;
    filter.Q.value = 1.5; // rises under fear — "pressure"
    filter.connect(voiceGain);
    voiceGain.connect(dest);

    const base = 85;
    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth'; // more overtone content — reads as rougher when audible
    osc1.frequency.value = base;
    const osc2 = ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.value = base * 1.024; // ~2 Hz beat at rest

    const g1 = ctx.createGain(); g1.gain.value = 0.5;
    const g2 = ctx.createGain(); g2.gain.value = 0.5;
    osc1.connect(g1).connect(filter);
    osc2.connect(g2).connect(filter);
    osc1.start(); osc2.start();

    return { voiceGain, filter, osc2, base };
  }


  /* ============================================================
     5. CROSS-VOICE THREADS
     Wired once, at construction. These are the concrete
     implementations of "relationships between voices" that go
     beyond any single voice's own internal behaviour.
     ============================================================ */

  function wireCrossVoiceThreads(v) {
    // Magenta's first wander LFO threads into Blue's pan and
    // Yellow's shared filter cutoff — magenta "moves through" both.
    const mWander = v.magenta.oscs[0].wander;

    if (v.blue.panner) {
      const toPan = ctx.createGain();
      toPan.gain.value = 0.10; // small — a gentle drift, not a sweep
      mWander.connect(toPan).connect(v.blue.panner.pan);
    }

    const toYellowFilter = ctx.createGain();
    toYellowFilter.gain.value = 90; // Hz swing on yellow's shared bandpass
    mWander.connect(toYellowFilter).connect(v.yellow.sharedFilter.frequency);

    // Green's breath threads into every voice's gain — the "connects
    // the entire acoustic field" mechanism. Depth kept tiny (±0.02)
    // so it is felt as a shared pulse, not heard as tremolo.
    const glueTargets = [v.blue.voiceGain, v.magenta.voiceGain, v.yellow.voiceGain, v.red.voiceGain];
    glueTargets.forEach(target => {
      const glue = ctx.createGain();
      glue.gain.value = 0.02;
      v.green.breath.connect(glue).connect(target.gain);
    });
  }


  /* ============================================================
     6. UPDATE LOOP
     ============================================================ */

  let updateRafId   = null;
  let lastFrameTime = null;
  let paramAccum    = 0;
  const PARAM_INTERVAL_MS = 125; // ~8 Hz parameter writes

  function startUpdateLoop() {
    if (updateRafId) return;
    lastFrameTime = performance.now();
    updateRafId = requestAnimationFrame(updateTick);
  }

  function updateTick(ts) {
    updateRafId = requestAnimationFrame(updateTick);
    const dt = Math.min(ts - lastFrameTime, 100);
    lastFrameTime = ts;

    const sig = window.planetarySignal;
    if (sig && sig.current) {
      const smoothFactor = 1 - Math.exp(-dt / AUDIO_SMOOTH_TAU_MS);
      for (const key of Object.keys(audioSignal)) {
        audioSignal[key] += (sig.current[key] - audioSignal[key]) * smoothFactor;
      }

      const ev = sig.eventState;
      const targetPulse = ev ? ev.pulse : 0;
      const pulseFactor = 1 - Math.exp(-dt / PULSE_SMOOTH_TAU_MS);
      audioPulse += (targetPulse - audioPulse) * pulseFactor;

      // Coherence target: hope tightens, fear loosens, event onset
      // briefly disturbs it regardless of hope/fear (see below).
      const hopeNorm = audioSignal.hope / 100;
      const fearNorm = audioSignal.fear / 100;
      let coherenceTarget = 0.5 + hopeNorm * 0.46 - fearNorm * 0.50;
      // Global Events momentarily pull coherence toward disturbance —
      // "relationships change... resonances bloom" — then, because
      // this is recomputed every tick and pulse decays on its own
      // schedule (owned by signal.js), coherence naturally resolves
      // back to its hope/fear baseline as the event fades. No
      // separate "return" logic is needed — it falls out of the loop.
      coherenceTarget -= audioPulse * 0.35;
      coherenceTarget = Math.max(0.04, Math.min(0.97, coherenceTarget));

      const coherenceFactor = 1 - Math.exp(-dt / COHERENCE_SMOOTH_TAU_MS);
      coherence += (coherenceTarget - coherence) * coherenceFactor;
    }

    paramAccum += dt;
    if (paramAccum >= PARAM_INTERVAL_MS && ctx && graphBuilt) {
      paramAccum = 0;
      applyAudioParams();
      updateYellowFilaments();
      updateMagentaPresence();
    }
  }


  /* ============================================================
     7. PARAMETER APPLICATION
     ============================================================ */

  function applyAudioParams() {
    const now = ctx.currentTime;
    const T   = 2.4;

    const attentionNorm = audioSignal.attention / 100;
    const fearNorm       = audioSignal.fear      / 100;
    const hopeNorm        = audioSignal.hope      / 100;
    const curiosityNorm  = audioSignal.curiosity / 100;
    const wonderNorm      = audioSignal.wonder    / 100;

    // Presence — attention's subtle overall trim
    presenceGain.gain.setTargetAtTime(0.70 + attentionNorm * 0.45, now, T);

    /* ── BLUE (attention) ────────────────────────────────────── */
    const bv = voices.blue;
    bv.voiceGain.gain.setTargetAtTime(0.16 + attentionNorm * 0.34, now, T);
    bv.filter.frequency.setTargetAtTime(220 + attentionNorm * 160, now, T);
    // Detune drift depth scaled by (1 - coherence): locked at high
    // coherence, wandering apart at low coherence.
    const blueDriftScale = 4 + (1 - coherence) * 22;
    bv.oscs.forEach(o => o.driftDepth.gain.setTargetAtTime(blueDriftScale, now, T));

    /* ── MAGENTA (wonder) ────────────────────────────────────── */
    const mv = voices.magenta;
    const magGain = 0.05 + wonderNorm * 0.22;
    mv.voiceGain.gain.setTargetAtTime(magGain, now, T);
    // Wander range widens with wonder — more expansive imagination
    mv.oscs.forEach(o => {
      const depth = o === mv.oscs[0]
        ? 20 + wonderNorm * 18
        : 24 + wonderNorm * 22;
      o.wanderDepth.gain.setTargetAtTime(depth, now, T);
    });

    /* ── YELLOW (curiosity) — base gain scaling only;             */
    /*    the filament appear/dissolve envelopes are handled in    */
    /*    updateYellowFilaments() below, which reads curiosityNorm */
    const yv = voices.yellow;
    yv.voiceGain.gain.setTargetAtTime(0.4 + curiosityNorm * 0.6, now, T);
    yv.sharedFilter.frequency.setTargetAtTime(1500 + curiosityNorm * 900, now, T);

    /* ── GREEN (hope) ────────────────────────────────────────── */
    const gv = voices.green;
    gv.noiseGain.gain.setTargetAtTime(0.20 + hopeNorm * 0.55, now, T);
    gv.underGain.gain.setTargetAtTime(0.06 + hopeNorm * 0.14, now, T);
    gv.bandpass.Q.setTargetAtTime(0.8 + hopeNorm * 1.4, now, T); // more resonant/alive as hope rises

    /* ── RED (fear) ──────────────────────────────────────────── */
    const rv = voices.red;
    // Latent floor near zero; rises steeply with fear, never gently
    const redGain = Math.pow(fearNorm, 1.8) * 0.42;
    rv.voiceGain.gain.setTargetAtTime(redGain, now, T);
    // Separation widens under fear — faster, rougher beating
    rv.osc2.frequency.setTargetAtTime(rv.base * (1.024 + fearNorm * 0.028), now, T);
    rv.filter.Q.setTargetAtTime(1.5 + fearNorm * 5.5, now, T); // "pressure"

    /* ── GLOBAL EVENT — additional direct touches ─────────────── */
    // Coherence disturbance already handles most of "reorganisation."
    // Two extra touches: Blue and Magenta briefly nudge in frequency
    // ("voices migrate"), settling back automatically as audioPulse
    // decays each tick (no separate return scheduling required).
    if (audioPulse > 0.01) {
      const T_event = 1.6;
      bv.oscs.forEach((o, i) => {
        const migrate = audioPulse * (3 + i * 2); // Hz nudge, tiny
        o.osc.frequency.setTargetAtTime(bv.base * [1, 1.5, 2.0][i] + migrate, now, T_event);
      });
      rv.filter.Q.setTargetAtTime(1.5 + fearNorm * 5.5 + audioPulse * 4.0, now, T_event);
    } else {
      // Ensure blue settles exactly back to its pure ratios when
      // no event is active (redundant with the smoothing above,
      // stated explicitly for clarity).
      bv.oscs.forEach((o, i) => {
        o.osc.frequency.setTargetAtTime(bv.base * [1, 1.5, 2.0][i], now, T);
      });
    }
  }


  /* ============================================================
     8. YELLOW FILAMENT ENGINE
     Computed in JS (not audio-rate) because it needs to READ each
     oscillator's current envelope state to detect the silent
     moment for inaudible retuning — an audio-rate LFO alone cannot
     do this branching logic.
     ============================================================ */

  function updateYellowFilaments() {
    const tSec = (performance.now() - graphStartTime) / 1000;
    const now  = ctx.currentTime;
    const curiosityNorm = audioSignal.curiosity / 100;

    // Lower threshold (more frequent presence) as curiosity rises
    const threshold = 0.55 - curiosityNorm * 0.35;

    voices.yellow.partials.forEach(p => {
      const [p0, p1, p2] = p.periods;
      const raw =
        Math.sin(2 * Math.PI * tSec / p0) +
        0.6 * Math.sin(2 * Math.PI * tSec / p1) +
        0.3 * Math.sin(2 * Math.PI * tSec / p2);
      const norm = raw / 1.9; // -1..1

      // Smoothstep gate
      const edge0 = threshold, edge1 = threshold + 0.15;
      let t = Math.min(1, Math.max(0, (norm - edge0) / (edge1 - edge0)));
      const presence = t * t * (3 - 2 * t);

      const targetGain = presence * (0.55 + curiosityNorm * 0.45);
      p.gain.gain.setTargetAtTime(targetGain, now, 0.9);

      // Filament retune: if we just crossed from present → silent,
      // pick a new frequency now, inaudibly, before it reappears.
      const isPresent = presence > 0.02;
      if (!isPresent && p.wasPresent) {
        const widthBoost = 1.0 + curiosityNorm * 0.8; // wider band, more curious
        p.osc.frequency.setValueAtTime(
          voices.yellow.base * (1.2 + Math.random() * 1.8 * widthBoost),
          now
        );
      }
      p.wasPresent = isPresent;
    });
  }


  /* ============================================================
     9. MAGENTA SLOW PRESENCE ENGINE
     One of Magenta's two oscillators has its own much slower
     appear/vanish envelope (minutes, not seconds) — the same
     mathematical technique as Yellow's filaments, at a different
     timescale, giving Magenta structural evolution beyond its
     continuous wander.
     ============================================================ */

  function updateMagentaPresence() {
    const tSec = (performance.now() - graphStartTime) / 1000;
    const now  = ctx.currentTime;

    voices.magenta.oscs.forEach(o => {
      if (!o.presencePeriods) return; // only the second oscillator has this
      const [p0, p1] = o.presencePeriods;
      const raw = Math.sin(2 * Math.PI * tSec / p0) + 0.5 * Math.sin(2 * Math.PI * tSec / p1);
      const norm = (raw / 1.5) * 0.5 + 0.5; // 0..1
      const presence = 0.25 + norm * 0.75;  // never fully vanishes, only recedes
      o.gain.gain.setTargetAtTime(0.30 * presence, now, 3.0);
    });
  }


  /* ============================================================
     10. TOGGLE — unchanged from Iteration 31
     ============================================================ */

  function toggleResonance() {
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();

    isOn = !isOn;
    const now = ctx.currentTime;

    if (isOn) {
      masterGain.gain.cancelScheduledValues(now);
      masterGain.gain.setValueAtTime(masterGain.gain.value, now);
      masterGain.gain.linearRampToValueAtTime(1.0, now + 5.0);
      btn.innerHTML = ICON_ON;
      btn.classList.add('audio-active');
    } else {
      masterGain.gain.cancelScheduledValues(now);
      masterGain.gain.setValueAtTime(masterGain.gain.value, now);
      masterGain.gain.linearRampToValueAtTime(0.0, now + 4.0);
      btn.innerHTML = ICON_OFF;
      btn.classList.remove('audio-active');
    }
  }

})();

/**
 * THE SECOND ATMOSPHERE — signal.js
 * ─────────────────────────────────────────────────────────────
 * Planetary Signal: the global consciousness data pipeline.
 *
 * Data source priority:
 *   1. GDELT via Cloudflare Worker (gdelt-adapter.js)
 *      — requires WORKER_URL in gdelt-adapter.js
 *   2. Simulated fallback — organic sine-wave drift
 *
 * TWO MODES:
 *
 *   MODE 1 — BACKGROUND CLIMATE
 *     Normal state. The cloud breathes slowly.
 *     Colour and density evolve over minutes.
 *     Represents humanity's ongoing emotional climate.
 *
 *   MODE 2 — GLOBAL EVENT
 *     Triggered when any signal dimension jumps ≥ EVENT_THRESHOLD
 *     points in a single update cycle. Represents a moment of
 *     concentrated collective attention — war, disaster, discovery,
 *     celebration. The cloud awakens: a luminous ring expands
 *     across the field over 55 seconds, then the field relaxes
 *     back to Background Climate.
 *
 * Signal → Cloud mapping:
 *   attention  → brightness (0.25→2.20 intensity)
 *   fear       → turbulence + cold violet shift (0.0→1.40 warp)
 *   hope       → warm amber glow (0.05→1.50 warmth)
 *   curiosity  → cool field expansion (0.10→1.10 activity)
 *   wonder     → field rotation / blue-violet expansion (0→1.0 polarity)
 *
 * Public API:
 *   window.planetarySignal.current    — live lerped values
 *   window.planetarySignal.target     — current target
 *   window.planetarySignal.meta       — source, mode, dominant, etc.
 *   window.planetarySignal.tick(dt, now) — call from render loop
 *   window.planetarySignal.forceUpdate() — immediate refresh
 *   window.planetarySignal.inject(obj)   — override for testing
 *   window.planetarySignal.triggerEvent(label) — force Global Event
 */

/* ============================================================
   BASELINE
   ============================================================ */

const BASELINE = {
  deepFieldIntensity:    1.0,
  flowMembraneIntensity: 0.5,
  filamentIntensity:     0.5,
};


/* ============================================================
   SIGNAL STATE
   ============================================================ */

const state = {
  current: { attention: 50, curiosity: 50, fear: 50, hope: 50, wonder: 50 },
  target:  { attention: 50, curiosity: 50, fear: 50, hope: 50, wonder: 50 },

  // Previous target — used for delta detection (Global Event)
  prevTarget: { attention: 50, curiosity: 50, fear: 50, hope: 50, wonder: 50 },

  meta: {
    source:       'initialising',
    fetchedAt:    0,
    articleCount: 0,
    dominant:     'unknown',
    mode:         'background',  // 'background' | 'global-event'
    eventLabel:   '',            // human-readable description of last event
  },

  lastUpdate: 0,
  UPDATE_INTERVAL: 15 * 60 * 1000,  // 15 min — matches GDELT update frequency
  fetching:   false,
};


/* ============================================================
   GLOBAL EVENT DETECTION
   A Global Event occurs when any signal dimension jumps by
   ≥ EVENT_THRESHOLD points in a single update cycle.

   This represents a sudden concentration of global attention —
   the kind of moment when humanity briefly thinks as one.

   EVENT_THRESHOLD = 18 points.
   Normal daily variance is ±5–8 points between updates.
   A jump of 18+ indicates an unusual concentration of coverage.
   ============================================================ */

const EVENT_THRESHOLD = 18;  // minimum jump to trigger Global Event
const EVENT_DURATION  = 60;  // seconds the pulse runs for

// Global Event state
const eventState = {
  active:    false,
  startTime: 0,   // performance.now() when event began
  pulse:     0,   // current pulse amplitude (0→1, then decays to 0)
  age:       0,   // seconds since event onset
};

function checkForGlobalEvent(newTarget, prevTarget) {
  if (eventState.active) return; // don't stack events

  let maxJump = 0;
  let jumpDim = '';
  let jumpLabel = '';

  for (const key of Object.keys(newTarget)) {
    const jump = Math.abs(newTarget[key] - (prevTarget[key] || 50));
    if (jump > maxJump) {
      maxJump = jump;
      jumpDim = key;
    }
  }

  if (maxJump >= EVENT_THRESHOLD) {
    // Name the event based on which dimension jumped and direction
    const direction = newTarget[jumpDim] > (prevTarget[jumpDim] || 50) ? 'surge' : 'collapse';
    const labels = {
      fear:      direction === 'surge' ? 'Global Crisis Detected'       : 'Crisis Abating',
      hope:      direction === 'surge' ? 'Collective Hope Rising'        : 'Hope Signal Fading',
      curiosity: direction === 'surge' ? 'Global Discovery Moment'       : 'Attention Shifting',
      wonder:    direction === 'surge' ? 'Planetary Wonder Event'        : 'Wonder Dispersing',
      attention: direction === 'surge' ? 'Collective Attention Surge'    : 'Attention Dispersing',
    };

    eventState.active    = true;
    eventState.startTime = performance.now();
    eventState.pulse     = 1.0;
    eventState.age       = 0;

    state.meta.mode       = 'global-event';
    state.meta.eventLabel = labels[jumpDim] || 'Global Event';

    console.log(`[signal] Global Event: ${state.meta.eventLabel} (${jumpDim} Δ${maxJump.toFixed(1)})`);
  }
}

function updateEventState(dtSec) {
  if (!eventState.active) return;

  eventState.age = (performance.now() - eventState.startTime) / 1000;

  // Pulse amplitude: hold at 1.0 for 5 seconds, then decay over remaining duration
  const holdTime   = 5;
  const decayTime  = EVENT_DURATION - holdTime;
  if (eventState.age < holdTime) {
    eventState.pulse = 1.0;
  } else {
    const decayProgress = (eventState.age - holdTime) / decayTime;
    eventState.pulse = Math.max(0, 1.0 - decayProgress * decayProgress); // quadratic decay
  }

  // Event ends after EVENT_DURATION seconds
  if (eventState.age >= EVENT_DURATION) {
    eventState.active = false;
    eventState.pulse  = 0;
    state.meta.mode   = 'background';
  }
}


/* ============================================================
   SIMULATED FALLBACK
   ============================================================ */

let _simTime = 0;

function generateSimulatedSignal() {
  _simTime += 1;
  const t     = _simTime;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  const attention = clamp(50 + 18*Math.sin(t*0.41) + 8*Math.sin(t*0.17) + 6*(Math.random()-0.5), 15, 85);
  const curiosity = clamp(50 + 20*Math.sin(t*0.73) + 10*Math.sin(t*1.31) + 10*(Math.random()-0.5), 10, 90);
  const fearBase  = 25 + 12*Math.sin(t*0.53);
  const fearSpike = Math.random() < 0.15 ? 30 + Math.random()*35 : 0;
  const fear      = clamp(fearBase + fearSpike + 5*(Math.random()-0.5), 5, 88);
  const hope      = clamp(55 + 20*Math.sin(t*0.29) - 0.4*(fear-25) + 5*(Math.random()-0.5), 10, 90);
  const wonder    = clamp(50 + 18*Math.sin(t*0.73-0.8) + 7*Math.sin(t*0.43) + 6*(Math.random()-0.5), 10, 90);

  return { attention, curiosity, fear, hope, wonder };
}


/* ============================================================
   FETCH NEW SIGNAL
   Tries GDELT adapter first, falls back to simulation.
   ============================================================ */

async function fetchNewSignal() {
  if (state.fetching) return;
  state.fetching = true;

  // Save previous target for delta detection
  Object.assign(state.prevTarget, state.target);

  try {
    // Try GDELT adapter
    const adapter = window.gdeltAdapter;
    if (adapter) {
      const gdeltSignal = await adapter.fetchSignal();
      if (gdeltSignal) {
        Object.assign(state.target, gdeltSignal); // mutate in place so planetarySignal.target stays live
        const r = adapter.lastResult;
        state.meta.source       = r.source;
        state.meta.fetchedAt    = r.fetchedAt;
        state.meta.articleCount = r.articleCount;
        state.meta.dominant     = r.dominant;
        state.fetching = false;
        checkForGlobalEvent(state.target, state.prevTarget);
        return;
      }
    }

    // Fall back to simulation
    Object.assign(state.target, generateSimulatedSignal());
    state.meta.source         = 'simulated';
    state.meta.fetchedAt      = Date.now();
    state.meta.articleCount   = 0;
    state.meta.dominant       = 'simulated';

  } catch (err) {
    console.warn('[signal] fetchNewSignal error:', err);
    Object.assign(state.target, generateSimulatedSignal());
    state.meta.source         = 'simulated';
    state.meta.fetchedAt      = Date.now();
    state.meta.articleCount   = 0;
    state.meta.dominant       = 'simulated';
  }

  state.fetching = false;
}


/* Initial fetch — 500ms delay so adapters finish initialising */
setTimeout(() => fetchNewSignal(), 500);


/* ============================================================
   LERP SPEED
   ============================================================ */
const LERP_SPEED = 0.0015; // per ms


/* ============================================================
   SIGNAL → CLOUD MAPPING
   ============================================================ */

function applySignalToAtmosphere(sig) {
  const u = window.consciousnessUniforms;
  if (!u) return;

  const s        = sig;
  const fearNorm = s.fear / 100;   // 0–1
  const hopeNorm = s.hope / 100;   // 0–1

  // ── ATTENTION → overall brightness ──────────────────────────
  const brightness = 0.25 + (s.attention / 100) * 1.95;
  u.deepField.u_intensity.value = brightness * BASELINE.deepFieldIntensity;

  // ── FEAR → turbulence + direct red driver ───────────────────
  const turb = fearNorm * 1.40;
  u.deepField.u_turbulence.value    = turb;
  u.flowMembrane.u_turbulence.value = turb;
  u.filaments.u_turbulence.value    = turb * 0.7;

  // u_fear drives the red eruption exponent in the shader directly
  if (u.deepField.u_fear) u.deepField.u_fear.value = fearNorm;

  // Blue field dims slightly under fear (crisis makes calm recede)
  u.deepField.u_primaryColor.value.setRGB(
    0.00,
    Math.max(0.04, 0.20 - fearNorm * 0.14),
    Math.max(0.60, 1.00 - fearNorm * 0.18)
  );

  // ── HOPE → warmth + green recovery driver ───────────────────
  const warmth = 0.05 + hopeNorm * 1.45;
  u.flowMembrane.u_intensity.value = warmth;
  // u_hope drives green regeneration strength in the shader
  if (u.deepField.u_hope) u.deepField.u_hope.value = hopeNorm;

  // ── CURIOSITY → yellow bloom intensity ──────────────────────
  const activity = 0.10 + (s.curiosity / 100) * 1.00;
  u.filaments.u_intensity.value = activity;

  // ── WONDER → field rotation ──────────────────────────────────
  const polarity = (s.wonder / 100) * 1.00;
  u.deepField.u_polarity.value    = polarity;
  u.flowMembrane.u_polarity.value = polarity;
  u.filaments.u_polarity.value    = polarity;

  // ── GLOBAL EVENT → pulse ─────────────────────────────────────
  if (u.deepField.u_pulse) {
    u.deepField.u_pulse.value    = eventState.pulse;
    u.deepField.u_pulseAge.value = eventState.age;
  }
}


/* ============================================================
   TICK — called every frame from main.js render loop
   ============================================================ */

function tick(dt, now) {
  const dtSec = dt * 0.001;

  // Trigger new fetch when interval elapsed
  if (now - state.lastUpdate >= state.UPDATE_INTERVAL) {
    state.lastUpdate = now;
    fetchNewSignal();
  }

  // Update Global Event state
  updateEventState(dtSec);

  // Lerp current → target
  const lerpFactor = Math.min(1, LERP_SPEED * dt);
  for (const key of Object.keys(state.current)) {
    state.current[key] += (state.target[key] - state.current[key]) * lerpFactor;
  }

  applySignalToAtmosphere(state.current);
}


/* ============================================================
   PUBLIC API
   ============================================================ */

window.planetarySignal = {
  current: state.current,
  target:  state.target,
  meta:    state.meta,

  tick,

  async forceUpdate() {
    state.lastUpdate = 0;
    await fetchNewSignal();
  },

  inject(values) {
    Object.assign(state.target, values);
    for (const key of Object.keys(values)) {
      if (state.current[key] !== undefined) {
        state.current[key] += (values[key] - state.current[key]) * 0.30;
      }
    }
    state.meta.source    = 'injected';
    state.meta.fetchedAt = Date.now();
    state.lastUpdate     = performance.now();
  },

  // Force a Global Event for testing — bypasses delta detection
  // Usage: window.planetarySignal.triggerEvent('Test Event')
  triggerEvent(label = 'Manual Test Event') {
    if (eventState.active) {
      eventState.active = false; // reset if one is running
    }
    eventState.active    = true;
    eventState.startTime = performance.now();
    eventState.pulse     = 1.0;
    eventState.age       = 0;
    state.meta.mode      = 'global-event';
    state.meta.eventLabel = label;
    console.log(`[signal] Manual event: ${label}`);
  },

  // Read-only event state for debug overlay
  get eventState() {
    return { ...eventState };
  },
};

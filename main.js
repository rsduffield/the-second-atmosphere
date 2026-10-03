/**
 * THE SECOND ATMOSPHERE — main.js
 * Iteration 30: Chromatic Consciousness — Filamented
 * ─────────────────────────────────────────────────────────────
 * Five pure digital colours. Each a distinct organism.
 * Filament extraction gives each colour luminous threaded structure
 * with bright cores, soft halos, and deep black voids between.
 *
 * BLUE     — calm, depth. Breathes: large slow lobes.
 * MAGENTA  — infiltration. Threads into blue topology.
 * YELLOW   — illumination. Radial bloom, bright cores.
 * GREEN    — regeneration. Fills space fear vacates.
 * RED      — urgency. Latent. Ignites under crisis.
 */

/* ============================================================
   0. RENDERER
   ============================================================ */

const canvas = document.getElementById('globe-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene  = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);


/* ============================================================
   1. UNIFORMS
   ============================================================ */

const uniforms = {
  u_time:       { value: 0.0 },
  u_resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },

  u_intensity:  { value: 1.0 },
  u_turbulence: { value: 0.0 },
  u_polarity:   { value: 0.0 },
  u_warmth:     { value: 0.5 },
  u_activity:   { value: 0.5 },
  u_fear:       { value: 0.0 },
  u_hope:       { value: 0.5 },

  u_pulse:      { value: 0.0 },
  u_pulseAge:   { value: 0.0 },

  // Pure saturated digital primaries — purity nudged for Iteration 32
  // colour grade. Hue is preserved exactly; only channel purity
  // increased slightly (5–15%) toward each colour's radiant character.
  u_blue:    { value: new THREE.Color(0.00, 0.22, 1.00) }, // unchanged — already maximally pure
  u_magenta: { value: new THREE.Color(1.00, 0.00, 0.85) }, // was 0.75 — more electric/vivid
  u_yellow:  { value: new THREE.Color(1.00, 0.95, 0.00) }, // was 0.92 — pure golden sunlight
  u_green:   { value: new THREE.Color(0.00, 0.92, 0.18) }, // was 0.90/0.30 — purer living emerald, less teal tint
  u_red:     { value: new THREE.Color(1.00, 0.03, 0.00) }, // was 0.05 — purer radiant crimson
};


/* ============================================================
   2. VERTEX SHADER
   ============================================================ */

const vertexShader = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;


/* ============================================================
   3. FRAGMENT SHADER
   ============================================================

   KEY TECHNIQUE: Filament extraction via ridge function.

   Standard fBm → soft blobs (the old result).
   Ridge fBm → bright filaments with dark voids between.

   The ridge function: ridge(n) = 1.0 - abs(n*2.0 - 1.0)
   This maps 0.0 → 0.0, 0.5 → 1.0, 1.0 → 0.0.
   Each noise octave contributes a ridge rather than a ramp.
   The result: a lattice of bright narrow bands (filaments)
   separated by dark voids — exactly the reference aesthetic.

   HALO: Each filament colour is added TWICE:
     1. pow(filament, 3.0) → the bright tight core
     2. pow(filament, 0.8) → the soft wide halo
   The halo at lower power gives each thread its luminous bloom.

   MULTI-SCALE: Two fbm passes at different octave counts:
     fbmLow (2 oct) → large sweeping lobes (background structure)
     fbmHigh (4 oct) → fine filaments (foreground detail)
   Combined: lobes give the large colour territories,
   filaments give the filamented texture within each territory.

   FIVE BEHAVIOURAL FIELDS:
     Blue    — breathing scale, gentle warp
     Magenta — coordinates pulled toward blue topology
     Yellow  — radial compression (blooms from centre)
     Green   — warp inversely proportional to fear
     Red     — suppressed by (1-u_fear)^2, erupts under crisis

   ============================================================ */

const fragmentShader = /* glsl */`

  precision highp float;

  uniform float u_time;
  uniform vec2  u_resolution;
  uniform float u_intensity;
  uniform float u_turbulence;
  uniform float u_polarity;
  uniform float u_warmth;
  uniform float u_activity;
  uniform float u_fear;
  uniform float u_hope;
  uniform float u_pulse;
  uniform float u_pulseAge;

  uniform vec3  u_blue;
  uniform vec3  u_magenta;
  uniform vec3  u_yellow;
  uniform vec3  u_green;
  uniform vec3  u_red;

  varying vec2 vUv;


  /* ── Hash ─────────────────────────────────────────────────── */

  vec3 hash33(vec3 p) {
    p  = fract(p * vec3(443.8975, 397.2973, 491.1871));
    p += dot(p, p.yxz + 19.19);
    return fract((p.xxy + p.yxx) * p.zyx);
  }


  /* ── Gradient noise ────────────────────────────────────────── */

  float gnoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f*f*f*(f*(f*6.0 - 15.0) + 10.0);
    #define G(o) (hash33(i+(o))*2.0-1.0)
    #define N(o) dot(G(o), f-(o))
    return mix(
      mix(mix(N(vec3(0,0,0)),N(vec3(1,0,0)),u.x),
          mix(N(vec3(0,1,0)),N(vec3(1,1,0)),u.x), u.y),
      mix(mix(N(vec3(0,0,1)),N(vec3(1,0,1)),u.x),
          mix(N(vec3(0,1,1)),N(vec3(1,1,1)),u.x), u.y), u.z
    ) * 0.5 + 0.5;
    #undef G
    #undef N
  }


  /* ── Standard fBm — 2 octaves (large lobe structure) ───────── */

  float fbmLow(vec3 p) {
    float v = 0.0, a = 0.60, f = 1.0;
    v += a * gnoise(p);         f *= 2.07; a *= 0.50;
    v += a * gnoise(p * f);
    return v;
  }


  /* ── Ridge fBm — 4 octaves (filament structure) ─────────────
     Each octave contributes a ridge: bright at the iso-surface,
     dark between. This stacks multiple scales of filaments.
     The product (not sum) of octave ridges produces the
     characteristic bright-on-dark filamented texture. */

  float fbmRidge(vec3 p) {
    float v = 1.0, a = 0.55, f = 1.0;
    const float L = 2.17;

    // Ridge function: peaks at 0.5, zero at 0 and 1
    float r;
    r = 1.0 - abs(gnoise(p)       * 2.0 - 1.0); v *= pow(r, 0.7); f *= L;
    r = 1.0 - abs(gnoise(p * f)   * 2.0 - 1.0); v *= pow(r, 0.8); f *= L;
    p += vec3(31.41, 17.32, 53.58);
    r = 1.0 - abs(gnoise(p * f)   * 2.0 - 1.0); v *= pow(r, 0.9); f *= L;
    r = 1.0 - abs(gnoise(p * f)   * 2.0 - 1.0); v *= pow(r, 1.0);

    return clamp(v, 0.0, 1.0);
  }


  /* ── Domain warp ─────────────────────────────────────────────
     Two-pass warp. Controls how fields fold and flow. */

  vec3 warp(vec3 p, float t, float ws) {
    vec3 w1 = vec3(
      fbmLow(p + vec3(t*0.38, t*0.25, t*0.17)),
      fbmLow(p + vec3(t*0.29, t*0.41, t*0.23) + 5.2),
      fbmLow(p + vec3(t*0.21, t*0.16, t*0.35) + 3.7)
    );
    vec3 p1 = p + w1 * ws;
    vec3 w2 = vec3(
      fbmLow(p1 + vec3(t*0.17, t*0.28, t*0.39) + 1.8),
      fbmLow(p1 + vec3(t*0.26, t*0.14, t*0.31) + 8.3),
      fbmLow(p1 + vec3(t*0.33, t*0.21, t*0.16) + 6.1)
    );
    return p1 + w2 * ws * 0.50;
  }


  /* ── Colour field: lobe + filament + halo ────────────────────
     lobeScale:     spatial scale of large lobe structure
     filamentScale: spatial scale of fine filaments (usually higher)
     warpAmt:       domain warp amplitude
     t:             time stream (each colour has its own)

     Returns a vec2: .x = lobe density, .y = filament brightness
     The calling code uses lobe to shape which regions are active,
     and filament for the fine thread structure within them. */

  vec2 chromaticField(vec3 p, float t, float lobeScale,
                      float filamentScale, float warpAmt) {
    vec3 wp    = warp(p * lobeScale,    t, warpAmt);
    vec3 wfp   = warp(p * filamentScale, t, warpAmt * 0.8);

    float lobe     = fbmLow(wp);
    float filament = fbmRidge(wfp);

    return vec2(lobe, filament);
  }


  /* ── Luminous filament compositor ────────────────────────────
     Takes lobe and filament density.
     Returns brightness with:
       - lobe gating: filaments only show inside lobe regions
       - tight bright core (high power curve)
       - wide soft halo (low power curve)
     The split between core and halo gives each thread its
     characteristic look: a brilliant spine with a glowing aura.

     ITERATION 32 COLOUR GRADE: core and halo AMPLITUDE increased
     (1.20→1.42, 0.35→0.52). The power curves themselves (2.5, 0.60)
     are UNCHANGED — this means the exact same pixels light up in
     the exact same spatial pattern (topology preserved exactly),
     they simply emit more light. The wider halo weight increase
     is what produces the requested "bloom around bright structures"
     and "glow around filament intersections" without any second
     render pass — it's a wider, brighter existing falloff, not a
     new blur. Values still clamp to 1.0, so voids remain exactly
     as dark as before (0 × any multiplier = 0). */

  float compositeFilament(vec2 cf) {
    float lobe = smoothstep(0.28, 0.72, cf.x);    // gate: inside active region — unchanged
    float fil  = cf.y * lobe;                      // filament masked by lobe — unchanged

    float core = pow(fil, 2.5) * 1.42;             // was 1.20 — tighter spine now more radiant
    float halo = pow(fil, 0.60) * 0.52;            // was 0.35 — wider aura, more bloom/glow
    return clamp(core + halo, 0.0, 1.0);
  }


  /* ── Local-contrast emission curve ───────────────────────────
     ITERATION 32: a pure colour-grading pass applied AFTER each
     filament value is computed. Standard smoothstep-shaped S-curve:
       v²(3-2v)
     This darkens low-mid values slightly (deepening near-black
     regions, preserving the void) while brightening high values
     (making already-bright filament cores punch harder). It is
     monotonic and v=0 always maps to 0 — it can never lift true
     black. This is exactly "local contrast" and "emissive intensity"
     grading — it does not touch any noise, warp, or coordinate
     function, only remaps the brightness that topology already
     produced. The ×1.08 gives a small emissive lift on top. */

  float emissiveGrade(float v) {
    float s = v * v * (3.0 - 2.0 * v);
    return clamp(s * 1.08, 0.0, 1.0);
  }


  /* ── Main ─────────────────────────────────────────────────── */

  void main() {

    float aspect = u_resolution.x / u_resolution.y;
    vec2  uv     = (vUv - 0.5) * vec2(aspect, 1.0);
    float dist   = length(uv);

    // Global field rotation (wonder → polarity)
    float rot  = u_time * 0.0024 + u_polarity * 1.57;
    float cosR = cos(rot), sinR = sin(rot);
    vec2  ruv  = vec2(uv.x*cosR - uv.y*sinR, uv.x*sinR + uv.y*cosR);

    // Base coordinate — immersed in field (scale > 1 = features larger than viewport)
    vec3 p = vec3(ruv * 0.88, u_time * 0.0072);

    // Warp amplitude — fear increases agitation
    float baseWarp = 0.52 + u_turbulence * 0.60;


    /* ════════════════════════════════════════════════════════════
       BLUE — calm, depth, breathing
       Scale oscillates (~8 min period): expands and contracts.
       When blue expands all other colours are pushed outward;
       when it contracts they rush back in.
       Gentle warp — blue resists distortion.
       ════════════════════════════════════════════════════════════ */

    float blueBreath = 0.62 + 0.18 * sin(u_time * 0.0128);
    vec2  cfBlue     = chromaticField(p, u_time * 0.28, blueBreath, blueBreath * 1.55, 0.38);
    float fBlue      = emissiveGrade(compositeFilament(cfBlue));


    /* ════════════════════════════════════════════════════════════
       MAGENTA — imagination, infiltration
       Coordinates seeded with blue lobe density offset —
       magenta is drawn into blue's topology, threading through
       and between its lobe structures.
       ════════════════════════════════════════════════════════════ */

    vec3 pMag = p + vec3(cfBlue.x * 0.50, cfBlue.x * 0.32, cfBlue.x * 0.21);
    pMag += vec3(6.28, 3.14, 9.42);
    vec2  cfMag  = chromaticField(pMag, u_time * 0.43, 0.78, 1.32, 0.50);
    float fMagenta = emissiveGrade(compositeFilament(cfMag));


    /* ════════════════════════════════════════════════════════════
       YELLOW — knowledge, illumination, radial bloom
       Coordinates compressed radially — structures are tighter
       near centre and more diffuse toward edges.
       High curiosity (u_activity) expands bloom aggressiveness.
       ════════════════════════════════════════════════════════════ */

    float bloomPull = 0.68 + u_activity * 0.42;
    vec3  pYel     = p * (1.0 - dist * 0.20 * bloomPull);
    pYel += vec3(2.71, 7.39, 4.67);
    vec2  cfYel  = chromaticField(pYel, u_time * 0.57, 0.92, 1.58, 0.46 + u_activity * 0.18);
    float fYellow = emissiveGrade(compositeFilament(cfYel)) * (0.70 + u_activity * 0.55);


    /* ════════════════════════════════════════════════════════════
       GREEN — life, recovery, regeneration
       Warp is INVERSELY proportional to fear:
         low fear  → high warp  → green spreads and fills
         high fear → low warp   → green compresses, holds territory
       After a crisis, as fear drops, green visibly expands.
       Hope (u_hope) amplifies green's recovery strength.
       ════════════════════════════════════════════════════════════ */

    float greenWarp = (0.62 - u_turbulence * 0.45) * (0.80 + u_hope * 0.40);
    greenWarp = max(greenWarp, 0.05);
    vec3 pGreen = p + vec3(4.18, 1.95, 6.87);
    vec2  cfGreen = chromaticField(pGreen, u_time * 0.35, 0.80, 1.40, greenWarp);
    float fGreen  = emissiveGrade(compositeFilament(cfGreen)) * (0.75 + u_hope * 0.40);


    /* ════════════════════════════════════════════════════════════
       RED — conflict, crisis, collective urgency
       ERUPTION MODEL:
       The noise field is always computed.
       Suppression exponent: mix(3.8, 0.5, u_fear)
         u_fear=0.0 → exponent 3.8 → red is nearly invisible
         u_fear=1.0 → exponent 0.5 → red blazes at full intensity
       Red also runs faster (time × 1.38) and with higher warp
       under fear — its eruptions are sudden, chaotic, urgent.
       During Global Events, u_pulse directly amplifies red.
       ════════════════════════════════════════════════════════════ */

    float redWarp = 0.48 + u_turbulence * 1.00;
    vec3  pRed   = p + vec3(8.73, 2.41, 5.95);
    vec2  cfRed  = chromaticField(pRed, u_time * 1.38, 1.08, 1.72, redWarp);
    float redRaw = compositeFilament(cfRed);

    float redExp = mix(3.8, 0.5, u_fear);
    float fRed   = pow(clamp(redRaw, 0.0, 1.0), redExp);
    fRed = emissiveGrade(fRed);          // grading only — eruption curve above is untouched
    fRed += u_pulse * 0.55 * redRaw;     // events amplify red directly — unchanged formula
    fRed  = clamp(fRed, 0.0, 1.0);


    /* ════════════════════════════════════════════════════════════
       COLOUR ASSEMBLY
       Each colour contributes at different relative weights:
       Blue and magenta are the dominant presences.
       Yellow is expressive — variable with curiosity.
       Green is quiet recovery — grows when fear recedes.
       Red is punctuation — barely there, then overwhelming.

       Additive blending produces emergent secondaries:
         Blue ∩ Magenta  → violet
         Blue ∩ Yellow   → cyan-chartreuse
         Magenta ∩ Yellow → orange-amber
         Green ∩ Yellow  → spring green
         Red ∩ Blue      → crimson-violet
         Red ∩ Magenta   → hot fuchsia
       None of these are designed. They arise from intersection.
       ════════════════════════════════════════════════════════════ */

    vec3 col = vec3(0.0);

    // ITERATION 32: emission weights raised ~18-20% per colour.
    // Same relative balance preserved (red still punches hardest,
    // green still quietest) — only overall radiance increased.
    col += u_blue    * fBlue    * 1.06;   // was 0.90
    col += u_magenta * fMagenta * 0.98;   // was 0.82
    col += u_yellow  * fYellow  * 0.93;   // was 0.78
    col += u_green   * fGreen   * 0.86;   // was 0.72
    col += u_red     * fRed     * 1.42;   // was 1.20 — red radiant, never maroon


    /* ── Intersection glow ─────────────────────────────────────
       ITERATION 32 addition — pure colour grading, no new noise
       sampling. Where two colour fields are simultaneously bright
       (their filament values both high), a small warm-white glow
       is added. This is the "glow around filament intersections"
       requested — physically analogous to how two overlapping
       light sources add up to a brighter, slightly desaturated
       point at their crossing, the way stained glass glows where
       two panes of coloured light overlap. Kept small (max ≈0.09)
       so it accents crossings without ever washing the field
       toward pastel — it only fires where fields already overlap,
       which is rare relative to the total field area. */
    float crossings =
        fBlue * fMagenta + fBlue * fYellow + fMagenta * fYellow +
        fGreen * fYellow  + fRed * fBlue    + fRed * fMagenta;
    col += vec3(1.00, 0.96, 0.90) * min(crossings * 0.11, 0.09);


    /* ── Background void ─────────────────────────────────────────
       Deep near-black between filaments.
       The darkness is what makes the filaments luminous.
       Without genuine voids, the field reads as coloured fog. */
    float total = fBlue + fMagenta + fYellow + fGreen + fRed;
    col += vec3(0.008, 0.005, 0.018) * clamp(1.0 - total * 0.80, 0.0, 1.0);


    /* ── Slow global breath ──────────────────────────────────────
       Two mutually irrational long periods.
       The field breathes rather than stays at fixed brightness. */
    float breath = 0.88 + 0.12 * sin(u_time * 0.00198);
    float breath2= 0.96 + 0.04 * sin(u_time * 0.00067);
    col *= breath * breath2 * u_intensity;


    /* ── Vignette ────────────────────────────────────────────────
       Felt rather than seen. Keeps focus in the field, not corners. */
    col *= 1.0 - smoothstep(0.42, 0.82, length(vUv - 0.5)) * 0.28;


    /* Global Event shockwave ring removed (Oct 2026) at the artist's
       request. Global Events still register in the colour field
       (u_pulse amplifies red) and in the audio, but no ring is drawn. */


    /* ── Tone mapping ────────────────────────────────────────────
       Reinhard at shoulder 0.42 — preserves vivid saturation
       in mid-range while preventing blow-out where filaments cross. */
    col = col / (col + 0.42);
    col = max(col, vec3(0.004));

    gl_FragColor = vec4(col, 1.0);
  }
`;


/* ============================================================
   4. FULLSCREEN QUAD
   ============================================================ */

const mesh = new THREE.Mesh(
  new THREE.PlaneGeometry(2, 2),
  new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms,
                              depthWrite: false, depthTest: false })
);
scene.add(mesh);


/* ============================================================
   5. SIGNAL CONTRACT — proxy objects unchanged
   ============================================================ */

const deepFieldUniforms = {
  u_time:           uniforms.u_time,
  u_intensity:      uniforms.u_intensity,
  u_turbulence:     uniforms.u_turbulence,
  u_polarity:       uniforms.u_polarity,
  u_primaryColor:   uniforms.u_blue,
  u_secondaryColor: uniforms.u_magenta,
  u_breathOffset:   { value: 0.0 },
  u_pulse:          uniforms.u_pulse,
  u_pulseAge:       uniforms.u_pulseAge,
  u_fear:           uniforms.u_fear,
  u_hope:           uniforms.u_hope,
};

const flowMembraneUniforms = {
  u_time:           uniforms.u_time,
  u_intensity:      uniforms.u_warmth,
  u_turbulence:     uniforms.u_turbulence,
  u_polarity:       uniforms.u_polarity,
  u_secondaryColor: uniforms.u_yellow,
  u_breathOffset:   { value: 2.39 },
};

const filamentUniforms = {
  u_time:           uniforms.u_time,
  u_intensity:      uniforms.u_activity,
  u_turbulence:     uniforms.u_turbulence,
  u_polarity:       uniforms.u_polarity,
  u_secondaryColor: uniforms.u_green,
  u_breathOffset:   { value: 4.97 },
};

const consciousnessUniforms = {
  deepField:    deepFieldUniforms,
  flowMembrane: flowMembraneUniforms,
  filaments:    filamentUniforms,
};


/* ============================================================
   6. RENDER LOOP
   ============================================================ */

let lastTime = null;

function animate(ts) {
  requestAnimationFrame(animate);
  if (lastTime === null) lastTime = ts;
  const dt = Math.min(ts - lastTime, 50);
  lastTime = ts;
  uniforms.u_time.value += dt * 0.001;
  if (window.planetarySignal) window.planetarySignal.tick(dt, performance.now());
  renderer.render(scene, camera);
}

requestAnimationFrame(animate);

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  uniforms.u_resolution.value.set(window.innerWidth, window.innerHeight);
});


/* ============================================================
   7. PUBLIC API
   ============================================================ */

function setConsciousnessEmotion(opts = {}) {
  if (opts.intensity   !== undefined) uniforms.u_intensity.value   = opts.intensity;
  if (opts.turbulence  !== undefined) uniforms.u_turbulence.value  = opts.turbulence;
  if (opts.polarity    !== undefined) uniforms.u_polarity.value    = opts.polarity;
  if (opts.primary     !== undefined) uniforms.u_blue.value.set(opts.primary);
  if (opts.secondary   !== undefined) uniforms.u_magenta.value.set(opts.secondary);
}

window.setConsciousnessEmotion = setConsciousnessEmotion;
window.consciousnessUniforms   = consciousnessUniforms;

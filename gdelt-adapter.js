/**
 * THE SECOND ATMOSPHERE — gdelt-adapter.js
 * ─────────────────────────────────────────────────────────────
 * Fetches Planetary Signal values from the GDELT Cloudflare Worker
 * and exposes them to signal.js with the same API surface that
 * the previous reddit-adapter.js provided.
 *
 * The Worker does the heavy lifting: querying GDELT, normalising
 * article counts, and detecting dominant emotional categories.
 * This file only fetches the Worker's pre-computed result,
 * manages client-side caching, and exposes window.gdeltAdapter.
 *
 * Configuration:
 *   Set WORKER_URL to your deployed Worker URL after running:
 *     wrangler deploy worker.js --name second-atmosphere-gdelt
 *   Leave as null to use simulated data (safe during development).
 *
 * Public API (consumed by signal.js — identical surface to reddit-adapter):
 *   gdeltAdapter.fetchSignal()  → Promise<Signal|null>
 *   gdeltAdapter.lastResult     → { signal, source, fetchedAt,
 *                                   articleCount, dominant }
 *   gdeltAdapter.configured     → boolean
 */

/* ============================================================
   CONFIGURATION
   Deploy worker.js as 'second-atmosphere-gdelt' then paste URL.
   ============================================================ */

const WORKER_URL = "https://second-atmosphere-gdelt.rsduffield.workers.dev";
// const WORKER_URL = 'https://second-atmosphere-gdelt.YOUR-NAME.workers.dev';


/* ============================================================
   CLIENT-SIDE CACHE
   15 minutes — matches GDELT's own update frequency and the
   Worker's edge cache TTL. No benefit refreshing more often.
   ============================================================ */

const CACHE_MS = 15 * 60 * 1000;

let _cache = {
  signal:       null,
  fetchedAt:    0,
  articleCount: 0,
  dominant:     'unknown',
  source:       'none',
};


/* ============================================================
   fetchSignal()
   Returns a Planetary Signal object or null on failure.
   signal.js falls back to simulation when null is returned.
   ============================================================ */

async function fetchSignal() {

  if (!WORKER_URL) return null;

  // Return cached result if still fresh
  if (_cache.signal && (Date.now() - _cache.fetchedAt) < CACHE_MS) {
    _cache.source = 'gdelt-cached';
    return _cache.signal;
  }

  let data;
  try {
    const res = await fetch(WORKER_URL, {
      headers: { 'Accept': 'application/json' },
      signal:  AbortSignal.timeout(12000), // GDELT can be slow — generous timeout
    });
    if (!res.ok) throw new Error(`Worker responded ${res.status}`);
    data = await res.json();
  } catch (err) {
    console.warn('[gdelt-adapter] Fetch failed:', err.message);
    if (_cache.signal) {
      _cache.source = 'gdelt-stale';
      return _cache.signal;
    }
    return null;
  }

  if (!data?.signal) {
    console.warn('[gdelt-adapter] Unexpected response shape');
    return null;
  }

  _cache = {
    signal:       data.signal,
    fetchedAt:    data.fetchedAt || Date.now(),
    articleCount: data.articleCount || 0,
    dominant:     data.dominant    || 'unknown',
    source:       'gdelt',
  };

  return _cache.signal;
}


/* ============================================================
   PUBLIC API
   ============================================================ */

window.gdeltAdapter = {
  fetchSignal,

  get lastResult() {
    return {
      signal:       _cache.signal,
      source:       _cache.source       || 'none',
      fetchedAt:    _cache.fetchedAt    || 0,
      articleCount: _cache.articleCount || 0,
      dominant:     _cache.dominant     || 'unknown',
    };
  },

  get configured() {
    return WORKER_URL !== null;
  },
};

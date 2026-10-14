/* ============================================================
   THE SECOND ATMOSPHERE — GDELT Worker (v5)

   Reads GDELT 2.0's 15-minute global event export: every news
   event worldwide, coded by type (CAMEO), class (QuadClass),
   stability (Goldstein scale) and attention (mentions).

   Output keeps the SAME payload shape as before, so the artwork's
   front end needs no changes. The five slot names are kept, but
   each is now driven by a real GDELT measure:

     attention  ← volume of world events this 15 minutes
                  (drives brightness)
     curiosity  ← VERBAL COOPERATION share
                  statements, appeals, meetings, diplomacy
                  (drives the cyan / blue fields opening out)
     hope       ← MATERIAL COOPERATION share
                  aid, trade, concessions, releases
                  (drives the amber field)
     fear       ← CONFLICT share: material conflict, plus half
                  weight for verbal conflict
                  sanctions, coercion, assault, fighting;
                  threats, protests, demands
                  (drives turbulence and the cold violet shift)
     wonder     ← STABILITY: mean Goldstein scale
                  stabilising world → higher, destabilising → lower
                  (drives rotation / blue-violet expansion)

   Each value: 50 = a typical 15 minutes for the world.
   Above 50 = more than usual; below 50 = less. Range 5–95.

   Events are weighted by log(mentions), so a widely reported
   event counts more than an obscure one, without one huge story
   swamping everything.
   ============================================================ */

const CACHE_TTL_SECONDS = 900;                 // GDELT updates every 15 min
const LAST_GOOD_TTL_SECONDS = 60 * 60 * 24 * 7;
const GDELT_TIMEOUT_MS = 15000;
const LASTUPDATE_URL = "http://data.gdeltproject.org/gdeltv2/lastupdate.txt";

/* Typical values for an ordinary 15 minutes (log-mention weighted).
   These set where "50" sits. They are starting estimates — the
   payload's `raw` block reports the live values so they can be
   tuned after watching it for a few days. */
const BASELINE = {
  events: 1400,          // events in one 15-minute export
  verbalCoop: 0.52,      // QuadClass 1
  materialCoop: 0.09,    // QuadClass 2
  conflict: 0.30,        // QuadClass 4 + 0.5 × QuadClass 3
  goldstein: 0.6,        // mean Goldstein scale
};

/* GDELT 2.0 event export column positions (tab-separated, 61 columns) */
const COL = { quadClass: 29, goldstein: 30, numMentions: 31, rootCode: 28 };
const EXPECTED_COLUMNS = 61;

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(), status: 204 });
    }
    if (request.method !== "GET") {
      return new Response("Method not allowed", { status: 405 });
    }

    const cache = caches.default;
    const primaryKey = new Request("https://cache.internal/gdelt-v5-primary", request);
    const lastGoodKey = new Request("https://cache.internal/gdelt-v5-lastgood", request);

    const primaryHit = await cache.match(primaryKey);
    if (primaryHit) {
      const res = new Response(primaryHit.body, primaryHit);
      res.headers.set("Access-Control-Allow-Origin", "*");
      res.headers.set("X-Cache", "HIT");
      return res;
    }

    let summary = null;
    try {
      summary = await fetchLatestEvents();
    } catch (err) {
      console.warn(`GDELT event export failed: ${err.message}`);
    }

    if (summary) {
      const payload = buildPayload(summary, "gdelt events");
      const primaryResponse = jsonResponse(payload, CACHE_TTL_SECONDS);
      ctx.waitUntil(cache.put(primaryKey, primaryResponse.clone()));
      ctx.waitUntil(cache.put(lastGoodKey, jsonResponse(payload, LAST_GOOD_TTL_SECONDS)));
      return withCacheHeader(primaryResponse, "MISS");
    }

    const lastGoodHit = await cache.match(lastGoodKey);
    if (lastGoodHit) {
      const data = await lastGoodHit.json();
      data.source = "gdelt stale fallback";
      const response = jsonResponse(data, 300);
      ctx.waitUntil(cache.put(primaryKey, response.clone()));
      return withCacheHeader(response, "MISS");
    }

    const response = jsonResponse(buildNeutralFallbackPayload(), 300);
    return withCacheHeader(response, "MISS");
  },
};

/* ── Fetch and parse the latest 15-minute export ───────────── */

async function fetchLatestEvents() {
  const listRes = await fetch(LASTUPDATE_URL, { signal: AbortSignal.timeout(GDELT_TIMEOUT_MS) });
  if (!listRes.ok) throw new Error(`lastupdate.txt HTTP ${listRes.status}`);
  const list = await listRes.text();

  // First line is the events export: "<size> <md5> <url>.export.CSV.zip"
  const exportLine = list.split("\n").find((l) => l.includes(".export.CSV.zip"));
  if (!exportLine) throw new Error("no export file listed in lastupdate.txt");
  const zipUrl = exportLine.trim().split(/\s+/).pop();

  const zipRes = await fetch(zipUrl, { signal: AbortSignal.timeout(GDELT_TIMEOUT_MS) });
  if (!zipRes.ok) throw new Error(`export zip HTTP ${zipRes.status}`);
  const zipBytes = new Uint8Array(await zipRes.arrayBuffer());

  const csv = await unzipFirstFile(zipBytes);
  const summary = summariseEvents(csv);
  summary.exportFile = zipUrl.split("/").pop();
  return summary;
}

/* Minimal ZIP reader: finds the first file via the central directory
   and inflates it with the runtime's built-in DecompressionStream. */
async function unzipFirstFile(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // End of central directory record: search backwards for signature
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("zip: end of central directory not found");

  const cdOffset = view.getUint32(eocd + 16, true);
  if (view.getUint32(cdOffset, true) !== 0x02014b50) throw new Error("zip: bad central directory");

  const method = view.getUint16(cdOffset + 10, true);
  const compSize = view.getUint32(cdOffset + 20, true);
  const localOffset = view.getUint32(cdOffset + 42, true);

  if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error("zip: bad local header");
  const nameLen = view.getUint16(localOffset + 26, true);
  const extraLen = view.getUint16(localOffset + 28, true);
  const start = localOffset + 30 + nameLen + extraLen;
  const data = bytes.subarray(start, start + compSize);

  if (method === 0) return new TextDecoder().decode(data);
  if (method !== 8) throw new Error(`zip: unsupported compression method ${method}`);

  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return await new Response(stream).text();
}

/* ── Turn raw events into the world's balance ──────────────── */

function summariseEvents(csv) {
  const quadWeight = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const quadCount = { 1: 0, 2: 0, 3: 0, 4: 0 };
  let totalWeight = 0;
  let goldsteinSum = 0;
  let events = 0;

  for (const line of csv.split("\n")) {
    if (!line) continue;
    const f = line.split("\t");
    if (f.length < EXPECTED_COLUMNS) continue;

    const quad = parseInt(f[COL.quadClass], 10);
    if (!(quad >= 1 && quad <= 4)) continue;
    const goldstein = parseFloat(f[COL.goldstein]);
    const mentions = parseInt(f[COL.numMentions], 10) || 1;

    const w = Math.log2(1 + mentions);
    quadWeight[quad] += w;
    quadCount[quad] += 1;
    totalWeight += w;
    if (Number.isFinite(goldstein)) goldsteinSum += goldstein * w;
    events += 1;
  }

  if (events === 0 || totalWeight === 0) throw new Error("no usable events in export");

  return {
    events,
    shares: {
      verbalCoop: quadWeight[1] / totalWeight,
      materialCoop: quadWeight[2] / totalWeight,
      verbalConflict: quadWeight[3] / totalWeight,
      materialConflict: quadWeight[4] / totalWeight,
    },
    quadCount,
    goldsteinMean: goldsteinSum / totalWeight,
  };
}

/* Ratio to baseline on a log scale: 50 at baseline, ±35 per doubling */
function relative(value, baseline) {
  const ratio = Math.max(value, 1e-6) / baseline;
  return clampSignal(50 + 35 * Math.log2(ratio));
}

function clampSignal(v) {
  return Math.round(Math.min(95, Math.max(5, v)));
}

function buildPayload(summary, source) {
  const { events, shares, quadCount, goldsteinMean } = summary;
  const conflict = shares.materialConflict + 0.5 * shares.verbalConflict;

  const signal = {
    attention: relative(events, BASELINE.events),
    curiosity: relative(shares.verbalCoop, BASELINE.verbalCoop),
    hope: relative(shares.materialCoop, BASELINE.materialCoop),
    fear: relative(conflict, BASELINE.conflict),
    // Goldstein runs −10…+10; ±3.5 around baseline spans the full range
    wonder: clampSignal(50 + (goldsteinMean - BASELINE.goldstein) * 12),
  };

  // Dominant = the dimension furthest from its ordinary state
  const dims = ["fear", "hope", "curiosity", "wonder"];
  const dominant = dims.reduce((best, d) =>
    Math.abs(signal[d] - 50) > Math.abs(signal[best] - 50) ? d : best, dims[0]);

  return {
    signal,
    articleCount: events,
    dominant,
    counts: {
      verbalCooperation: quadCount[1],
      materialCooperation: quadCount[2],
      verbalConflict: quadCount[3],
      materialConflict: quadCount[4],
    },
    raw: {
      shares: roundAll(shares),
      goldsteinMean: round3(goldsteinMean),
      exportFile: summary.exportFile,
      baseline: BASELINE,
    },
    mapping: {
      attention: "volume of world events",
      curiosity: "verbal cooperation",
      hope: "material cooperation",
      fear: "conflict (material + half verbal)",
      wonder: "stability (Goldstein scale)",
    },
    succeeded: 1,
    fetchedAt: Date.now(),
    source,
  };
}

function buildNeutralFallbackPayload() {
  return {
    signal: { attention: 50, fear: 50, hope: 50, curiosity: 50, wonder: 50 },
    articleCount: 0,
    dominant: "unknown",
    counts: {},
    succeeded: 0,
    fetchedAt: Date.now(),
    source: "gdelt neutral fallback",
  };
}

/* ── Helpers ───────────────────────────────────────────────── */

function round3(n) { return Math.round(n * 1000) / 1000; }
function roundAll(obj) {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, round3(v)]));
}

function jsonResponse(payload, maxAgeSeconds) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json",
      "Cache-Control": `public, max-age=${maxAgeSeconds}`,
    },
  });
}

function withCacheHeader(response, value) {
  const res = new Response(response.body, response);
  res.headers.set("X-Cache", value);
  return res;
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

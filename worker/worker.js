/* ============================================================
   THE SECOND ATMOSPHERE — GDELT Worker (v6)

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

   HISTORY (v6)
     GET /history?at=YYYYMMDDHHMMSS&year=YYYY
       The same 15-minute slot as `at` (the live export's timestamp),
       in an earlier year, back to 2015. Same payload shape as the
       live route, plus `year` and `slot`. Archive slots never change,
       so each one is cached at the edge for 30 days.
     GET /calibrate?year=YYYY
       Samples eight slots across that year and returns its typical
       values, to paste into YEAR_BASELINES below. GDELT's coverage
       has changed over the years, so each year is measured against
       its own ordinary, not against today's.
   ============================================================ */

const CACHE_TTL_SECONDS = 900;                 // GDELT updates every 15 min
const LAST_GOOD_TTL_SECONDS = 60 * 60 * 24 * 7;
const GDELT_TIMEOUT_MS = 15000;
const LASTUPDATE_URL = "http://data.gdeltproject.org/gdeltv2/lastupdate.txt";

/* Typical values for an ordinary 15 minutes in the present
   (log-mention weighted). These set where "50" sits for the live
   field. Measured with /calibrate?year=2026 on 15 Oct 2026, the same
   way as each earlier year's YEAR_BASELINES, so the present and the
   past are judged alike. The payload's `raw` block reports live values
   if they need re-measuring later. */
const BASELINE = {
  events: 991,           // events in one 15-minute export
  verbalCoop: 0.617,     // QuadClass 1
  materialCoop: 0.115,   // QuadClass 2
  conflict: 0.205,       // QuadClass 4 + 0.5 × QuadClass 3
  goldstein: 0.592,      // mean Goldstein scale
};

/* Each year's ordinary 15 minutes, from /calibrate. Until a year is
   filled in it falls back to BASELINE. Shares and Goldstein carry
   across years reasonably well; raw event volume does not, so
   `events` matters most here. */
const YEAR_BASELINES = {
  // Measured 15 Oct 2026 with /calibrate (8 slots per year; 2020 had 7)
  2015: { events: 1844, verbalCoop: 0.599, materialCoop: 0.127, conflict: 0.211, goldstein: 0.481 },
  2016: { events: 1778, verbalCoop: 0.656, materialCoop: 0.101, conflict: 0.187, goldstein: 0.777 },
  2017: { events: 1600, verbalCoop: 0.571, materialCoop: 0.103, conflict: 0.255, goldstein: -0.108 },
  2018: { events: 1796, verbalCoop: 0.606, materialCoop: 0.124, conflict: 0.204, goldstein: 0.562 },
  2019: { events: 1839, verbalCoop: 0.604, materialCoop: 0.118, conflict: 0.210, goldstein: 0.495 },
  2020: { events: 1457, verbalCoop: 0.636, materialCoop: 0.111, conflict: 0.185, goldstein: 0.813 },
  2021: { events: 1201, verbalCoop: 0.588, materialCoop: 0.112, conflict: 0.231, goldstein: 0.237 },
  2022: { events: 962,  verbalCoop: 0.622, materialCoop: 0.119, conflict: 0.193, goldstein: 0.720 },
  2023: { events: 1214, verbalCoop: 0.601, materialCoop: 0.112, conflict: 0.225, goldstein: 0.196 },
  2024: { events: 1267, verbalCoop: 0.611, materialCoop: 0.128, conflict: 0.195, goldstein: 0.677 },
  2025: { events: 1243, verbalCoop: 0.627, materialCoop: 0.120, conflict: 0.191, goldstein: 0.770 },
};

const ARCHIVE_URL = "http://data.gdeltproject.org/gdeltv2/";
const ARCHIVE_START = "20150218230000";        // first GDELT 2.0 export
const HISTORY_TTL_SECONDS = 60 * 60 * 24 * 30; // archive slots are immutable
const SLOT_NEIGHBOURS_MIN = [0, -15, 15];      // archive has occasional gaps

/* GDELT 2.0 event export column positions (tab-separated, 61 columns) */
const COL = { quadClass: 29, goldstein: 30, numMentions: 31, rootCode: 28 };
const EXPECTED_COLUMNS = 61;

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(), status: 204 });
    }
    const path = new URL(request.url).pathname;
    if (path === "/archive") return handleArchive(request, env);
    if (request.method !== "GET") {
      return new Response("Method not allowed", { status: 405 });
    }

    const url = new URL(request.url);
    if (url.pathname === "/history") return handleHistory(url, ctx);
    if (url.pathname === "/calibrate") return handleCalibrate(url, ctx);

    const cache = caches.default;
    const primaryKey = new Request("https://cache.internal/gdelt-v6-primary", request);
    const lastGoodKey = new Request("https://cache.internal/gdelt-v6-lastgood", request);

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

  return summariseExport(zipUrl);
}

async function summariseExport(zipUrl) {
  const zipRes = await fetch(zipUrl, { signal: AbortSignal.timeout(GDELT_TIMEOUT_MS) });
  if (!zipRes.ok) throw new Error(`export zip HTTP ${zipRes.status}`);
  const zipBytes = new Uint8Array(await zipRes.arrayBuffer());

  const csv = await unzipFirstFile(zipBytes);
  const summary = summariseEvents(csv);
  summary.exportFile = zipUrl.split("/").pop();
  return summary;
}

/* ── History: the same moment in an earlier year ───────────── */

async function handleHistory(url, ctx) {
  const at = url.searchParams.get("at") || "";
  const year = parseInt(url.searchParams.get("year"), 10);
  const thisYear = new Date().getUTCFullYear();

  if (!/^\d{14}$/.test(at) || !/^(00|15|30|45)00$/.test(at.slice(10))) {
    return errorResponse("`at` must be a 15-minute GDELT timestamp, e.g. 20261015093000", 400);
  }
  if (!(year >= 2015 && year < thisYear)) {
    return errorResponse(`\`year\` must be 2015–${thisYear - 1}`, 400);
  }

  const slot = sameMomentIn(year, at);
  if (slot < ARCHIVE_START) return errorResponse("before the GDELT 2.0 archive begins", 404);

  const cache = caches.default;
  const key = new Request(`https://cache.internal/gdelt-v6b-history/${slot}`);
  const hit = await cache.match(key);
  if (hit) return withCacheHeader(new Response(hit.body, hit), "HIT");

  for (const offset of SLOT_NEIGHBOURS_MIN) {
    const tryStamp = shiftStamp(slot, offset);
    try {
      const summary = await summariseExport(`${ARCHIVE_URL}${tryStamp}.export.CSV.zip`);
      const baseline = { ...BASELINE, ...(YEAR_BASELINES[year] || {}) };
      const payload = buildPayload(summary, `gdelt ${year}`, baseline);
      payload.year = year;
      payload.slot = tryStamp;
      payload.calibrated = Boolean(YEAR_BASELINES[year]);

      const toCache = jsonResponse(payload, HISTORY_TTL_SECONDS);
      ctx.waitUntil(cache.put(key, toCache.clone()));
      return withCacheHeader(jsonResponse(payload, 60 * 60 * 24), "MISS");
    } catch (err) {
      console.warn(`history ${tryStamp}: ${err.message}`);
    }
  }
  return errorResponse(`no archive export near ${slot}`, 404);
}

/* Same month, day and time of day in `year` (29 Feb → 28 Feb). */
function sameMomentIn(year, stamp) {
  let monthDay = stamp.slice(4, 8);
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  if (monthDay === "0229" && !leap) monthDay = "0228";
  return `${year}${monthDay}${stamp.slice(8)}`;
}

function shiftStamp(stamp, minutes) {
  const d = new Date(Date.UTC(
    +stamp.slice(0, 4), +stamp.slice(4, 6) - 1, +stamp.slice(6, 8),
    +stamp.slice(8, 10), +stamp.slice(10, 12) + minutes, 0));
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
         `${p(d.getUTCHours())}${p(d.getUTCMinutes())}00`;
}

/* ── Calibration: a year's ordinary 15 minutes ─────────────── */

async function handleCalibrate(url, ctx) {
  const year = parseInt(url.searchParams.get("year"), 10);
  if (!(year >= 2015 && year <= new Date().getUTCFullYear())) {
    return errorResponse("`year` must be 2015 or later", 400);
  }

  const cache = caches.default;
  const key = new Request(`https://cache.internal/gdelt-v6-calibrate/${year}`);
  const hit = await cache.match(key);
  if (hit) return withCacheHeader(new Response(hit.body, hit), "HIT");

  // Eight slots spread across the year and across the clock
  const months = year === 2015 ? [3, 4, 5, 6, 7, 8, 10, 11] : [1, 2, 4, 5, 7, 8, 10, 11];
  const hours = ["0300", "0930", "1600", "2215"];
  const p = (n) => String(n).padStart(2, "0");
  const stamps = months.map((m, i) => `${year}${p(m)}15${hours[i % 4]}00`);

  const results = await Promise.allSettled(
    stamps.map((s) => summariseExport(`${ARCHIVE_URL}${s}.export.CSV.zip`)));
  const ok = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
  if (ok.length === 0) return errorResponse("no samples could be read", 502);

  const mean = (f) => ok.reduce((a, s) => a + f(s), 0) / ok.length;
  const baseline = {
    events: Math.round(mean((s) => s.events)),
    verbalCoop: round3(mean((s) => s.shares.verbalCoop)),
    materialCoop: round3(mean((s) => s.shares.materialCoop)),
    conflict: round3(mean((s) => s.shares.materialConflict + 0.5 * s.shares.verbalConflict)),
    goldstein: round3(mean((s) => s.goldsteinMean)),
  };

  const response = jsonResponse({ year, samples: ok.length, baseline }, HISTORY_TTL_SECONDS);
  ctx.waitUntil(cache.put(key, response.clone()));
  return withCacheHeader(response, "MISS");
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

function buildPayload(summary, source, baseline = BASELINE) {
  const { events, shares, quadCount, goldsteinMean } = summary;
  const conflict = shares.materialConflict + 0.5 * shares.verbalConflict;

  const signal = {
    attention: relative(events, baseline.events),
    curiosity: relative(shares.verbalCoop, baseline.verbalCoop),
    hope: relative(shares.materialCoop, baseline.materialCoop),
    fear: relative(conflict, baseline.conflict),
    // Goldstein runs −10…+10; ±3.5 around baseline spans the full range
    wonder: clampSignal(50 + (goldsteinMean - baseline.goldstein) * 12),
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
      baseline,
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

function errorResponse(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
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
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}


/* ============================================================
   THE VISITORS' ARCHIVE — /archive
   ============================================================
   A second archive, kept by people rather than read by machines.
   A visitor leaves one word for today and says whether the day
   feels heavy or light (tone 0–100). Entries accumulate in D1
   (binding VISITORS, database second-atmosphere-visitors) and
   become the field's sixth signal.

   GET  /archive              → { count, tone, recent: [{word, tone, at, place}] }
   POST /archive {word, tone, place}

   One entry per visitor per 20 seconds. Words are one word,
   letters only, up to 24 characters. Anything on BLOCKED is kept
   but hidden (hidden = 1), so the record stays whole while the
   screen stays clean. To hide an entry by hand:
     UPDATE entries SET hidden = 1 WHERE id = …;
   ============================================================ */

const ARCHIVE_MIN_GAP_MS = 20 * 1000;
const WORD_PATTERN = /^[\p{L}][\p{L}\p{M}'’-]{0,23}$/u;
// Extend as needed; matched against the lower-cased word, whole or as a stem.
const BLOCKED = ["fuck", "shit", "cunt", "bitch", "nazi", "hitler", "rape", "porn", "fick", "scheiss", "scheiß", "hure", "wichser", "fotze"];

async function handleArchive(request, env) {
  const db = env.VISITORS;
  if (!db) return archiveJson({ error: "archive not configured" }, 503);

  if (request.method === "GET") {
    const [countRow, toneRow, recent] = await Promise.all([
      db.prepare("SELECT COUNT(*) AS n FROM entries").first(),
      db.prepare("SELECT AVG(tone) AS t FROM (SELECT tone FROM entries ORDER BY id DESC LIMIT 60)").first(),
      db.prepare("SELECT word, tone, at, place FROM entries WHERE hidden = 0 ORDER BY id DESC LIMIT 24").all(),
    ]);
    return archiveJson({
      count:  countRow?.n || 0,
      tone:   toneRow?.t == null ? 50 : Math.round(toneRow.t),
      recent: recent.results || [],
    }, 200, 10);
  }

  if (request.method !== "POST") return archiveJson({ error: "method not allowed" }, 405);

  let body;
  try { body = await request.json(); } catch { return archiveJson({ error: "bad request" }, 400); }

  const word = String(body?.word || "").trim().normalize("NFC");
  const tone = Math.round(Number(body?.tone));
  const place = body?.place === "gallery" ? "gallery" : "web";
  if (!WORD_PATTERN.test(word)) return archiveJson({ error: "one word, letters only" }, 400);
  if (!Number.isFinite(tone) || tone < 0 || tone > 100) return archiveJson({ error: "tone 0–100" }, 400);

  const who = await visitorHash(request);
  const now = Date.now();
  const last = await db.prepare("SELECT at FROM entries WHERE who = ? ORDER BY at DESC LIMIT 1").bind(who).first();
  if (last && now - last.at < ARCHIVE_MIN_GAP_MS) return archiveJson({ error: "a moment, please" }, 429);

  const lower = word.toLowerCase();
  const hidden = BLOCKED.some(b => lower.includes(b)) ? 1 : 0;
  await db.prepare("INSERT INTO entries (at, word, tone, place, who, hidden) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(now, word, tone, place, who, hidden).run();
  const n = await db.prepare("SELECT COUNT(*) AS n FROM entries").first();
  return archiveJson({ ok: true, count: n?.n || 0, word: hidden ? null : word }, 201);
}

/* A daily-salted hash of the visitor's address: enough to slow
   repeat posting, without keeping the address itself. */
async function visitorHash(request) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const day = new Date().toISOString().slice(0, 10);
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${day}|${ip}|second-atmosphere`));
  return [...new Uint8Array(buf)].slice(0, 12).map(b => b.toString(16).padStart(2, "0")).join("");
}

function archiveJson(data, status = 200, maxAge = 0) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json",
      "Cache-Control": maxAge ? `public, max-age=${maxAge}` : "no-store",
    },
  });
}

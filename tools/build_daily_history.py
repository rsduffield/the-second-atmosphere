#!/usr/bin/env python3
"""
THE SECOND ATMOSPHERE — build_daily_history.py

Builds the field's long memory: one value per day from 1979 to 2014,
from GDELT 1.0's event archive. Run by the GitHub Action in
.github/workflows/daily-history.yml (the archive is several GB, far too
large to read live), it writes small files the artwork reads directly:

    history/daily/MMDD.json   {"1979": [attention, curiosity, hope, fear, wonder], ...}
    history/daily/years.json  each year's ordinary day (its baseline)

The five values use the same GDELT measures and the same scale as the
live Worker (50 = an ordinary day *for that year*), so each year is
measured against its own norms — GDELT's coverage of 1979 is a fraction
of its coverage of 2014.

Sources (from http://data.gdeltproject.org/events/index.html):
    1979.zip … 2005.zip          one file per year     — grouped by event date
    200601.zip … 201303.zip      one file per month    — grouped by event date
    20130401.export.CSV.zip …    one file per day      — grouped by the day it was reported
(2015 onward comes from GDELT 2.0 via the Worker's /history route.)
"""

import io
import json
import math
import os
import re
import sys
import tempfile
import urllib.request
import zipfile
from concurrent.futures import ProcessPoolExecutor, as_completed

BASE = "http://data.gdeltproject.org/events/"
FIRST_YEAR, LAST_YEAR = 1979, 2014
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "history", "daily")

# GDELT 1.0 event columns (same positions as GDELT 2.0's export)
SQLDATE, QUAD, GOLDSTEIN, MENTIONS = 1, 29, 30, 31

# Per day: [events, totalWeight, w_q1, w_q2, w_q3, w_q4, goldsteinWeighted]
def empty():
    return [0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]


def list_sources(index_html):
    names = set(re.findall(r'HREF="([^"]+\.zip)"', index_html, re.I))
    sources = []
    for n in names:
        if re.fullmatch(r"\d{4}\.zip", n) and FIRST_YEAR <= int(n[:4]) <= LAST_YEAR:
            sources.append((n, "event", n[:4]))
        elif re.fullmatch(r"\d{6}\.zip", n) and int(n[:4]) <= LAST_YEAR:
            sources.append((n, "event", n[:6]))
        elif re.fullmatch(r"\d{8}\.export\.CSV\.zip", n) and int(n[:4]) <= LAST_YEAR:
            sources.append((n, "reported", n[:8]))
    return sorted(sources)


def summarise_lines(lines, mode, key):
    """mode 'event': group by SQLDATE within the file's period (key = YYYY or YYYYMM).
       mode 'reported': the whole file is one day (key = YYYYMMDD)."""
    days = {}
    for raw in lines:
        f = raw.split(b"\t")
        if len(f) <= MENTIONS:
            continue
        try:
            quad = int(f[QUAD])
        except ValueError:
            continue
        if not 1 <= quad <= 4:
            continue
        if mode == "event":
            day = f[SQLDATE].decode("ascii", "ignore")
            if len(day) != 8 or not day.startswith(key):
                continue
        else:
            day = key
        try:
            mentions = int(f[MENTIONS]) or 1
        except ValueError:
            mentions = 1
        try:
            g = float(f[GOLDSTEIN])
        except ValueError:
            g = None
        w = math.log2(1 + mentions)
        d = days.get(day)
        if d is None:
            d = days[day] = empty()
        d[0] += 1
        d[1] += w
        d[1 + quad] += w
        if g is not None and math.isfinite(g):
            d[6] += g * w
    return days


def process(source):
    name, mode, key = source
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, name)
        for attempt in range(3):
            try:
                urllib.request.urlretrieve(BASE + name, path)
                break
            except Exception as e:
                if attempt == 2:
                    print(f"  ! {name}: {e}", flush=True)
                    return name, {}
        with zipfile.ZipFile(path) as z:
            with z.open(z.namelist()[0]) as fh:
                days = summarise_lines(io.BufferedReader(fh, 1 << 20), mode, key)
    print(f"  {name}: {len(days)} days", flush=True)
    return name, days


def merge(into, days):
    for day, v in days.items():
        d = into.setdefault(day, empty())
        for i in range(7):
            d[i] += v[i]


def measures(d):
    w = d[1]
    return {
        "events": d[0],
        "verbalCoop": d[2] / w,
        "materialCoop": d[3] / w,
        "conflict": (d[5] + 0.5 * d[4]) / w,
        "goldstein": d[6] / w,
    }


def clamp(v):
    return int(round(min(95, max(5, v))))


def relative(v, b):
    return clamp(50 + 35 * math.log2(max(v, 1e-6) / b))


def build(all_days):
    by_year = {}
    for day, d in all_days.items():
        if d[0] >= 20 and d[1] > 0:             # too few events to mean anything
            by_year.setdefault(day[:4], {})[day[4:]] = measures(d)

    baselines, by_date = {}, {}
    for year, days in sorted(by_year.items()):
        n = len(days)
        base = {k: sum(m[k] for m in days.values()) / n for k in
                ("events", "verbalCoop", "materialCoop", "conflict", "goldstein")}
        baselines[year] = {k: round(v, 4) for k, v in base.items()} | {"days": n}

        for mmdd, m in days.items():
            by_date.setdefault(mmdd, {})[year] = [
                relative(m["events"], base["events"]),          # attention
                relative(m["verbalCoop"], base["verbalCoop"]),  # curiosity
                relative(m["materialCoop"], base["materialCoop"]),  # hope
                relative(m["conflict"], base["conflict"]),      # fear
                clamp(50 + (m["goldstein"] - base["goldstein"]) * 12),  # wonder
            ]

        leap = int(year) % 4 == 0 and (int(year) % 100 != 0 or int(year) % 400 == 0)
        if not leap and "0228" in days:             # 29 Feb visitors still meet this year
            by_date.setdefault("0229", {})[year] = by_date["0228"][year]

    return baselines, by_date


def write(baselines, by_date):
    os.makedirs(OUT_DIR, exist_ok=True)
    for mmdd, years in by_date.items():
        with open(os.path.join(OUT_DIR, f"{mmdd}.json"), "w") as fh:
            json.dump(dict(sorted(years.items())), fh, separators=(",", ":"))
    with open(os.path.join(OUT_DIR, "years.json"), "w") as fh:
        json.dump(baselines, fh, indent=1)


def main():
    index = urllib.request.urlopen(BASE + "index.html", timeout=60).read().decode("utf-8", "ignore")
    sources = list_sources(index)
    print(f"{len(sources)} archive files to read", flush=True)
    if not sources:
        sys.exit("no archive files found in the index")

    all_days = {}
    with ProcessPoolExecutor(max_workers=int(os.environ.get("WORKERS", "4"))) as pool:
        for fut in as_completed([pool.submit(process, s) for s in sources]):
            merge(all_days, fut.result()[1])

    baselines, by_date = build(all_days)
    write(baselines, by_date)
    print(f"wrote {len(by_date)} dates across {len(baselines)} years", flush=True)


if __name__ == "__main__":
    main()

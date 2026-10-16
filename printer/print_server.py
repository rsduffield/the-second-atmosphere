#!/usr/bin/env python3
"""
THE SECOND ATMOSPHERE — print_server.py
─────────────────────────────────────────────────────────────
The physical trace. Receives one line for every year the field passes
through (and every word a visitor leaves) from printer.js and prints
it on a thermal receipt printer. The paper is never cut: it runs off
the printer and piles up on the floor across the exhibition.

No dependencies beyond Python 3. Speaks plain ESC/POS, which almost
every receipt printer understands (Epson TM series, the Adafruit /
Cashino CSN-A2 mini printers, most 58 mm and 80 mm USB printers).

    python3 print_server.py --dry-run                    # print to the terminal
    python3 print_server.py --device /dev/usb/lp0        # USB printer (Linux / Raspberry Pi)
    python3 print_server.py --device /dev/serial0        # serial printer, e.g. Adafruit on a Pi
    python3 print_server.py --device /dev/usb/lp0 --columns 48   # 80 mm paper

For a serial printer set the speed first:  stty -F /dev/serial0 19200
(the Adafruit printer's label says 9600 or 19200).

Then open the artwork with ?printer (or ?printer=http://HOST:8787 if
this runs on a different machine from the browser).

Every line is also appended to the log (archive-print.log by default),
so the paper and the file are the same record.

What a line looks like (42 columns, 58 mm paper in the small font):

         VOL    VERB   MATL   CONF   STAB   REC
    1979 ███▒   ███    ███▒   ███    ███     ░
    1980 ████▒  ███    ██▓    ███▒   ██▓     ░

Each bar is one GDELT measure for that year (50 = an ordinary day for
that year; departures from 50 drawn 1.8 times larger): volume of events, verbal cooperation, material
cooperation, conflict, stability. REC is how thick the record is:
░ ▒ ▓ █ from about a thousand events a day to well over a hundred
thousand. Future years print with ? in place of the record.
"""

import argparse
import datetime as dt
import json
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ESC = b"\x1b"
GS = b"\x1d"

SIGNALS = ("attention", "curiosity", "hope", "fear", "wonder")
HEADS = ("VOL", "VERB", "MATL", "CONF", "STAB")   # the GDELT measure behind each signal
PARTS = " ░▒▓"                                      # quarter steps: code page 437, which every printer has


class Layout:
    """Turns field events into lines of text. Owns the look of the paper."""

    def __init__(self, columns):
        self.columns = columns
        # year and a space (5), five bars with a space between (4), then "  REC" (5)
        self.bar = max(3, (columns - 5 - 4 - 5) // 5)
        self.last_slot = None

    def bar_of(self, value):
        # Most years sit within a few points of an ordinary 50, so
        # departures are drawn 1.8 times larger to read on the paper
        value = max(0.0, min(100.0, 50 + (float(value) - 50) * 1.8))
        parts = PARTS
        steps = len(parts)
        q = round(value / 100 * self.bar * steps)
        full, part = divmod(q, steps)
        full = min(full, self.bar)
        text = "█" * full + (parts[part] if full < self.bar and part else "")
        return text.ljust(self.bar)

    @staticmethod
    def record_of(events_per_day):
        if events_per_day is None:
            return "?"
        if events_per_day < 5_000:
            return "░"
        if events_per_day < 25_000:
            return "▒"
        if events_per_day < 100_000:
            return "▓"
        return "█"

    def rule(self, ch="─"):
        return ch * self.columns

    def heading(self):
        cells = " ".join(h[: self.bar].ljust(self.bar) for h in HEADS)
        return ("     " + cells + "  REC")[: self.columns]

    def year_line(self, year, values, events_per_day, future=False):
        label = str(year)   # a future year is marked by ? in the REC column
        bars = " ".join(self.bar_of(values.get(k, 50)) for k in SIGNALS)
        line = f"{label} {bars}   {self.record_of(None if future else events_per_day)}"   # under the E of REC
        return line[: self.columns]

    def lines_for(self, item):
        """Returns a list of (text, style) for one event. style: '', 'bold', 'small'."""
        kind = item.get("kind")
        out = []
        if kind == "present":
            slot = item.get("slot") or ""
            when = dt.datetime.now(dt.timezone.utc)
            if slot != self.last_slot:
                # A new 15-minute window: a header, then the present
                self.last_slot = slot
                if len(slot) >= 12:
                    when = dt.datetime.strptime(slot[:12], "%Y%m%d%H%M").replace(tzinfo=dt.timezone.utc)
                out += [("", ""), (self.rule(), ""),
                        ("THE SECOND ATMOSPHERE", "bold"),
                        (when.strftime("%d %b %Y  %H:%M UTC"), ""),
                        (self.heading(), "small")]
                out.append((self.year_line(item["year"], item["values"], item.get("eventsPerDay")), ""))
            else:
                # The journey has come back round to the present
                out.append((f"{item['year']} now".ljust(self.columns), "small"))
                out.append((self.year_line(item["year"], item["values"], item.get("eventsPerDay")), ""))
        elif kind == "year":
            future = item.get("phase") == "future"
            out.append((self.year_line(item["year"], item["values"], item.get("eventsPerDay"), future), ""))
        elif kind == "word":
            tone = item.get("tone", 50)
            feel = "heavy" if tone < 35 else "light" if tone > 65 else "between"
            word = str(item.get("word", ""))[:24]
            out.append((f'     "{word}"  {feel}'[: self.columns], "bold"))
        return out


class Printer:
    def __init__(self, device, dry_run, columns, log_path):
        self.device = device
        self.dry_run = dry_run
        self.small_font = columns > 32
        self.log = Path(log_path)
        self.lock = threading.Lock()
        self.handle = None
        if device and not dry_run:
            self.handle = open(device, "wb", buffering=0)
            self.handle.write(ESC + b"@")                  # initialise
            self.handle.write(ESC + b"t" + b"\x00")        # code page 437: ░ ▒ ▓ █
            if self.small_font:
                self.handle.write(ESC + b"M" + b"\x01")    # font B: 42 columns on 58 mm

    def emit(self, lines):
        with self.lock:
            with self.log.open("a", encoding="utf-8") as log:
                for text, _ in lines:
                    log.write(text + "\n")
            if self.dry_run or not self.handle:
                for text, style in lines:
                    print(f"\033[1m{text}\033[0m" if style == "bold" else text, flush=True)
                return
            for text, style in lines:
                if style == "bold":
                    self.handle.write(ESC + b"E\x01")
                data = text.encode("cp437", errors="replace")
                self.handle.write(data + b"\n")
                if style == "bold":
                    self.handle.write(ESC + b"E\x00")


def make_handler(layout, printer):
    class Handler(BaseHTTPRequestHandler):
        def _cors(self):
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            # Chrome asks before a public page may reach a local address
            self.send_header("Access-Control-Allow-Private-Network", "true")

        def do_OPTIONS(self):
            self.send_response(204)
            self._cors()
            self.end_headers()

        def do_GET(self):
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"The Second Atmosphere print server is listening.\n")

        def do_POST(self):
            if self.path != "/line":
                self.send_response(404)
                self._cors()
                self.end_headers()
                return
            try:
                length = min(int(self.headers.get("Content-Length", 0)), 16_384)
                item = json.loads(self.rfile.read(length) or b"{}")
                lines = layout.lines_for(item)
                if lines:
                    printer.emit(lines)
                self.send_response(204)
            except Exception as err:   # never let one bad line stop the paper
                print(f"[print_server] {err}", file=sys.stderr)
                self.send_response(400)
            self._cors()
            self.end_headers()

        def log_message(self, *args):
            pass

    return Handler


def main():
    ap = argparse.ArgumentParser(description="Thermal printer trace for The Second Atmosphere")
    ap.add_argument("--device", help="printer device, e.g. /dev/usb/lp0 or /dev/serial0")
    ap.add_argument("--dry-run", action="store_true", help="print to the terminal instead")
    ap.add_argument("--columns", type=int, default=42, help="42 for 58 mm paper (small font), 48 for 80 mm, 32 for 58 mm large font")
    ap.add_argument("--port", type=int, default=8787)
    ap.add_argument("--host", default="127.0.0.1", help="use 0.0.0.0 if the browser is on another machine")
    ap.add_argument("--log", default="archive-print.log")
    args = ap.parse_args()

    if not args.device and not args.dry_run:
        ap.error("give --device, or --dry-run to print to the terminal")

    layout = Layout(args.columns)
    printer = Printer(args.device, args.dry_run, args.columns, args.log)
    server = ThreadingHTTPServer((args.host, args.port), make_handler(layout, printer))
    where = "the terminal" if args.dry_run else args.device
    print(f"Listening on http://{args.host}:{args.port}, printing to {where}. Log: {args.log}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()

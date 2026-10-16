# The physical trace

A thermal receipt printer prints one line for every year the field passes
through, and a line for every word a visitor leaves. The paper is never cut:
over the exhibition it runs off the printer and piles up on the floor.

One 15-minute window prints about 55 lines, roughly 20 cm of paper on 58 mm
stock. Over a five-week exhibition open eight hours a day, that is around
1,100 windows and about 220 m of paper — roughly eight 30 m rolls, plus spares.

## Parts

- A thermal receipt printer that speaks ESC/POS. Either:
  - a USB receipt printer (58 mm or 80 mm), which appears on Linux as `/dev/usb/lp0`, or
  - the Adafruit Mini Thermal Receipt Printer (TTL serial) on a Raspberry Pi's
    GPIO serial port, `/dev/serial0`, with its own 5–9 V 2 A supply.
- The exhibition computer, or a Raspberry Pi beside the printer.
- Thermal paper rolls, BPA-free.

## Running it

On the machine with the printer:

    python3 printer/print_server.py --device /dev/usb/lp0

For the Adafruit serial printer, set the speed first (check the label):

    stty -F /dev/serial0 19200
    python3 printer/print_server.py --device /dev/serial0

Open the artwork with `?printer` (the server is at `localhost:8787`), or with
`?printer=http://PI-ADDRESS:8787` if the printer hangs off a Pi and the
browser runs elsewhere; then start the server with `--host 0.0.0.0`.

To see the lines without a printer:

    python3 printer/print_server.py --dry-run

Paper width: `--columns 42` (default; 58 mm in the small font), `48` for
80 mm, `32` for 58 mm in the large font.

Every line is also written to `archive-print.log`, so the paper and the file
hold the same record.

## Reading the paper

        VOL   VERB  MATL  CONF  STAB   REC
   1979 ███   ██▒   ███░  ██░   ██▓     ░

Each bar is one GDELT measure for that year, against an ordinary day for that
year: volume of events, verbal cooperation, material cooperation, conflict,
stability. Departures from ordinary are drawn 1.8 times larger so they read
on paper. REC is how thick the record is, ░ ▒ ▓ █, from about a thousand
events a day to well over a hundred thousand. Future years print `?` there.
A new header begins each 15-minute window.

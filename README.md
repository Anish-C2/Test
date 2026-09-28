# CASPER Gazette — Global Sports Hub

Old-school federation newspaper for the CASPER archive. Vanilla HTML, CSS, and JavaScript. No build step.

Live: https://anish-c2.github.io/Test/

## What it is

A multi-sport records desk, not a single scoreboard:

- Club dossiers (form, Elo by sport, honors, head-to-head, personnel, match ledger)
- Player files (clubs, event goals/assists, honors, linked competitions)
- Sport-specific statistics (football/futsal points and scorers; cricket/cricsal/handcricket innings, wickets, extras, NRR)
- Multi-sport Elo rankings plus a separate ladder per sport
- Competitions, match desk, records, honors roll, season archives, and archive search

## Files

- `index.html` — gazette shell and navigation
- `styles.css` — vintage newspaper layout
- `app.js` — CSN parser, hash router, derived stats, Elo engine
- `data/config.json` — organization and sports catalog
- `data/season-2026A.csn` — current source archive

## Run locally

```bash
python -m http.server 8000
```

Open http://localhost:8000

## Elo

Every club starts at 1500. After a decided match:

`new = old + K × (result − expected)`

where `expected = 1 / (1 + 10^((opponent − own) / 400))`.

K is 24 for football/futsal and 28 for cricket formats, scaled a little by score margin. Walkovers count as wins. Shoot-outs decide Elo on drawn regulation scores; league tables still treat those matches as draws.

## Adding data

Drop another `.csn` file in `data/` and load it from `init()` in `app.js` (or extend `config.json` and the loader). Do not invent stats that the source file does not contain.

# CASPER Gazette — Multi-sport SPA

Old-school federation/newspaper-style CASPER portal built with vanilla HTML, CSS, and JavaScript.

## Project structure

- `index.html` — SPA shell
- `styles.css` — vintage newspaper/federation design
- `app.js` — hash router, CSN parser, archive-driven rendering and derived statistics
- `data/config.json` — organization, sports catalog, seasons, archive manifest
- `data/season-2026A.csn` — source archive supplied for this build

## Run locally

Browser `fetch()` cannot reliably load local files via `file://`. From this directory run:

```bash
python -m http.server 8000
```

Then visit http://localhost:8000.

## Data-driven model

- Competition pages are generated from CSN records.
- Sport tiles come from `data/config.json`; add a sport there without editing the page templates.
- Teams, squad names, groups, matches, and award fields are parsed from the CSN archive.
- Generic standings are computed from numeric scorelines (3 points for a win, 1 for a draw).
- Penalty shootouts remain separate from regulation score.
- Unavailable stats are not invented. Sport-specific scoring rules should be added through a future `data/rules.json` if needed.

## Add more data

Place another season `.csn` file under `data/`, then add it to the archive manifest in `data/config.json` and extend `init()` to load each manifest entry. This starter includes the provided 2026A archive.

## Notes / current limits

- This is a frontend-only SPA. Data is read-only and loaded via static files; editing or syncing requires a backend or generated JSON.
- The CSN parser covers the fields and common blocks in the provided CSN 2.2 archive. Different future CSN syntaxes may need parser updates.
- Score parsing preserves source strings and currently recognizes numeric `x-y` and `x/y` scores. Sport-specific scorecards (e.g. wickets/overs) need dedicated display/stat rules.
- Career appearances, assists, saves, and other event stats are only available when source records contain sufficient event-level data.

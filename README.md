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
- Cricket and Handcricket innings can store ball-by-ball arrays and derive runs, wickets, legal balls, overs, extras, fours, sixes, and dot balls.
- Penalty shootouts remain separate from regulation score.
- Unavailable stats are not invented. Sport-specific scoring rules should be added through a future `data/rules.json` if needed.

## Add more data

Place another season `.csn` file under `data/`, then add it to the archive manifest in `data/config.json` and extend `init()` to load each manifest entry. This starter includes the provided 2026A archive.

## Notes / current limits

- This is a frontend-only SPA. Data is read-only and loaded via static files; editing or syncing requires a backend or generated JSON.
- The CSN parser covers the fields and common blocks in the provided CSN 2.2 archive. Ball-by-ball data currently expects one comma-separated array per side in a match score.
- Score parsing preserves source strings and recognizes numeric scorelines plus ball-by-ball innings. Use `home-away:[2,3,5,6,Wd,3,W]/[1,0,4,W,2,6]#F` for two innings sequences. Tokens: `0`–`6` = runs, `W` = wicket, `Wd` = wide (+1 extra, no legal ball), `Nb` = no-ball (+1 extra, no legal ball), and `B2`/`Lb1` = byes/leg-byes. Each match displays derived innings totals and ball statistics.
- Career appearances, assists, saves, and other event stats are only available when source records contain sufficient event-level data.

- Walkovers are recorded as `home-away:WO#stage` (the home club is awarded the win), or `home-away:WO(clubcode)#stage` to explicitly name the winning club. A walkover counts as a played win/loss in standings without inventing a scoreline; the winner is shown in the match report.
- Club dossiers include cross-competition match summaries, competition ledgers, personnel links, and recorded honors. Player dossiers collect known club affiliations, available event-based goals/assists, awards, and linked competitions; appearances are not fabricated when lineups are unavailable.

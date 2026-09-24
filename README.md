# CASPER Archive

Futsal competition archive for CSN 2.1.

## CSN 2.1

- `sec=` sector number (`1` Cups & Leagues, `2` SuperLeague)
- `tel=0/1` telemetry flag (shots, shots on target, throws)
- Matches are CSV inside `m(` `)`
- One club per owner. Dual shirts are not supported.

```
m(
  home,away,hg,ag,stage,pens,yc,rc
  Anish,Bhavesh,3,3,F,2-0,,
)
```

With telemetry (`tel=1`):

```
m(
  home,away,hg,ag,stage,pens,yc,rc,shH,sotH,thH,shA,sotA,thA
  Anish,Vyom,5,3,GS,,,,16,9,8,12,6,7
)
```

Only **2026B Pioneer Cup** currently has telemetry.

## Desk model

- xG = `0.055 × (shots − SoT) + 0.34 × SoT + 0.008 × throws`
- xGoT = `0.41 × SoT + 0.05 × max(SoT − 1, 0)`

## Pages

- Season dropdown includes **GLOBAL** (every season on one tape)
- Sector dropdown filters Cups & Leagues vs SuperLeague
- Season × sector pages live at `#/season/2026A/sector/2` and `#/global/sector/1`

## Serve

Open `index.html` through any static server so `data/manifest.json` can load.

```
python3 -m http.server 8080
```

const DATA_ROOT = "data/";
const ELO0 = 100;
const STATE = { manifest: null, season: null, db: null, allComps: [], scope: { mode: "season", seasonId: null, sector: null } };
const SECTOR_NAMES = { "1": "Cups & Leagues", "2": "SuperLeague" };
const OWNER_CLUB = {};
const $ = (s, r = document) => r.querySelector(s);
const go = h => { location.hash = h; };
const fmt = (n, d = 1) => Number(n).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
const pct = (a, b) => b ? ((a / b) * 100).toFixed(1) + "%" : "—";
const slug = name => String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function parseDate(d) {
  const s = String(d || "").replace(/\D/g, "").padStart(8, "0");
  return s.length < 8 ? "" : `${s.slice(4, 8)}-${s.slice(2, 4)}-${s.slice(0, 2)}`;
}
function splitBlocks(text) {
  const blocks = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] !== "[") { i++; continue; }
    let depth = 0, j = i;
    for (; j < text.length; j++) {
      if (text[j] === "[") depth++;
      else if (text[j] === "]") {
        depth--;
        if (depth === 0) {
          const raw = text.slice(i, j + 1);
          if (/id\s*=/.test(raw)) blocks.push(raw);
          i = j + 1;
          break;
        }
      }
    }
    if (j >= text.length) break;
  }
  return blocks;
}
function extractParen(block, key) {
  const token = key + "(";
  const i = block.indexOf(token);
  if (i < 0) return null;
  let depth = 1, j = i + token.length;
  for (; j < block.length && depth; j++) {
    if (block[j] === "(") depth++;
    else if (block[j] === ")") depth--;
  }
  return depth === 0 ? block.slice(i + token.length, j - 1) : null;
}
function extractBrace(block, key) {
  const token = key + "{";
  const i = block.indexOf(token);
  if (i < 0) return null;
  const j = block.indexOf("}", i);
  return j < 0 ? null : block.slice(i + token.length, j);
}
function parseMeta(block) {
  const out = {};
  const re = /^(id|e|s|ed|org|fmt|t|dos|doc|ven|lvl|sts|typ|tag|tel|sec)\s*=\s*([^;]+);/gm;
  let m; while ((m = re.exec(block))) out[m[1]] = m[2].trim();
  return out;
}
function parseN(block) {
  const body = extractParen(block, "n") || "";
  const map = {};
  body.split(/[;\n]/).forEach(line => {
    const t = line.trim();
    if (!t.includes("=")) return;
    const [left, right] = t.split("=");
    map[left.trim()] = (right.split(",")[0] || "").trim();
  });
  return map;
}
function parseGroups(block) {
  const body = extractParen(block, "grp");
  if (!body || /^na;?$/i.test(body.trim())) return null;
  const groups = {};
  body.split(";").forEach(seg => {
    if (!seg.includes(">")) return;
    const [g, list] = seg.split(">");
    groups[g.trim()] = list.split(",").map(x => x.trim()).filter(Boolean);
  });
  return Object.keys(groups).length ? groups : null;
}
function nNum(v) { if (v == null || v === "") return null; const n = +v; return isNaN(n) ? null : n; }
function casperXG(sh, sot, th) {
  sh = +sh || 0; sot = +sot || 0; th = +th || 0;
  return +(0.055 * Math.max(0, sh - sot) + 0.34 * sot + 0.008 * th).toFixed(3);
}
function casperXGoT(sot) { sot = +sot || 0; return +(0.41 * sot + 0.05 * Math.max(0, sot - 1)).toFixed(3); }
function attachXG(rec) {
  if (!rec.tel) { rec.xG_h = rec.xG_a = rec.xGoT_h = rec.xGoT_a = null; return rec; }
  rec.xG_h = casperXG(rec.shH, rec.sotH, rec.thH);
  rec.xG_a = casperXG(rec.shA, rec.sotA, rec.thA);
  rec.xGoT_h = casperXGoT(rec.sotH);
  rec.xGoT_a = casperXGoT(rec.sotA);
  return rec;
}
function parseMatches(block, names) {
  const body = extractParen(block, "m");
  if (!body) return [];
  const lines = body.split(/[\n;]/).map(l => l.trim()).filter(l => l && !l.startsWith("#"));
  const matches = [];
  let no = 0;
  if (!lines.length) return matches;
  const csv = lines[0].toLowerCase().startsWith("home,") || (lines[0].includes(",") && !lines[0].includes("#"));
  if (csv) {
    let cols = ["home","away","hg","ag","stage","pens","yc","rc","shH","sotH","thH","shA","sotA","thA"];
    let start = 0;
    if (lines[0].toLowerCase().startsWith("home,")) { cols = lines[0].split(",").map(x => x.trim()); start = 1; }
    for (let i = start; i < lines.length; i++) {
      const cells = lines[i].split(",").map(x => x.trim());
      if (cells.length < 5) continue;
      const get = k => { const ix = cols.findIndex(c => c.toLowerCase() === k.toLowerCase()); return ix >= 0 ? (cells[ix] || "") : ""; };
      const hp = get("home"), ap = get("away");
      if (!hp || !ap) continue;
      no++;
      const rec = {
        no, home: hp, away: ap, homeClub: names[hp] || hp, awayClub: names[ap] || ap,
        hg: +get("hg") || 0, ag: +get("ag") || 0, pens: get("pens"), stage: get("stage") || "GS",
        yc: get("yc"), rc: get("rc"),
        shH: nNum(get("shH")), sotH: nNum(get("sotH")), thH: nNum(get("thH")),
        shA: nNum(get("shA")), sotA: nNum(get("sotA")), thA: nNum(get("thA"))
      };
      rec.tel = rec.shH != null || rec.sotH != null || rec.shA != null;
      matches.push(attachXG(rec));
    }
    return matches;
  }
  lines.forEach(line => {
    const mm = line.match(/^(.+?)-(.+?):(\d+)-(\d+)(?:\(([^)]*)\))?#([A-Za-z0-9]+)$/);
    if (!mm) return;
    no++;
    matches.push({ no, home: mm[1], away: mm[2], homeClub: names[mm[1]] || mm[1], awayClub: names[mm[2]] || mm[2], hg: +mm[3], ag: +mm[4], pens: "", stage: mm[6], yc: "", rc: "", tel: false });
  });
  return matches;
}
function parseAwards(block) {
  const raw = extractBrace(block, "aw") ?? extractParen(block, "aw");
  if (!raw) return [];
  return raw.split(/[;\n]/).map(line => line.trim()).filter(t => t.includes("=")).map(t => {
    const i = t.indexOf("=");
    return { label: t.slice(0, i).trim(), recipient: t.slice(i + 1).trim() };
  });
}
function parseCSN(text) {
  const cleaned = text.replace(/^[ \t]*#.*$/gm, "");
  return {
    comps: splitBlocks(cleaned).map((block, order) => {
      const meta = parseMeta(block);
      const names = parseN(block);
      return {
        id: meta.id || slug(meta.e || "comp-" + order),
        name: meta.e || meta.id, season: meta.s || "", start: parseDate(meta.dos), end: parseDate(meta.doc),
        size: +(meta.t || 0), format: meta.fmt || "", status: meta.sts || "", typ: meta.typ || "competition",
        names, groups: parseGroups(block), matches: parseMatches(block, names), awards: parseAwards(block),
        note: (extractParen(block, "nt") || "").replace(/\s+/g, " ").trim(),
        tel: meta.tel === "1" || meta.tel === "true", sec: +(meta.sec || 1), order
      };
    })
  };
}
function winnerOf(m) {
  if (m.hg > m.ag) return m.home;
  if (m.ag > m.hg) return m.away;
  if (m.pens) { const [h, a] = m.pens.split("-").map(Number); return h > a ? m.home : m.away; }
  return null;
}
function resultFor(m, who) {
  const gf = who === m.home ? m.hg : m.ag, ga = who === m.home ? m.ag : m.hg;
  if (gf > ga) return "W";
  if (gf < ga) return "L";
  if (m.pens) {
    const [h, a] = m.pens.split("-").map(Number);
    const pf = who === m.home ? h : a, pa = who === m.home ? a : h;
    return pf > pa ? "Wp" : "Lp";
  }
  return "D";
}
function scoreFor(m, who) { const r = resultFor(m, who); return (r === "W" || r === "Wp") ? 1 : (r === "L" || r === "Lp") ? 0 : .5; }
function expected(a, b) { return 1 / (1 + Math.pow(10, (b - a) / 400)); }
function formulaDelta(ra, rb, score, gd) { return +(32 * (1 + 0.15 * Math.min(Math.abs(gd || 0), 4)) * (score - expected(ra, rb))).toFixed(2); }
function parseCard(c) { if (!c) return { h: 0, a: 0 }; const [h, a] = String(c).split("-").map(n => +n || 0); return { h, a }; }
function blank(elo0) {
  return { mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, cs: 0, pensW: 0, pensL: 0, yc: 0, rc: 0, titles: 0, podium: 0, form: [], comps: new Set(), clubs: new Set(), elo: elo0, elo0, eloPeak: elo0, eloHist: [{ n: 0, elo: elo0 }], eloNet: 0, shots: 0, sot: 0, throws: 0, xG: 0, xGoT: 0, telMP: 0, overperf: 0, honors: [] };
}
function apply(st, m, who, club) {
  const home = who === m.home;
  const gf = home ? m.hg : m.ag, ga = home ? m.ag : m.hg, r = resultFor(m, who);
  const yc = parseCard(m.yc), rc = parseCard(m.rc);
  st.mp++; st.gf += gf; st.ga += ga; st.gd = st.gf - st.ga;
  st.yc += home ? yc.h : yc.a; st.rc += home ? rc.h : rc.a;
  if (m._comp) st.comps.add(m._comp);
  if (club) st.clubs.add(club);
  if (ga === 0) st.cs++;
  if (r === "W" || r === "Wp") { st.w++; st.pts += 3; } else if (r === "D") { st.d++; st.pts += 1; } else st.l++;
  if (m.pens) {
    const [h, a] = m.pens.split("-").map(Number);
    const pf = home ? h : a, pa = home ? a : h;
    if (pf > pa) st.pensW++; else st.pensL++;
  }
  st.form.push(r);
  const sh = home ? m.shH : m.shA, sot = home ? m.sotH : m.sotA, th = home ? m.thH : m.thA;
  if (m.tel && (sh != null || sot != null || th != null)) {
    st.telMP++; st.shots += +sh || 0; st.sot += +sot || 0; st.throws += +th || 0;
    st.xG += +(home ? m.xG_h : m.xG_a) || 0;
    st.xGoT += +(home ? m.xGoT_h : m.xGoT_a) || 0;
    st.overperf = +(st.gf - st.xG).toFixed(2);
  }
}
function bumpElo(st, delta, idx) {
  st.elo = +(st.elo + delta).toFixed(2); st.eloNet += delta;
  st.eloPeak = Math.max(st.eloPeak, st.elo);
  st.eloHist.push({ n: idx + 1, elo: st.elo });
}
function compute(comps) {
  comps = comps.slice().sort((a, b) => (a.start === b.start ? a.order - b.order : a.start < b.start ? -1 : 1));
  const players = {}, clubs = {};
  const ensureP = name => (players[name] || (players[name] = Object.assign({ id: slug(name), name }, blank(ELO0))));
  const ensureC = (name, owner) => {
    if (!clubs[name]) clubs[name] = Object.assign({ id: slug(name), name, player: owner || "" }, blank(ELO0));
    if (owner) clubs[name].player = clubs[name].player || owner;
    return clubs[name];
  };
  comps.forEach(c => {
    Object.entries(c.names || {}).forEach(([player, club]) => {
      ensureP(player);
      if (!club) return;
      if (!OWNER_CLUB[player]) OWNER_CLUB[player] = club;
      const locked = OWNER_CLUB[player];
      ensureC(locked, player);
      players[player].clubs.add(locked);
    });
  });
  const tape = [];
  comps.forEach(c => c.matches.forEach(m => {
    const rec = Object.assign({}, m, { _comp: c.id, _compName: c.name, _date: c.start, _sec: c.sec, _season: c.season });
    if (OWNER_CLUB[rec.home]) rec.homeClub = OWNER_CLUB[rec.home];
    if (OWNER_CLUB[rec.away]) rec.awayClub = OWNER_CLUB[rec.away];
    if (c.tel) rec.tel = rec.tel || rec.shH != null;
    attachXG(rec);
    tape.push(rec);
  }));
  const extra = {};
  tape.forEach((m, idx) => {
    const pH = ensureP(m.home), pA = ensureP(m.away);
    const cH = ensureC(m.homeClub, m.home), cA = ensureC(m.awayClub, m.away);
    const sH = scoreFor(m, m.home);
    const dH = formulaDelta(pH.elo, pA.elo, sH, m.hg - m.ag);
    const dA = formulaDelta(pA.elo, pH.elo, 1 - sH, m.ag - m.hg);
    extra[idx] = { eloH: pH.elo, eloA: pA.elo, dH, dA, winner: winnerOf(m) };
    bumpElo(pH, dH, idx); bumpElo(pA, dA, idx);
    extra[idx].eloH_after = pH.elo; extra[idx].eloA_after = pA.elo;
    apply(pH, m, m.home, m.homeClub); apply(pA, m, m.away, m.awayClub);
    apply(cH, m, m.home, m.homeClub); apply(cA, m, m.away, m.awayClub);
    m._i = idx;
  });
  comps.forEach(c => (c.awards || []).forEach(aw => {
    const rec = { comp: c.id, compName: c.name, label: aw.label, recipient: aw.recipient };
    if (players[aw.recipient]) {
      players[aw.recipient].honors.push(rec);
      if (/^champion$/i.test(aw.label)) { players[aw.recipient].titles++; players[aw.recipient].podium++; }
    }
    if (clubs[aw.recipient]) clubs[aw.recipient].honors.push(rec);
  }));
  const byComp = {};
  comps.forEach(c => {
    const set = {};
    Object.keys(c.names || {}).forEach(p => { set[p] = Object.assign({ id: slug(p), name: p }, blank(ELO0)); });
    c.matches.forEach(m => {
      if (!set[m.home]) set[m.home] = Object.assign({ id: slug(m.home), name: m.home }, blank(ELO0));
      if (!set[m.away]) set[m.away] = Object.assign({ id: slug(m.away), name: m.away }, blank(ELO0));
      apply(set[m.home], Object.assign({}, m, { _comp: c.id }), m.home, m.homeClub);
      apply(set[m.away], Object.assign({}, m, { _comp: c.id }), m.away, m.awayClub);
    });
    byComp[c.id] = set;
  });
  return {
    comps, players, clubs, tape, extra, byComp,
    totals: {
      matches: tape.length,
      goals: tape.reduce((s, m) => s + m.hg + m.ag, 0),
      players: Object.keys(players).length,
      clubs: Object.keys(clubs).length,
      comps: comps.length,
      telMatches: tape.filter(m => m.tel).length,
      xG: +tape.reduce((s, m) => s + (m.xG_h || 0) + (m.xG_a || 0), 0).toFixed(2)
    }
  };
}

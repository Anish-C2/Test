const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const state = {
  config: null,
  archive: [],
  route: [],
  search: "",
  sport: "all",
  season: "all",
  tab: "overview"
};

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({
  "&": "\\u0026amp;",
  "<": "\\u0026lt;",
  ">": "\\u0026gt;",
  '"': "\\u0026quot;",
  "'": "\\u0026#39;"
}[c]));

const slug = s => String(s || "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "");

const dateFmt = s => {
  if (!s) return "DATE TBA";
  const m = String(s).match(/^(\d{2})(\d{2})(\d{4})$/);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : s;
};

const sportName = id =>
  state.config.sports.find(s => s.id === id)?.name ||
  String(id || "Other").toUpperCase();

/* =========================
   CSN PARSER
========================= */

function splitTopLevel(text, separator = ";") {
  const out = [];
  let start = 0, round = 0, curly = 0, square = 0;
  let quote = null, escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (quote) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === quote) quote = null;
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }

    if (ch === "(") round++;
    else if (ch === ")") round = Math.max(0, round - 1);
    else if (ch === "{") curly++;
    else if (ch === "}") curly = Math.max(0, curly - 1);
    else if (ch === "[") square++;
    else if (ch === "]") square = Math.max(0, square - 1);

    if (
      ch === separator &&
      round === 0 &&
      curly === 0 &&
      square === 0
    ) {
      out.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }

  const tail = text.slice(start).trim();
  if (tail) out.push(tail);

  return out.filter(Boolean);
}

function parsePairs(body) {
  return splitTopLevel(body).map(item => {
    const i = item.indexOf("=");
    return i < 0
      ? null
      : [item.slice(0, i).trim(), item.slice(i + 1).trim()];
  }).filter(pair => pair && pair[0]);
}

function extractBalanced(src, start, open, close) {
  if (start < 0 || src[start] !== open) return "";

  let depth = 0, quote = null, escaped = false;

  for (let i = start; i < src.length; i++) {
    const ch = src[i];

    if (quote) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === quote) quote = null;
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }

    if (ch === open) depth++;
    else if (ch === close && --depth === 0) {
      return src.slice(start + 1, i);
    }
  }

  return "";
}

function block(src, name) {
  const re = new RegExp(
    "(?:^|\\n)\\s*" + name + "\\s*([({])",
    "m"
  );

  const m = re.exec(src);
  if (!m) return "";

  const pos = m.index + m[0].lastIndexOf(m[1]);

  return extractBalanced(
    src,
    pos,
    m[1],
    m[1] === "(" ? ")" : "}"
  );
}

function extractRecords(text) {
  const clean = text.replace(/\/\*[\s\S]*?\*\//g, "");
  const records = [];

  let start = -1, depth = 0, quote = null, escaped = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];

    if (quote) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === quote) quote = null;
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }

    if (ch === "[" && depth === 0) {
      start = i + 1;
      depth = 1;
      continue;
    }

    if (ch === "[" && depth > 0) depth++;
    else if (ch === "]" && depth > 0) {
      depth--;

      if (depth === 0 && start >= 0) {
        records.push(clean.slice(start, i));
        start = -1;
      }
    }
  }

  return records;
}

function parseBallSequence(raw) {
  const tokens = raw.replace(/^\[|\]$/g, "").split(",").map(x => x.trim()).filter(Boolean);
  const stats = { tokens, runs: 0, wickets: 0, legalBalls: 0, extras: 0, fours: 0, sixes: 0, dots: 0, wides: 0, noBalls: 0 };
  for (const token of tokens) {
    if (/^\d+$/.test(token)) {
      const n = Number(token);
      stats.runs += n; stats.legalBalls++;
      if (n === 4) stats.fours++;
      if (n === 6) stats.sixes++;
      if (n === 0) stats.dots++;
    } else if (/^Wd$/i.test(token)) {
      stats.runs++; stats.extras++; stats.wides++;
    } else if (/^Nb$/i.test(token)) {
      stats.runs++; stats.extras++; stats.noBalls++;
    } else if (/^(B|Lb)\d+$/i.test(token)) {
      const n = Number(token.match(/\d+/)[0]);
      stats.runs += n; stats.extras += n; stats.legalBalls++;
    } else if (/^W$/i.test(token)) {
      stats.wickets++; stats.legalBalls++;
    } else return null;
  }
  stats.overs = Math.floor(stats.legalBalls / 6) + "." + (stats.legalBalls % 6);
  return stats;
}

function parseCSN(text) {
  return extractRecords(text).map((src, idx) => {
    const fields = {};

    for (const line of src.split(/\r?\n/)) {
      const m = line.trim().match(/^([\w-]+)\s*=\s*(.*?)\s*;?$/);
      if (m) fields[m[1]] = m[2].replace(/;\s*$/, "").trim();
    }

    const teams = {};

    for (const [code, value] of parsePairs(block(src, "n"))) {
      const m = value.match(/^(.+?)\s*\[([^\]]+)\]\s*$/);

      teams[code] = {
        code,
        name: (m ? m[1] : value).trim(),
        manager: m ? m[2].trim() : ""
      };
    }

    const squads = {};

    for (const [code, value] of parsePairs(block(src, "sq"))) {
      squads[code] = value.split("|").map(group =>
        group.split(",").map(x => x.trim()).filter(Boolean)
      );
    }

    const groups = {};

    for (const item of splitTopLevel(block(src, "grp"))) {
      const m = item.match(/^\s*([^>]+?)\s*>\s*(.*?)\s*$/);

      if (m) {
        groups[m[1].trim()] = m[2].split(",")
          .map(x => x.trim())
          .filter(Boolean);
      }
    }

    const matches = splitTopLevel(block(src, "m")).map((line, i) => {
      const m = line.match(
        /^\s*([\w-]+)\s*-\s*([\w-]+)\s*:\s*(.*?)\s*(?:#\s*([\w-]+))?\s*$/
      );

      if (!m) {
        return {
          id: `${fields.id || `record-${idx + 1}`}-m${i + 1}`,
          raw: line,
          stage: "",
          index: i + 1,
          homeScore: null,
          awayScore: null
        };
      }

      const [, home, away, score, stage] = m;

      const numeric = score.match(
        /^\s*(\d+)\s*-\s*(\d+)(?=\s*(?:\(|$))/
      );

      // Ball-by-ball cricket/handcricket: [home sequence]/[away sequence]
      const ballMatch = score.match(/^\s*(\[[^\]]*\])\s*\/\s*(\[[^\]]*\])\s*$/);
      const homeBalls = ballMatch ? parseBallSequence(ballMatch[1]) : null;
      const awayBalls = ballMatch ? parseBallSequence(ballMatch[2]) : null;
      const ballData = homeBalls && awayBalls ? { home: homeBalls, away: awayBalls } : null;

      const pen = score.match(
        /\(\s*p\s*(\d+)\s*-\s*(\d+)\s*\)/i
      );

      const eventText = [
        ...score.matchAll(/\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g)
      ].map(x => x[1]).join(",");

      const events = {};

      for (const part of eventText.split(/,(?![^()]*\))/)) {
        const ev = part.trim().match(
          /^([a-z][\w-]*)\s*=\s*(.*)$/i
        );

        if (ev) events[ev[1].toLowerCase()] = ev[2].trim();
      }

      return {
        id: `${fields.id || `record-${idx + 1}`}-m${i + 1}`,
        home,
        away,
        homeName: teams[home]?.name || home,
        awayName: teams[away]?.name || away,
        score: ballData ? `${homeBalls.runs}/${homeBalls.wickets} (${homeBalls.overs}) - ${awayBalls.runs}/${awayBalls.wickets} (${awayBalls.overs})` : score.trim(),
        homeScore: ballData ? homeBalls.runs : numeric ? Number(numeric[1]) : null,
        awayScore: ballData ? awayBalls.runs : numeric ? Number(numeric[2]) : null,
        ballData,
        penalties: pen ? [Number(pen[1]), Number(pen[2])] : null,
        events,
        stage: stage || "",
        index: i + 1
      };
    });

    const awardsText = block(src, "aw");
    const awards = Object.fromEntries(parsePairs(awardsText));
    const noteMatch = src.match(/(?:^|\n)\s*nt\s*\(([^)]*)\)/m);

    return {
      id: fields.id || `record-${idx + 1}`,
      name: fields.e || fields.id || `Competition ${idx + 1}`,
      season: fields.s || "Unknown",
      edition: fields.ed || "",
      organization: fields.org || "CASPER",
      sport: fields.sport || "other",
      format: fields.fmt || "Unspecified",
      teams,
      squads,
      groups,
      matches,
      awards,
      note: noteMatch?.[1] || "",
      status: fields.sts || "Unknown",
      tier: fields.lvl || "",
      venue: fields.ven || "",
      startDate: fields.dos || "",
      endDate: fields.doc || "",
      rawFields: fields,
      raw: src
    };
  });
}

function getTeamName(record, code) {
  return record.teams?.[code]?.name || code || "-";
}

function allTeams() {
  const map = new Map();

  state.archive.forEach(c =>
    Object.entries(c.teams || {}).forEach(([code, t]) => {
      const key = t.name.toLowerCase();

      if (!map.has(key)) {
        map.set(key, {
          ...t,
          code,
          sport: c.sport,
          competitions: new Set()
        });
      }

      map.get(key).competitions.add(c.id);
    })
  );

  return [...map.values()].map(t => ({
    ...t,
    competitions: [...t.competitions]
  }));
}

function allPlayers() {
  const map = new Map();

  const ensure = (name, role = "Player") => {
    name = String(name || "").trim();
    if (!name) return null;

    const key = name.toLowerCase();

    if (!map.has(key)) {
      map.set(key, {
        id: slug(name),
        name,
        teams: new Set(),
        appearances: 0,
        goals: 0,
        assists: 0,
        role
      });
    }

    return map.get(key);
  };

  state.archive.forEach(c => {
    Object.entries(c.teams || {}).forEach(([code, t]) => {
      const contact = ensure(t.manager, "Team contact");
      if (contact) contact.teams.add(t.name);

      (c.squads?.[code] || []).flat().forEach(raw => {
        const name = raw.replace(/\([^)]*\)/g, "").trim();
        const p = ensure(
          name,
          raw.match(/\(([^)]+)\)/)?.[1] || "Player"
        );

        if (p) p.teams.add(t.name);
      });
    });

    c.matches.forEach(m => {
      for (const [eventKey, kind] of [
        ["gh", "goals"],
        ["ga", "goals"],
        ["ah", "assists"],
        ["aa", "assists"]
      ]) {
        const list = m.events?.[eventKey];
        if (!list) continue;

        list.split("+").forEach(token => {
          const hit = token.trim().match(/^(.+?)\s*\*\s*(\d+)$/);
          if (!hit) return;

          const p = ensure(hit[1], "Player");
          if (p) p[kind] += Number(hit[2]);
        });
      }
    });
  });

  return [...map.values()].map(p => ({
    ...p,
    teams: [...p.teams]
  }));
}

function aggregateStats(record) {
  const stats = {};

  Object.entries(record.teams || {}).forEach(([code, t]) => {
    stats[code] = {
      code,
      name: t.name,
      played: 0,
      w: 0,
      d: 0,
      l: 0,
      for: 0,
      against: 0,
      gd: 0,
      pts: 0
    };
  });

  record.matches.forEach(m => {
    if (
      m.homeScore == null ||
      m.awayScore == null ||
      !stats[m.home] ||
      !stats[m.away]
    ) return;

    const h = stats[m.home], a = stats[m.away];

    h.played++;
    a.played++;

    h.for += m.homeScore;
    h.against += m.awayScore;
    a.for += m.awayScore;
    a.against += m.homeScore;

    if (m.homeScore > m.awayScore) {
      h.w++;
      a.l++;
      h.pts += 3;
    } else if (m.homeScore < m.awayScore) {
      a.w++;
      h.l++;
      a.pts += 3;
    } else {
      h.d++;
      a.d++;
      h.pts++;
      a.pts++;
    }
  });

  return Object.values(stats)
    .map(t => ({ ...t, gd: t.for - t.against }))
    .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.for - a.for);
}

function handcricketStandings(record) {
  const quota = Math.max(1, Number(record.rawFields?.ov || 2)) * 6;
  const stats = Object.fromEntries(Object.entries(record.teams || {}).map(([code, team]) => [code, { code, name: team.name, player: team.manager || '', played: 0, w: 0, d: 0, l: 0, runsFor: 0, runsAgainst: 0, wickets: 0, ballsFor: 0, ballsAgainst: 0, pts: 0 }]));
  for (const m of record.matches) {
    if (!m.ballData || !stats[m.home] || !stats[m.away]) continue;
    const h = stats[m.home], a = stats[m.away], hi = m.ballData.home, ai = m.ballData.away;
    const hb = hi.wickets ? quota : hi.legalBalls, ab = ai.wickets ? quota : ai.legalBalls;
    h.played++; a.played++; h.runsFor += hi.runs; h.runsAgainst += ai.runs; a.runsFor += ai.runs; a.runsAgainst += hi.runs;
    h.wickets += hi.wickets; a.wickets += ai.wickets; h.ballsFor += hb; h.ballsAgainst += ab; a.ballsFor += ab; a.ballsAgainst += hb;
    if (hi.runs > ai.runs) { h.w++; a.l++; h.pts += 2; } else if (hi.runs < ai.runs) { a.w++; h.l++; a.pts += 2; } else { h.d++; a.d++; h.pts++; a.pts++; }
  }
  return Object.values(stats).map(t => ({ ...t, nrr: (t.ballsFor ? t.runsFor * 6 / t.ballsFor : 0) - (t.ballsAgainst ? t.runsAgainst * 6 / t.ballsAgainst : 0) })).sort((a,b) => b.pts-a.pts || b.nrr-a.nrr || b.runsFor-a.runsFor);
}

function handcricketTable(rows) {
  if (!rows.length) return '<p class="muted">No handcricket standings available.</p>';
  return '<div class="tablewrap"><table><thead><tr><th>#</th><th>Club / Player</th><th>P</th><th>W</th><th>L</th><th>Runs</th><th>Conceded</th><th>Wkts</th><th>NRR</th><th>Pts</th></tr></thead><tbody>' + rows.map((t,i) => '<tr><td>'+(i+1)+'</td><td><b>'+esc(t.name)+'</b><small class="muted"> '+esc(t.player)+'</small></td><td>'+t.played+'</td><td>'+t.w+'</td><td>'+t.l+'</td><td>'+t.runsFor+'</td><td>'+t.runsAgainst+'</td><td>'+t.wickets+'</td><td>'+(t.nrr >= 0 ? '+' : '')+t.nrr.toFixed(3)+'</td><td><b>'+t.pts+'</b></td></tr>').join('') + '</tbody></table></div><p class="muted">HCL points: 2 for a win, 1 for a tie. NRR = runs per over scored minus runs per over conceded; all-out innings count as the full 2-over quota.</p>';
}
function statsForSport(sport = "all") {
  const comps = state.archive.filter(
    c => sport === "all" || c.sport === sport
  );

  const map = new Map();

  comps.forEach(c => c.matches.forEach(m => {
    if (m.homeScore == null || m.awayScore == null) return;

    [
      [m.home, m.homeScore, m.awayScore],
      [m.away, m.awayScore, m.homeScore]
    ].forEach(([code, sc, con]) => {
      const name = getTeamName(c, code);

      if (!map.has(name)) {
        map.set(name, {
          name,
          played: 0,
          w: 0,
          d: 0,
          l: 0,
          for: 0,
          against: 0,
          pts: 0
        });
      }

      const t = map.get(name);

      t.played++;
      t.for += sc;
      t.against += con;

      if (sc > con) {
        t.w++;
        t.pts += 3;
      } else if (sc < con) {
        t.l++;
      } else {
        t.d++;
        t.pts++;
      }
    });
  }));

  return [...map.values()]
    .map(t => ({ ...t, gd: t.for - t.against }))
    .sort((a, b) => b.pts - a.pts || b.gd - a.gd);
}

function totalStats() {
  const matches = state.archive.flatMap(c => c.matches);

  return {
    competitions: state.archive.length,
    sports: new Set(state.archive.map(c => c.sport)).size,
    teams: allTeams().length,
    matches: matches.length,
    completed: matches.filter(m => m.homeScore != null).length,
    ongoing: state.archive.filter(c => /ongoing|live/i.test(c.status)).length
  };
}

function badge(s) {
  return `<span class="badge ${
    /ongoing|live/i.test(s) ? "live" : /complete/i.test(s) ? "done" : ""
  }">${esc(s || "Unspecified")}</span>`;
}

function section(title, more = "") {
  return `<div class="sectionhead"><span>${esc(title)}</span>${more}</div>`;
}

function ballSummary(label, innings) {
  return `<div class="muted"><b>${esc(label)}:</b> [${innings.tokens.map(esc).join(", ")}] · ${innings.runs} runs, ${innings.wickets} wickets, ${innings.legalBalls} legal balls (${innings.overs} ov), ${innings.extras} extras, ${innings.fours} fours, ${innings.sixes} sixes, ${innings.dots} dot balls</div>`;
}

function matchLine(c, m) {
  const ballDetails = m.ballData
    ? `<div class="ball-details">${ballSummary(m.homeName, m.ballData.home)}${ballSummary(m.awayName, m.ballData.away)}</div>`
    : "";
  return `<article class="matchline">
    <div class="match-meta">
      ${esc(c.name)} · ${esc(m.stage || "Match " + m.index)}
      <span>${esc(c.season)}</span>
    </div>
    <div class="match-teams">
      <b>${esc(m.homeName)}</b>
      <strong>${esc(m.score)}</strong>
      <b>${esc(m.awayName)}</b>
    </div>
    ${ballDetails}
  </article>`;
}

function standingsTable(rows) {
  if (!rows.length) {
    return `<p class="muted">No standings can be derived from the available score data.</p>`;
  }

  return `<div class="tablewrap"><table>
    <thead><tr>
      <th>#</th><th>Club</th><th>P</th><th>W</th><th>D</th>
      <th>L</th><th>GF</th><th>GA</th><th>GD</th><th>Pts</th>
    </tr></thead>
    <tbody>${rows.map((t, i) => `<tr>
      <td>${i + 1}</td>
      <td><b>${esc(t.name)}</b></td>
      <td>${t.played}</td><td>${t.w}</td><td>${t.d}</td>
      <td>${t.l}</td><td>${t.for}</td><td>${t.against}</td>
      <td>${t.gd > 0 ? "+" : ""}${t.gd}</td>
      <td><b>${t.pts}</b></td>
    </tr>`).join("")}</tbody>
  </table></div>`;
}

function compCard(c) {
  return `<a class="compcard" href="#/competition/${encodeURIComponent(c.id)}">
    <div class="meta">${esc(c.season)} / ${esc(sportName(c.sport))}</div>
    <h3>${esc(c.name)}</h3>
    <p>${esc(c.format)} · ${c.matches.length} matches</p>
    <div>${badge(c.status)}</div>
  </a>`;
}

function pageTitle(kicker, title, sub = "") {
  return `<div class="pagetitle">
    <div class="kicker">${esc(kicker)}</div>
    <h2>${esc(title)}</h2>
    ${sub ? `<p>${esc(sub)}</p>` : ""}
  </div>`;
}

function home() {
  const totals = totalStats();
  const recent = state.archive.flatMap(c =>
    c.matches.map(m => ({ c, m }))
  ).slice(-7).reverse();

  const comps = state.archive.slice().reverse().slice(0, 6);

  return `<div class="editionline">
    <span>THE CASPER GAZETTE</span>
    <span>OFFICIAL FEDERATION EDITION · ${
      new Date().toLocaleDateString("en-IN", {
        day: "2-digit", month: "short", year: "numeric"
      })
    }</span>
  </div>
  <section class="leadstory">
    <div class="leadcopy">
      <div class="kicker">THE FEDERATION RECORD</div>
      <h2>Every sport.<br>Every match.<br>Every record.</h2>
      <p>A comprehensive archive of CASPER competitions, clubs, match results, honors, and sporting statistics — organized season by season.</p>
      <a class="inkbutton" href="#/competitions">Browse competitions →</a>
    </div>
    <div class="leadfacts">
      <div class="fact"><b>${totals.sports}</b><span>Sports represented</span></div>
      <div class="fact"><b>${totals.competitions}</b><span>Competitions</span></div>
      <div class="fact"><b>${totals.teams}</b><span>Distinct clubs</span></div>
      <div class="fact"><b>${totals.matches}</b><span>Match records</span></div>
    </div>
  </section>
  <div class="homegrid">
    <section>
      ${section("Latest Match Reports", `<a href="#/matches">MATCH CENTRE →</a>`)}
      ${recent.length ? recent.map(x => matchLine(x.c, x.m)).join("") : `<p>No match records loaded.</p>`}
    </section>
    <aside>
      ${section("Competition Register")}
      <div class="compgrid">${comps.map(compCard).join("")}</div>
    </aside>
  </div>
  ${section("Browse by Sport")}
  <div class="sportgrid">${state.config.sports.map(s => `
    <a class="sporttile" href="#/sport/${encodeURIComponent(s.id)}">
      <span>${esc(s.icon || "*")}</span>
      <b>${esc(s.name)}</b>
      <small>${state.archive.filter(c => c.sport === s.id).length} competitions</small>
    </a>`).join("")}
  </div>
  <div class="homegrid">
    <section>
      ${section("Federation Leaders")}
      <h3 class="subhead">Club points · all archived scorelines</h3>
      ${standingsTable(statsForSport().slice(0, 8))}
    </section>
    <aside>
      ${section("Archive Notes")}
      <div class="note">${state.archive.filter(c => c.awards && Object.keys(c.awards).length).length} competitions include award records.</div>
      <div class="note">${state.archive.reduce((n, c) => n + Object.keys(c.groups || {}).length, 0)} group-stage group lists are archived.</div>
      <div class="note">Standings are derived from numeric scorelines. Penalty shoot-outs and sport-specific scoring are displayed separately where available.</div>
    </aside>
  </div>`;
}

function sportsPage(id) {
  if (id) {
    const s = state.config.sports.find(x => x.id === id);
    if (!s) return notFound();

    const cs = state.archive.filter(c => c.sport === id);

    return pageTitle("SPORTS REGISTER", s.name, s.description) +
      `<div class="toolbar"><span class="badge">${cs.length} competitions</span></div>
      <div class="compgrid">${cs.map(compCard).join("") || "<p>No competitions in this sport in the loaded archive.</p>"}</div>
      ${section("Sport-wide club table")}${standingsTable(statsForSport(id))}`;
  }

  return pageTitle("THE SPORTING DIRECTORY", "All Sports", "The federation sports catalog is configuration-driven.") +
    `<div class="sportgrid">${state.config.sports.map(s => `
      <a class="sporttile" href="#/sport/${encodeURIComponent(s.id)}">
        <span>${esc(s.icon || "*")}</span>
        <b>${esc(s.name)}</b>
        <small>${state.archive.filter(c => c.sport === s.id).length} competitions</small>
      </a>`).join("")}</div>`;
}

function competitionPage(id) {
  const c = state.archive.find(x => x.id === id);
  if (!c) return notFound();

  return pageTitle(`${c.season} · ${sportName(c.sport)}`, c.name, `${c.format} · ${c.status}`) +
    `<div class="detailfacts">
      <div><small>STATUS</small>${badge(c.status)}</div>
      <div><small>SEASON</small><b>${esc(c.season)}</b></div>
      <div><small>TEAMS</small><b>${Object.keys(c.teams || {}).length}</b></div>
      <div><small>MATCHES</small><b>${c.matches.length}</b></div>
      <div><small>DATES</small><b>${dateFmt(c.startDate)}${c.endDate ? " - " + dateFmt(c.endDate) : ""}</b></div>
    </div>
    <div class="tabs">
      <button data-tab="overview" class="tab active">Overview</button>
      <button data-tab="matches" class="tab">Matches</button>
      <button data-tab="table" class="tab">Standings</button>
      <button data-tab="teams" class="tab">Teams</button>
      <button data-tab="awards" class="tab">Awards</button>
      <button data-tab="raw" class="tab">Source data</button>
    </div>
    <div id="competitionPanel">${competitionPanel(c, "overview")}</div>`;
}

function competitionPanel(c, tab) {
  if (tab === "matches") {
    return section("Match Register") +
      c.matches.map(m => matchLine(c, m)).join("");
  }

  if (tab === "table") {
    return section("Derived Standings") +
      (c.sport === "handcricket" ? handcricketTable(handcricketStandings(c)) : standingsTable(aggregateStats(c))) +
      `<p class="muted">${c.sport === "handcricket" ? "Standings and NRR are calculated from ball-by-ball innings." : "Calculated from numeric scores using 3 points for a win and 1 for a draw. Shoot-out results are not used to break draws."}</p>`;
  }

  if (tab === "teams") {
    return section("Registered Teams") +
      `<div class="clubgrid">${Object.entries(c.teams || {}).map(([code, t]) => `
        <div class="clubchip"><b>${esc(t.name)}</b>
          <small>${esc(code)} · ${esc(t.manager || "")}</small>
        </div>`).join("")}</div>`;
  }

  if (tab === "awards") {
    return section("Honors & Awards") +
      `<div class="awardgrid">${Object.entries(c.awards || {}).map(([k, v]) => `
        <div class="award">
          <small>${esc(k)}</small>
          <b>${esc(c.teams?.[v]?.name || v)}</b>
        </div>`).join("") || "<p>No award data recorded.</p>"}</div>`;
  }

  if (tab === "raw") {
    return `<pre class="raw">${esc(JSON.stringify(c, null, 2))}</pre>`;
  }

  return `<div class="homegrid">
    <section>
      ${section("Competition Overview")}
      <p>${esc(c.note || "No additional competition notes.")}</p>
      ${section("Teams")}
      <div class="clubgrid">${Object.entries(c.teams || {}).map(([code, t]) => `
        <div class="clubchip"><b>${esc(t.name)}</b>
          <small>${esc(code)} · ${esc(t.manager || "")}</small>
        </div>`).join("")}</div>
    </section>
    <aside>
      ${section("Latest Scores")}
      ${c.matches.slice(-4).reverse().map(m => matchLine(c, m)).join("")}
    </aside>
  </div>`;
}

function competitions() {
  const seasons = [...new Set(state.archive.map(c => c.season))];

  return pageTitle("OFFICIAL REGISTER", "Competitions", "Search and filter every competition loaded from the data archive.") +
    `<div class="toolbar">
      <input id="q" placeholder="Search competition, club, format...">
      <select id="filterSport">
        <option value="all">All sports</option>
        ${state.config.sports.map(s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join("")}
      </select>
      <select id="filterSeason">
        <option value="all">All seasons</option>
        ${seasons.map(s => `<option>${esc(s)}</option>`).join("")}
      </select>
      <select id="filterStatus">
        <option value="all">All statuses</option>
        ${[...new Set(state.archive.map(c => c.status))].map(s => `<option>${esc(s)}</option>`).join("")}
      </select>
    </div>
    <div id="compResults" class="compgrid"></div>`;
}

function renderComps() {
  const root = $("#compResults");
  if (!root) return;

  const q = $("#q").value.toLowerCase();
  const sp = $("#filterSport").value;
  const se = $("#filterSeason").value;
  const st = $("#filterStatus").value;

  const rows = state.archive.filter(c =>
    (sp === "all" || c.sport === sp) &&
    (se === "all" || c.season === se) &&
    (st === "all" || c.status === st) &&
    [c.name, c.id, c.format, c.sport,
      Object.values(c.teams || {}).map(t => t.name).join(" ")
    ].join(" ").toLowerCase().includes(q)
  );

  root.innerHTML = rows.map(compCard).join("") ||
    `<p class="empty">No competitions match those filters.</p>`;
}

function matchesPage() {
  return pageTitle("MATCH DESK", "Fixtures & Results", "Every recorded match across the loaded seasons.") +
    `<div class="toolbar">
      <input id="mq" placeholder="Search teams, competition, stage...">
      <select id="ms">
        <option value="all">All sports</option>
        ${state.config.sports.map(s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join("")}
      </select>
      <select id="mseason">
        <option value="all">All seasons</option>
        ${[...new Set(state.archive.map(c => c.season))].map(s => `<option>${esc(s)}</option>`).join("")}
      </select>
    </div>
    <div id="matchResults"></div>`;
}

function renderMatches() {
  const root = $("#matchResults");
  if (!root) return;

  const q = $("#mq").value.toLowerCase();
  const sp = $("#ms").value;
  const se = $("#mseason").value;

  const rows = state.archive
    .filter(c => (sp === "all" || c.sport === sp) && (se === "all" || c.season === se))
    .flatMap(c => c.matches.map(m => ({ c, m })))
    .filter(x => [x.c.name, x.m.homeName, x.m.awayName, x.m.stage, x.m.score]
      .join(" ").toLowerCase().includes(q))
    .reverse();

  root.innerHTML = rows.map(x => matchLine(x.c, x.m)).join("") ||
    `<p class="empty">No matches found.</p>`;
}

function statisticsPage() {
  const stats = totalStats();

  return pageTitle("RECORDS & FIGURES", "Statistics Bureau", "Computed from all loaded competition records; sport-specific measures remain separate.") +
    `<div class="statgrid">${Object.entries({
      Sports: stats.sports,
      Competitions: stats.competitions,
      Clubs: stats.teams,
      Matches: stats.matches,
      "Numeric scorelines": stats.completed,
      "Ongoing competitions": stats.ongoing
    }).map(([k, v]) => `<div class="statbox"><small>${esc(k)}</small><b>${v}</b></div>`).join("")}</div>
    <div class="toolbar">
      <select id="statSport">
        <option value="all">All sports</option>
        ${state.config.sports.map(s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join("")}
      </select>
    </div>
    <div id="statTable">${standingsTable(statsForSport())}</div>
    <div class="homegrid">
      <section>
        ${section("Competition Honors")}
        ${state.archive.filter(c => Object.keys(c.awards || {}).length).map(c => `
          <div class="awardrow">
            <a href="#/competition/${encodeURIComponent(c.id)}"><b>${esc(c.name)}</b></a>
            <span>${esc(c.season)}</span>
            <b>${esc(c.teams?.[c.awards.ch]?.name || c.awards.Champion || c.awards.champion || "-")}</b>
          </div>`).join("")}
      </section>
      <aside>
        ${section("Data & Methodology")}
        <p class="muted">Club tables are derived from parsed numeric scorelines. Current default: 3 points per win, 1 per draw. This is a generic table; each sport can later define its own scoring model in configuration.</p>
        <p class="muted">Player goals and assists are only computed when match event data is available in a recognized event format. Unavailable metrics are not fabricated.</p>
      </aside>
    </div>`;
}

function clubsPage(id) {
  const clubs = allTeams();

  if (id) {
    const c = clubs.find(x => slug(x.name) === id);
    if (!c) return notFound();

    const comps = state.archive.filter(x =>
      Object.values(x.teams || {}).some(t => t.name === c.name)
    );

    return pageTitle("CLUB REGISTER", c.name, `${sportName(c.sport)} · ${c.code}`) +
      `<div class="detailfacts">
        <div><small>SPORT</small><b>${esc(sportName(c.sport))}</b></div>
        <div><small>COMPETITIONS</small><b>${c.competitions.length}</b></div>
      </div>
      ${section("Competition History")}
      <div class="compgrid">${comps.map(compCard).join("")}</div>`;
  }

  return pageTitle("CLUB DIRECTORY", "Registered Clubs", `${clubs.length} unique club names across the archive.`) +
    `<div class="toolbar">
      <input id="cq" placeholder="Search clubs...">
      <select id="cs">
        <option value="all">All sports</option>
        ${state.config.sports.map(s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join("")}
      </select>
    </div>
    <div id="clubResults" class="clubgrid"></div>`;
}

function renderClubs() {
  const root = $("#clubResults");
  if (!root) return;

  const q = $("#cq").value.toLowerCase();
  const sp = $("#cs").value;

  const rows = allTeams().filter(c =>
    (sp === "all" || c.sport === sp) && c.name.toLowerCase().includes(q)
  );

  root.innerHTML = rows.map(c => `
    <a class="clubcard" href="#/club/${encodeURIComponent(slug(c.name))}">
      <small>${esc(sportName(c.sport))} · ${esc(c.code)}</small>
      <b>${esc(c.name)}</b>
      <span>${c.competitions.length} competitions</span>
    </a>`).join("") || "<p>No clubs found.</p>";
}

function playersPage(id) {
  const players = allPlayers();

  if (id) {
    const p = players.find(x => x.id === id);
    if (!p) return notFound();

    return pageTitle("ATHLETE PROFILE", p.name, p.role) +
      `<div class="detailfacts">
        <div><small>KNOWN CLUBS</small><b>${esc(p.teams.join(", ") || "Not recorded")}</b></div>
        <div><small>GOALS IN EVENT DATA</small><b>${p.goals || "Not calculated"}</b></div>
        <div><small>ASSISTS IN EVENT DATA</small><b>${p.assists || "Not calculated"}</b></div>
      </div>
      <p class="muted">This profile is assembled from team contacts and roster entries in the archive. Career appearances and totals require match-level participation data.</p>`;
  }

  return pageTitle("ATHLETE DIRECTORY", "Players & Personnel", "Names discovered in team contact and squad records.") +
    `<div class="toolbar"><input id="pq" placeholder="Search people..."></div>
    <div id="playerResults" class="clubgrid"></div>`;
}

function renderPlayers() {
  const root = $("#playerResults");
  if (!root) return;

  const q = $("#pq").value.toLowerCase();

  const rows = allPlayers().filter(p =>
    (p.name + " " + p.teams.join(" ")).toLowerCase().includes(q)
  );

  root.innerHTML = rows.map(p => `
    <a class="clubcard" href="#/player/${encodeURIComponent(p.id)}">
      <small>${esc(p.role)}</small>
      <b>${esc(p.name)}</b>
      <span>${esc(p.teams.join(", ") || "No club listed")}</span>
    </a>`).join("") || "<p>No players found.</p>";
}

function archivesPage() {
  const seasons = [...new Set(state.archive.map(c => c.season))].sort().reverse();

  return pageTitle("HISTORICAL REGISTER", "Season Archives", "Competition records grouped by season.") +
    seasons.map(se => `
      <section class="archiveblock">
        ${section("Season " + se)}
        <div class="compgrid">${state.archive.filter(c => c.season === se).map(compCard).join("")}</div>
      </section>`).join("");
}

function searchPage() {
  return pageTitle("ARCHIVE SEARCH", "Search CASPER", "Search competition names, clubs, match scores, and award records.") +
    `<div class="toolbar"><input id="globalq" placeholder="Type to search the archive..." autofocus></div>
    <div id="globalresults"></div>`;
}

function renderGlobal() {
  const root = $("#globalresults");
  if (!root) return;

  const q = $("#globalq").value.trim().toLowerCase();

  if (!q) {
    root.innerHTML = "<p class='muted'>Start typing to search.</p>";
    return;
  }

  const comps = state.archive.filter(c =>
    JSON.stringify(c).toLowerCase().includes(q)
  );

  root.innerHTML = comps.map(compCard).join("") || "<p>No records found.</p>";
}

function notFound() {
  return pageTitle("ARCHIVE NOTICE", "Record Not Found", "This record is not present in the loaded data.") +
    `<a class="inkbutton" href="#/">Return to front page</a>`;
}

function render() {
  const parts = decodeURIComponent(
    location.hash.replace(/^#\/?/, "")
  ).split("/").filter(Boolean);

  state.route = parts;

  const page = parts[0] || "home";
  const id = parts[1];

  let html;

  switch (page) {
    case "home": html = home(); break;
    case "sports": html = sportsPage(); break;
    case "sport": html = sportsPage(id); break;
    case "competitions": html = competitions(); break;
    case "competition": html = competitionPage(id); break;
    case "matches": html = matchesPage(); break;
    case "statistics": html = statisticsPage(); break;
    case "clubs": html = clubsPage(); break;
    case "club": html = clubsPage(id); break;
    case "players": html = playersPage(); break;
    case "player": html = playersPage(id); break;
    case "archives": html = archivesPage(); break;
    case "search": html = searchPage(); break;
    default: html = notFound();
  }

  $("#app").innerHTML = html;

  $$("#nav a").forEach(a =>
    a.classList.toggle(
      "active",
      a.dataset.route === page ||
      (page === "sport" && a.dataset.route === "sports") ||
      (page === "competition" && a.dataset.route === "competitions")
    )
  );

  if (page === "competitions") {
    ["q", "filterSport", "filterSeason", "filterStatus"].forEach(id =>
      $("#" + id)?.addEventListener("input", renderComps)
    );
    renderComps();
  }

  if (page === "matches") {
    ["mq", "ms", "mseason"].forEach(id =>
      $("#" + id)?.addEventListener("input", renderMatches)
    );
    renderMatches();
  }

  if (page === "statistics") {
    $("#statSport")?.addEventListener("change", e => {
      $("#statTable").innerHTML = standingsTable(statsForSport(e.target.value));
    });
  }

  if (page === "clubs") {
    ["cq", "cs"].forEach(id =>
      $("#" + id)?.addEventListener("input", renderClubs)
    );
    renderClubs();
  }

  if (page === "players") {
    $("#pq")?.addEventListener("input", renderPlayers);
    renderPlayers();
  }

  if (page === "search") {
    $("#globalq")?.addEventListener("input", renderGlobal);
    renderGlobal();
  }

  $$(".tab").forEach(b =>
    b.addEventListener("click", () => {
      $$(".tab").forEach(x => x.classList.toggle("active", x === b));
      $("#competitionPanel").innerHTML = competitionPanel(
        state.archive.find(c => c.id === id),
        b.dataset.tab
      );
    })
  );

  window.scrollTo(0, 0);
}

window.addEventListener("hashchange", () => {
  if (state.config) render();
});

async function init() {
  try {
    const [configRes, csnRes] = await Promise.all([
      fetch("./data/config.json"),
      fetch("./data/season-2026A.csn")
    ]);

    if (!configRes.ok || !csnRes.ok) {
      throw new Error(
        "Could not load data files. Run this site through a local web server."
      );
    }

    state.config = await configRes.json();
    state.archive = parseCSN(await csnRes.text());

    $("#masthead-title").textContent = state.config.organization.name;

    render();
  } catch (err) {
    $("#app").innerHTML = `
      <div class="error">
        <h2>Archive data could not be loaded</h2>
        <p>${esc(err.message)}</p>
        <p>Run a local web server from the project folder, then open the site.</p>
      </div>`;
  }
}

init();

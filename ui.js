function sectorName(n) { return ((STATE.manifest && STATE.manifest.sectors) || SECTOR_NAMES)[String(n)] || ("Sector " + n); }
function scopeLabel() {
  const bits = [];
  bits.push(STATE.scope.mode === "global" ? "GLOBAL" : (STATE.season ? STATE.season.label : "Season"));
  if (STATE.scope.sector) bits.push(sectorName(STATE.scope.sector));
  return bits.join(" · ");
}
function playerA(name) { return `<span class="click" data-go="#/player/${slug(name)}">${esc(name)}</span>`; }
function eloB(v) { if (v == null || isNaN(v)) return ""; const n = +v; return `<span class="badge ${n >= 0 ? "up" : "dn"}">${n > 0 ? "+" : ""}${fmt(n, 1)}</span>`; }
function kpi(k, v, s) { return `<div class="kpi"><span class="k">${k}</span><span class="v">${v}</span><span class="s">${s || ""}</span></div>`; }
function tableHtml(headers, rows) {
  return `<div class="wrap"><table><thead><tr>${headers.map(h => `<th${h.num ? ' class="num"' : ""}>${h.l}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
}
function matchTable(ms) {
  const tel = ms.some(m => m.tel);
  const headers = [{ l: "Comp" }, { l: "Stage" }, { l: "Home" }, { l: "Score", num: 1 }, { l: "Away" }, { l: "ΔH" }, { l: "ΔA" }];
  if (tel) headers.push({ l: "Shots" }, { l: "SoT" }, { l: "xG" });
  return tableHtml(headers, ms.map(m => {
    const x = STATE.db.extra[m._i] || {};
    let extra = "";
    if (tel) extra = m.tel
      ? `<td class="num">${m.shH}–${m.shA}</td><td class="num">${m.sotH}–${m.sotA}</td><td class="num">${fmt(m.xG_h, 2)}–${fmt(m.xG_a, 2)}</td>`
      : `<td class="tiny">—</td><td class="tiny">—</td><td class="tiny">—</td>`;
    return `<tr class="click" data-go="#/match/${m._i}"><td class="tiny">${esc(m._compName || "")}</td><td><span class="badge">${esc(m.stage)}</span></td><td>${playerA(m.home)}<div class="tiny">${esc(m.homeClub)}</div></td><td class="num">${m.hg}–${m.ag}</td><td>${playerA(m.away)}<div class="tiny">${esc(m.awayClub)}</div></td><td>${eloB(x.dH)}</td><td>${eloB(x.dA)}</td>${extra}</tr>`;
  }));
}
function eloTable(rows) {
  return tableHtml(
    [{ l: "#" }, { l: "Player" }, { l: "Club" }, { l: "Elo", num: 1 }, { l: "MP", num: 1 }, { l: "W-D-L", num: 1 }, { l: "GD", num: 1 }],
    rows.map((s, i) => `<tr class="click" data-go="#/player/${s.id}"><td>${i + 1}</td><td>${esc(s.name)}</td><td class="tiny">${esc([...s.clubs][0] || "")}</td><td class="num">${fmt(s.elo, 1)}</td><td class="num">${s.mp}</td><td class="num">${s.w}-${s.d}-${s.l}</td><td class="num">${s.gd > 0 ? "+" : ""}${s.gd}</td></tr>`)
  );
}
function standings(rows) {
  return tableHtml(
    [{ l: "#" }, { l: "Player" }, { l: "MP", num: 1 }, { l: "W", num: 1 }, { l: "D", num: 1 }, { l: "L", num: 1 }, { l: "GD", num: 1 }, { l: "Pts", num: 1 }],
    rows.map((s, i) => `<tr class="click" data-go="#/player/${s.id}"><td>${i + 1}</td><td>${esc(s.name)}</td><td class="num">${s.mp}</td><td class="num">${s.w}</td><td class="num">${s.d}</td><td class="num">${s.l}</td><td class="num">${s.gd > 0 ? "+" : ""}${s.gd}</td><td class="num"><b>${s.pts}</b></td></tr>`)
  );
}
function telBlock(p) {
  if (!p.telMP) return "";
  return `<div class="card" style="margin-top:12px"><h3>Telemetry</h3><div class="two">
    <div><span>Shots</span><b>${p.shots}</b></div><div><span>SoT</span><b>${p.sot} (${pct(p.sot, p.shots)})</b></div>
    <div><span>Throws</span><b>${p.throws}</b></div><div><span>xG</span><b>${fmt(p.xG, 2)}</b></div>
    <div><span>xGoT</span><b>${fmt(p.xGoT, 2)}</b></div><div><span>G − xG</span><b>${p.overperf >= 0 ? "+" : ""}${fmt(p.overperf, 2)}</b></div>
  </div><p class="tiny" style="margin-top:8px">xG = 0.055×off-target + 0.34×SoT + 0.008×throws. xGoT = 0.41×SoT + 0.05×max(SoT−1,0).</p></div>`;
}
function viewHome() {
  const t = STATE.db.totals;
  const table = Object.values(STATE.db.players).sort((a, b) => b.elo - a.elo);
  if (!STATE.db.comps.length) return `<h1>${esc(STATE.sports[STATE.currentSport]?.label || STATE.currentSport)}</h1><p class="sub">Dedicated sports archive</p><div class="card"><h3>Archive awaiting data</h3><p class="tiny">This sport has its own isolated pages and statistics. Add competitions to its season files in data/manifest.json to populate the archive. No results or player stats have been fabricated.</p></div>`;
  return `<h1>${esc(scopeLabel())}</h1><p class="sub">One club per owner. Elo opens at ${ELO0}.</p>
    <div class="kpis">${kpi("Matches", t.matches, t.goals + " goals")}${kpi("Players", t.players, t.clubs + " clubs")}${kpi("Top Elo", table[0] ? fmt(table[0].elo, 1) : "—", table[0] ? table[0].name : "")}${t.telMatches ? kpi("Telemetry", t.telMatches, "xG " + fmt(t.xG, 1)) : ""}</div>
    <div class="card"><h3>Elo table</h3>${eloTable(table)}</div>`;
}
function viewSeason() {
  const comps = STATE.db.comps;
  return `<h1>Season ledger</h1><p class="sub">${scopeLabel()}</p>
    <div class="card">${comps.map(c => `<div class="row"><div><span class="click" data-go="#/comp/${c.id}">${esc(c.name)}</span><div class="tiny">${esc(c.season)} · ${sectorName(c.sec)} · ${c.tel ? "TEL" : "box"} · ${c.matches.length} matches</div></div></div>`).join("")}</div>`;
}
function viewComps() {
  return `<h1>Competitions</h1><div class="clubs">${STATE.db.comps.map(c => `<div class="card clubcard" data-go="#/comp/${c.id}"><div class="tiny">${esc(c.season)} · ${sectorName(c.sec)} · ${c.tel ? "telemetry" : "box score"}</div><div class="nm">${esc(c.name)}</div><div class="tiny">${c.matches.length} matches</div></div>`).join("")}</div>`;
}
function viewComp(id) {
  const c = STATE.db.comps.find(x => x.id === id); if (!c) return miss();
  const table = Object.values(STATE.db.byComp[id] || {}).sort((a, b) => b.pts - a.pts || b.gd - a.gd);
  const ms = STATE.db.tape.filter(m => m._comp === id);
  return `<h1>${esc(c.name)}</h1><p class="sub">${esc(c.season)} · ${sectorName(c.sec)} · ${c.tel ? "telemetry on" : "telemetry off"}</p>
    <div class="card"><h3>Table</h3>${table.length ? standings(table) : "<p class='tiny'>—</p>"}</div>
    <div class="card" style="margin-top:12px"><h3>Honours</h3><div class="pillrow">${(c.awards || []).map(h => `<div class="honor"><b>${esc(h.label)}</b>${esc(h.recipient)}</div>`).join("") || "—"}</div></div>
    ${ms.length ? `<div class="card" style="margin-top:12px"><h3>Matches</h3>${matchTable(ms)}</div>` : ""}`;
}
function viewPlayers() {
  const rows = Object.values(STATE.db.players).sort((a, b) => b.gf - a.gf || b.elo - a.elo);
  return `<h1>Players</h1><div class="card">${tableHtml(
    [{ l: "#" }, { l: "Player" }, { l: "Club" }, { l: "MP", num: 1 }, { l: "G", num: 1 }, { l: "W-D-L", num: 1 }, { l: "Elo", num: 1 }],
    rows.map((p, i) => `<tr class="click" data-go="#/player/${p.id}"><td>${i + 1}</td><td>${esc(p.name)}</td><td class="tiny">${esc([...p.clubs][0] || "")}</td><td class="num">${p.mp}</td><td class="num">${p.gf}</td><td class="num">${p.w}-${p.d}-${p.l}</td><td class="num">${fmt(p.elo, 1)}</td></tr>`)
  )}</div>`;
}
function viewPlayer(id) {
  const p = Object.values(STATE.db.players).find(x => x.id === id || slug(x.name) === id); if (!p) return miss();
  const ms = STATE.db.tape.filter(m => m.home === p.name || m.away === p.name);
  return `<h1>${esc(p.name)}</h1><p class="sub">${scopeLabel()} · ${esc([...p.clubs][0] || "—")} · Elo ${fmt(p.elo, 1)}</p>
    <div class="kpis">${kpi("Record", p.w + "-" + p.d + "-" + p.l, p.mp + " played")}${kpi("Goals", p.gf + ":" + p.ga, (p.gd >= 0 ? "+" : "") + p.gd)}${kpi("Titles", p.titles, "")}${kpi("Elo", fmt(p.elo, 1), "")}</div>
    ${telBlock(p)}<div class="card" style="margin-top:12px"><h3>Matches</h3>${matchTable(ms)}</div>`;
}
function viewClubs() {
  const rows = Object.values(STATE.db.clubs).sort((a, b) => b.elo - a.elo);
  return `<h1>Clubs</h1><div class="clubs">${rows.map(s => `<div class="card clubcard" data-go="#/club/${s.id}"><div class="tiny">${esc(s.player)}</div><div class="nm">${esc(s.name)}</div><div class="meta"><span>Elo ${fmt(s.elo, 1)}</span><span>${s.w}-${s.d}-${s.l}</span></div></div>`).join("")}</div>`;
}
function viewClub(id) {
  const s = Object.values(STATE.db.clubs).find(c => c.id === id); if (!s) return miss();
  const ms = STATE.db.tape.filter(m => m.homeClub === s.name || m.awayClub === s.name);
  return `<h1>${esc(s.name)}</h1><p class="sub">${playerA(s.player)}</p><div class="card">${matchTable(ms)}</div>${telBlock(s)}`;
}
function viewMatches() { return `<h1>Match log</h1><p class="sub">${STATE.db.tape.length} results</p><div class="card">${matchTable(STATE.db.tape)}</div>`; }
function viewMatch(i) {
  const m = STATE.db.tape[+i]; if (!m) return miss();
  const x = STATE.db.extra[m._i] || {};
  return `<h1 class="scoreline">${esc(m.home)} ${m.hg}–${m.ag} ${esc(m.away)}</h1>
    <p class="sub">${esc(m._compName)} · ${esc(m.stage)}${m.pens ? " · pens " + m.pens : ""}</p>
    <div class="grid g2"><div class="card">${playerA(m.home)}<div class="tiny">${esc(m.homeClub)}</div>${kpi("Δ", (x.dH >= 0 ? "+" : "") + fmt(x.dH, 2), "Elo " + fmt(x.eloH_after, 1))}</div>
    <div class="card">${playerA(m.away)}<div class="tiny">${esc(m.awayClub)}</div>${kpi("Δ", (x.dA >= 0 ? "+" : "") + fmt(x.dA, 2), "Elo " + fmt(x.eloA_after, 1))}</div></div>
    ${m.tel ? `<div class="card" style="margin-top:12px"><h3>Telemetry</h3><div class="two"><div><span>Shots</span><b>${m.shH}–${m.shA}</b></div><div><span>SoT</span><b>${m.sotH}–${m.sotA}</b></div><div><span>Throws</span><b>${m.thH}–${m.thA}</b></div><div><span>xG</span><b>${fmt(m.xG_h, 2)}–${fmt(m.xG_a, 2)}</b></div><div><span>xGoT</span><b>${fmt(m.xGoT_h, 2)}–${fmt(m.xGoT_a, 2)}</b></div></div></div>` : ""}`;
}
function viewElo() {
  const rows = Object.values(STATE.db.players).sort((a, b) => b.elo - a.elo);
  return `<h1>Elo</h1><div class="card">${eloTable(rows)}</div>`;
}
function viewStats() {
  const all = Object.values(STATE.db.players);
  const boards = [
    ["Goals", [...all].sort((a, b) => b.gf - a.gf), s => s.gf],
    ["Elo", [...all].sort((a, b) => b.elo - a.elo), s => fmt(s.elo, 1)],
    ["Titles", [...all].sort((a, b) => b.titles - a.titles), s => s.titles],
    ["xG", [...all].filter(p => p.telMP).sort((a, b) => b.xG - a.xG), s => fmt(s.xG, 2)],
    ["G − xG", [...all].filter(p => p.telMP).sort((a, b) => b.overperf - a.overperf), s => (s.overperf >= 0 ? "+" : "") + fmt(s.overperf, 2)],
    ["Shots", [...all].filter(p => p.telMP).sort((a, b) => b.shots - a.shots), s => s.shots]
  ];
  return `<h1>Stats</h1><p class="sub">${scopeLabel()}</p><div class="grid g3">${boards.map(([t, rows, fv]) => `<div class="card"><h3>${t}</h3>${rows.slice(0, 8).map((s, i) => `<div class="row"><span class="tiny">${i + 1}. <span class="click" data-go="#/player/${s.id}">${esc(s.name)}</span></span><b>${fv(s)}</b></div>`).join("") || "<p class='tiny'>—</p>"}</div>`).join("")}</div>`;
}
function viewDocs() {
  return `<h1>Notation</h1><p class="sub">CSN 2.1 · CSV matches · tel=1 · sec= · one club per owner</p>
    <div class="card"><pre class="spec">m(\n  home,away,hg,ag,stage,pens,yc,rc,shH,sotH,thH,shA,sotA,thA\n  Anish,Vyom,5,3,GS,,,,16,9,8,12,6,7\n)</pre>
    <p class="tiny" style="margin-top:8px">xG = 0.055×(shots−SoT) + 0.34×SoT + 0.008×throws. Only 2026B Pioneer Cup has tel=1.</p></div>`;
}
function viewSectors() {
  const groups = {};
  STATE.allComps.forEach(c => { const k = String(c.sec || 1); (groups[k] || (groups[k] = [])).push(c); });
  const keys = Object.keys(groups).sort((a, b) => +a - +b);
  return `<h1>Sectors</h1><div class="clubs">${keys.map(k => `<div class="card clubcard" data-go="#/sector/${k}"><div class="tiny">Sector ${esc(k)}</div><div class="nm">${esc(sectorName(k))}</div><div class="tiny">${groups[k].length} competitions</div></div>`).join("")}
    <div class="card clubcard" data-go="#/global"><div class="nm">GLOBAL</div></div></div>`;
}
function viewSector(id) {
  const comps = STATE.db.comps.filter(c => +c.sec === +id);
  return `<h1>${esc(sectorName(id))}</h1><p class="sub">${scopeLabel()}</p>
    <div class="pageact"><button data-go="#/sectors">All sectors</button><button data-go="#/global/sector/${id}">GLOBAL this sector</button></div>
    <div class="clubs">${comps.map(c => `<div class="card clubcard" data-go="#/comp/${c.id}"><div class="tiny">${esc(c.season)} · ${c.tel ? "TEL" : "box"}</div><div class="nm">${esc(c.name)}</div></div>`).join("")}</div>
    <div class="card" style="margin-top:12px">${matchTable(STATE.db.tape)}</div>`;
}
function viewGlobal() {
  const t = STATE.db.totals;
  const table = Object.values(STATE.db.players).sort((a, b) => b.elo - a.elo);
  return `<h1>GLOBAL</h1><p class="sub">Every season on one tape.</p>
    <div class="kpis">${kpi("Matches", t.matches, t.goals + " goals")}${kpi("Players", t.players, "")}${kpi("Tel", t.telMatches, t.xG ? "xG " + fmt(t.xG, 1) : "")}</div>
    <div class="card">${eloTable(table)}</div>`;
}
function miss() { return `<div class="card"><h1>Not in the index</h1></div>`; }
function renderTabs(active) {
  const items = [["home", "Overview", "#/"], ["global", "Global", "#/global"], ["sectors", "Sectors", "#/sectors"], ["season", "Season", "#/season"], ["comps", "Competitions", "#/comps"], ["players", "Players", "#/players"], ["clubs", "Clubs", "#/clubs"], ["matches", "Matches", "#/matches"], ["elo", "Elo", "#/elo"], ["stats", "Stats", "#/stats"], ["docs", "Notation", "#/docs"]];
  $("#tabs").innerHTML = items.map(([k, l, href]) => `<a href="${href}" class="${active === k ? "on" : ""}">${l}</a>`).join("");
}
function filteredComps(mode, seasonId, sector) {
  return STATE.allComps.filter(c => {
    if ((c.sport || "futsal") !== STATE.currentSport) return false;
    if (mode !== "global" && seasonId && c.season !== seasonId) return false;
    if (sector && +c.sec !== +sector) return false;
    return true;
  });
}
function rebuildDb() {
  Object.keys(OWNER_CLUB).forEach(k => delete OWNER_CLUB[k]);
  STATE.db = compute(filteredComps(STATE.scope.mode, STATE.scope.seasonId, STATE.scope.sector));
  const t = STATE.db.totals;
  $("#countLine").textContent = `${t.players} players · ${t.clubs} clubs · ${t.matches} matches · Elo ${ELO0}`;
  $("#dateLine").textContent = scopeLabel();
  const sel = $("#seasonSel"); if (sel) sel.value = STATE.scope.mode === "global" ? "GLOBAL" : (STATE.scope.seasonId || "");
  const secSel = $("#sectorSel"); if (secSel) secSel.value = STATE.scope.sector ? String(STATE.scope.sector) : "ALL";
}
function applyHashScope(parts) {
  const view = parts[0] || "home";
  let { mode, seasonId, sector } = STATE.scope;
  if (view === "global") { mode = "global"; seasonId = null; sector = parts[1] === "sector" ? parts[2] : null; }
  else if (view === "sector") sector = parts[1];
  else if (view === "season" && parts[1] && parts[2] === "sector") {
    mode = "season"; seasonId = parts[1]; sector = parts[3];
    const entry = STATE.manifest.seasons.find(s => s.id === seasonId);
    if (entry) STATE.season = entry;
  }
  const changed = mode !== STATE.scope.mode || seasonId !== STATE.scope.seasonId || String(sector || "") !== String(STATE.scope.sector || "");
  STATE.scope = { mode, seasonId, sector };
  if (changed) rebuildDb();
}
function setScope(mode, seasonId, sector) {
  STATE.scope = { mode, seasonId, sector };
  if (seasonId) {
    const entry = STATE.manifest.seasons.find(s => s.id === seasonId);
    if (entry) STATE.season = entry;
  }
  rebuildDb();
  route();
}
function route() {
  if (!STATE.db) return;
  const parts = (location.hash || "#/").replace(/^#/, "").split("/").filter(Boolean);
  const view = parts[0] || "home", id = parts[1], sub = parts[2];
  const tabMap = { home: "home", global: "global", sectors: "sectors", sector: "sectors", season: "season", comps: "comps", comp: "comps", clubs: "clubs", club: "clubs", players: "players", player: "players", matches: "matches", match: "matches", elo: "elo", stats: "stats", docs: "docs" };
  renderTabs(tabMap[view] || "home");
  applyHashScope(parts);
  let html = miss();
  if (!parts[0] || view === "home") html = viewHome();
  else if (view === "global" && id === "sector") html = viewSector(sub);
  else if (view === "global") html = viewGlobal();
  else if (view === "sectors") html = viewSectors();
  else if (view === "sector") html = viewSector(id);
  else if (view === "season" && id && sub === "sector") html = viewSector(parts[3]);
  else if (view === "season") html = viewSeason();
  else if (view === "comps") html = viewComps();
  else if (view === "comp") html = viewComp(id);
  else if (view === "clubs") html = viewClubs();
  else if (view === "club") html = viewClub(id);
  else if (view === "players") html = viewPlayers();
  else if (view === "player") html = viewPlayer(id);
  else if (view === "matches") html = viewMatches();
  else if (view === "match") html = viewMatch(id);
  else if (view === "elo") html = viewElo();
  else if (view === "stats") html = viewStats();
  else if (view === "docs") html = viewDocs();
  else html = viewHome();
  $("#view").innerHTML = html;
  window.scrollTo(0, 0);
}
function searchNow() {
  if (!STATE.db) return;
  const q = $("#q").value.trim().toLowerCase();
  if (!q) return;
  const pl = Object.values(STATE.db.players).find(p => p.name.toLowerCase().includes(q));
  if (pl) return go("#/player/" + pl.id);
  const cl = Object.values(STATE.db.clubs).find(c => c.name.toLowerCase().includes(q));
  if (cl) return go("#/club/" + cl.id);
  const comp = STATE.db.comps.find(c => c.name.toLowerCase().includes(q) || c.id === q);
  if (comp) return go("#/comp/" + comp.id);
}
async function loadAll() {
  try {
    const man = await fetch(DATA_ROOT + "manifest.json").then(r => { if (!r.ok) throw new Error("manifest.json " + r.status); return r.json(); });
    STATE.manifest = man;
    STATE.sports = man.sports || { futsal: { label: "Futsal" }, cricsal: { label: "Cricsal" }, football: { label: "Football" }, handcricket: { label: "HandCricket" } };
    STATE.currentSport = sessionStorage.getItem("casper-sport") || man.defaultSport || "futsal";
    const sportSel = $("#sportSel");
    sportSel.innerHTML = Object.entries(STATE.sports).map(([id, s]) => `<option value="${id}">${esc(s.label || id)}</option>`).join("");
    sportSel.value = STATE.currentSport;
    sportSel.onchange = () => { STATE.currentSport = sportSel.value; sessionStorage.setItem("casper-sport", STATE.currentSport); const next = (man.seasons || []).find(s => (s.sport || "futsal") === STATE.currentSport); if (next) { STATE.season = next; setScope("season", next.id, null); } else setScope("global", null, null); };
    if (man.sectors) Object.assign(SECTOR_NAMES, man.sectors);
    $("#brand").innerHTML = esc(man.brand || "CASPER") + ` <small id="tagline">${esc(man.tagline || "")}</small>`;
    if (man.org) $("#org").textContent = man.org;
    document.title = (man.brand || "CASPER") + " Archive";
    STATE.allComps = [];
    for (const entry of (man.seasons || [])) {
      const raw = await fetch(DATA_ROOT + entry.file).then(r => { if (!r.ok) throw new Error(entry.file + " " + r.status); return r.text(); });
      const parsed = parseCSN(raw);
      parsed.comps.forEach(c => { c.season = entry.id; c.sport = entry.sport || "futsal"; });
      STATE.allComps.push(...parsed.comps);
    }
    const sel = $("#seasonSel");
    sel.innerHTML = `<option value="GLOBAL">GLOBAL</option>` + (man.seasons || []).map(s => `<option value="${s.id}">${esc(s.label || s.id)}</option>`).join("");
    const secs = [...new Set(STATE.allComps.map(c => String(c.sec || 1)))].sort((a, b) => +a - +b);
    const secSel = $("#sectorSel");
    secSel.innerHTML = `<option value="ALL">All sectors</option>` + secs.map(k => `<option value="${k}">${esc(k + " · " + sectorName(k))}</option>`).join("");
    const want = sessionStorage.getItem("casper-season") || man.defaultSeason || "2026A";
    const wantSec = sessionStorage.getItem("casper-sector") || "ALL";
    sel.value = want; secSel.value = wantSec;
    sel.onchange = () => {
      sessionStorage.setItem("casper-season", sel.value);
      const sector = secSel.value === "ALL" ? null : secSel.value;
      if (sel.value === "GLOBAL") { go("#/global"); setScope("global", null, sector); }
      else { STATE.season = man.seasons.find(s => s.id === sel.value); go("#/"); setScope("season", sel.value, sector); }
    };
    secSel.onchange = () => {
      sessionStorage.setItem("casper-sector", secSel.value);
      const sector = secSel.value === "ALL" ? null : secSel.value;
      if (sel.value === "GLOBAL") { go(sector ? "#/global/sector/" + sector : "#/global"); setScope("global", null, sector); }
      else { go(sector ? "#/season/" + sel.value + "/sector/" + sector : "#/"); setScope("season", sel.value, sector); }
    };
    if (want === "GLOBAL") setScope("global", null, wantSec === "ALL" ? null : wantSec);
    else {
      const entry = man.seasons.find(s => s.id === want) || man.seasons[0];
      STATE.season = entry;
      setScope("season", entry.id, wantSec === "ALL" ? null : wantSec);
    }
  } catch (e) {
    $("#view").innerHTML = `<div class="err"><b>Could not index data/</b><p class="tiny">${esc(e.message)}</p></div>`;
  }
}
document.addEventListener("DOMContentLoaded", () => {
  $("#q").addEventListener("keydown", ev => { if (ev.key === "Enter") searchNow(); });
  $("#goSearch").addEventListener("click", searchNow);
  window.addEventListener("hashchange", route);
  document.addEventListener("click", ev => {
    const el = ev.target.closest("[data-go]");
    if (el) { ev.preventDefault(); go(el.dataset.go); }
  });
  loadAll();
});

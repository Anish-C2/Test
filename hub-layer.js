/* CASPER Gazette hub layer */
function parseDay(s){const m=String(s||"").match(/^(\d{2})(\d{2})(\d{4})$/);return m?Date.UTC(+m[3],+m[2]-1,+m[1]):0}
function chronoMatches(){return state.archive.slice().sort((a,b)=>parseDay(a.startDate)-parseDay(b.startDate)||String(a.id).localeCompare(String(b.id))).flatMap(c=>c.matches.map(m=>({c,m})))}
function expectedScore(ra,rb){return 1/(1+Math.pow(10,(rb-ra)/400))}
function resultFromMatch(m){
  if(m.walkoverWinner) return m.walkoverWinner===m.home?1:m.walkoverWinner===m.away?0:null;
  if(m.homeScore==null||m.awayScore==null) return null;
  if(m.homeScore>m.awayScore) return 1;
  if(m.homeScore<m.awayScore) return 0;
  if(m.penalties) return m.penalties[0]===m.penalties[1]?0.5:(m.penalties[0]>m.penalties[1]?1:0);
  return 0.5;
}
function kFactor(sport,m){let k=/cricket|cricsal|handcricket/.test(sport)?28:24;if(m&&m.homeScore!=null&&m.awayScore!=null)k*=Math.min(1.8,Math.sqrt(1+Math.abs(m.homeScore-m.awayScore)/3));return k}
function computeElo(sportFilter="all"){
  const map=new Map();
  const ensure=(name,code)=>{const key=name.toLowerCase();if(!map.has(key))map.set(key,{name,code,rating:1500,peak:1500,played:0,w:0,d:0,l:0,lastDelta:0,form:[],sports:new Set()});return map.get(key)};
  for(const {c,m} of chronoMatches()){
    if(sportFilter!=="all"&&c.sport!==sportFilter) continue;
    if(!m.homeName||!m.awayName) continue;
    const res=resultFromMatch(m); if(res==null) continue;
    const home=ensure(m.homeName,m.home),away=ensure(m.awayName,m.away);
    home.sports.add(c.sport);away.sports.add(c.sport);
    const k=kFactor(c.sport,m),eh=expectedScore(home.rating,away.rating);
    const dh=k*(res-eh),da=k*((1-res)-(1-eh));
    home.rating+=dh;away.rating+=da;home.lastDelta=dh;away.lastDelta=da;
    home.peak=Math.max(home.peak,home.rating);away.peak=Math.max(away.peak,away.rating);
    home.played++;away.played++;
    if(res===1){home.w++;away.l++;home.form.push("W");away.form.push("L")}
    else if(res===0){home.l++;away.w++;home.form.push("L");away.form.push("W")}
    else {home.d++;away.d++;home.form.push("D");away.form.push("D")}
  }
  return [...map.values()].map(t=>({...t,rating:Math.round(t.rating),peak:Math.round(t.peak),lastDelta:Math.round(t.lastDelta),sports:[...t.sports],form:t.form.slice(-8)})).sort((a,b)=>b.rating-a.rating||b.played-a.played);
}
function formHtml(form){return (form||[]).map(ch=>`<span class="formchip ${ch}">${ch}</span>`).join("")}
function deltaHtml(n){return !n?`<span class="elo-same">0</span>`:n>0?`<span class="elo-up">+${n}</span>`:`<span class="elo-down">${n}</span>`}
function eloTable(rows){
  if(!rows.length) return `<p class="muted">Not enough decided matches to compute Elo.</p>`;
  return `<div class="tablewrap"><table><thead><tr><th>#</th><th>Club</th><th>Elo</th><th>Peak</th><th>Last</th><th>P</th><th>W</th><th>D</th><th>L</th><th>Form</th><th>Sports</th></tr></thead><tbody>${rows.map((t,i)=>`<tr><td>${i+1}</td><td><a class="textlink" href="#/club/${encodeURIComponent(slug(t.name))}"><b>${esc(t.name)}</b></a></td><td><b>${t.rating}</b></td><td>${t.peak}</td><td>${deltaHtml(t.lastDelta)}</td><td>${t.played}</td><td>${t.w}</td><td>${t.d}</td><td>${t.l}</td><td>${formHtml(t.form)}</td><td>${t.sports.map(sportName).join(", ")}</td></tr>`).join("")}</tbody></table></div>`;
}
function scorersBoard(sport="all"){
  const map=new Map();
  const add=(name,kind,n,club)=>{name=String(name||"").trim();if(!name)return;const key=name.toLowerCase();if(!map.has(key))map.set(key,{name,goals:0,assists:0,clubs:new Set()});const p=map.get(key);p[kind]+=n;if(club)p.clubs.add(club)};
  state.archive.forEach(c=>{
    if(sport!=="all"&&c.sport!==sport)return;
    c.matches.forEach(m=>{
      [["gh","goals",m.homeName],["ga","goals",m.awayName],["ah","assists",m.homeName],["aa","assists",m.awayName]].forEach(([key,kind,club])=>{
        const list=m.events?.[key]; if(!list)return;
        list.split("+").forEach(token=>{const hit=token.trim().match(/^(.+?)\s*\*\s*(\d+)$/);if(hit)add(hit[1],kind,Number(hit[2]),club);else if(token.trim())add(token.trim(),kind,1,club)});
      });
    });
  });
  return [...map.values()].map(p=>({...p,clubs:[...p.clubs]})).sort((a,b)=>b.goals-a.goals||b.assists-a.assists);
}
function scorersTable(rows){
  if(!rows.length) return `<p class="muted">No named scoring events in this filter.</p>`;
  return `<div class="tablewrap"><table><thead><tr><th>#</th><th>Player</th><th>Goals</th><th>Assists</th><th>Clubs</th></tr></thead><tbody>${rows.map((p,i)=>`<tr><td>${i+1}</td><td><a class="textlink" href="#/player/${encodeURIComponent(slug(p.name))}"><b>${esc(p.name)}</b></a></td><td><b>${p.goals}</b></td><td>${p.assists}</td><td>${esc(p.clubs.join(", "))}</td></tr>`).join("")}</tbody></table></div>`;
}
function cricketBoard(sport){
  const map=new Map();
  const ensure=name=>{const key=name.toLowerCase();if(!map.has(key))map.set(key,{name,played:0,runs:0,conceded:0,wicketsLost:0,wicketsTaken:0,fours:0,sixes:0,extras:0});return map.get(key)};
  state.archive.filter(c=>c.sport===sport).forEach(c=>c.matches.forEach(m=>{
    if(!m.ballData)return;
    const h=ensure(m.homeName),a=ensure(m.awayName);
    h.played++;a.played++;
    h.runs+=m.ballData.home.runs;a.runs+=m.ballData.away.runs;
    h.conceded+=m.ballData.away.runs;a.conceded+=m.ballData.home.runs;
    h.wicketsLost+=m.ballData.home.wickets;a.wicketsLost+=m.ballData.away.wickets;
    h.wicketsTaken+=m.ballData.away.wickets;a.wicketsTaken+=m.ballData.home.wickets;
    h.fours+=m.ballData.home.fours;a.fours+=m.ballData.away.fours;
    h.sixes+=m.ballData.home.sixes;a.sixes+=m.ballData.away.sixes;
    h.extras+=m.ballData.home.extras;a.extras+=m.ballData.away.extras;
  }));
  return [...map.values()].sort((x,y)=>y.runs-x.runs);
}
function cricketTable(rows){
  if(!rows.length) return `<p class="muted">No ball-by-ball innings recorded.</p>`;
  return `<div class="tablewrap"><table><thead><tr><th>#</th><th>Club</th><th>P</th><th>Runs</th><th>Conc.</th><th>Wkts lost</th><th>Wkts taken</th><th>4s</th><th>6s</th><th>Extras</th></tr></thead><tbody>${rows.map((t,i)=>`<tr><td>${i+1}</td><td><a class="textlink" href="#/club/${encodeURIComponent(slug(t.name))}"><b>${esc(t.name)}</b></a></td><td>${t.played}</td><td><b>${t.runs}</b></td><td>${t.conceded}</td><td>${t.wicketsLost}</td><td>${t.wicketsTaken}</td><td>${t.fours}</td><td>${t.sixes}</td><td>${t.extras}</td></tr>`).join("")}</tbody></table></div>`;
}
function honorsForClub(name,code){
  const rows=[];
  state.archive.forEach(c=>Object.entries(c.awards||{}).forEach(([award,value])=>{
    if(value===code||value===name||c.teams?.[value]?.name===name) rows.push({award,competition:c});
  }));
  return rows;
}
function titlesForClub(name,code){
  return state.archive.filter(x=>Object.entries(x.awards||{}).some(([k,v])=>/champion|winner|^ch$/i.test(k.replace(/\s+/g,""))&&(v===code||v===name||x.teams?.[v]?.name===name)));
}
function headToHead(name){
  const map=new Map();
  state.archive.forEach(c=>{
    const entry=Object.entries(c.teams||{}).find(([,t])=>t.name===name); if(!entry)return;
    const [code]=entry;
    c.matches.forEach(m=>{
      if(m.home!==code&&m.away!==code)return;
      const oppName=m.home===code?m.awayName:m.homeName;
      if(!map.has(oppName)) map.set(oppName,{name:oppName,p:0,w:0,d:0,l:0});
      const flipped={...m,home:code,away:m.home===code?m.away:m.home,homeScore:m.home===code?m.homeScore:m.awayScore,awayScore:m.home===code?m.awayScore:m.homeScore,penalties:m.home===code?m.penalties:(m.penalties?[m.penalties[1],m.penalties[0]]:null)};
      const res=resultFromMatch(flipped); if(res==null)return;
      const row=map.get(oppName); row.p++; if(res===1)row.w++; else if(res===0)row.l++; else row.d++;
    });
  });
  return [...map.values()].sort((a,b)=>b.p-a.p||b.w-a.w);
}
function rankingsPage(){
  const sports=state.config.sports.filter(s=>state.archive.some(c=>c.sport===s.id));
  return pageTitle("FEDERATION LADDER","Multi-sport Elo Rankings","One rating across every decided CASPER match, plus a ladder per sport.")+
    `<div class="method"><b>Method.</b> Clubs start at 1500. Expected score is 1 / (1 + 10<sup>((opp − own) / 400)</sup>). Rating moves by K × (result − expected). K is 24 for football/futsal and 28 for cricket formats, scaled a little by score margin. Walkovers count. Shoot-outs decide Elo on drawn regulation scores only.</div>
    <div class="tabs" id="eloTabs"><button class="tab active" data-elo="all">Multi-sport</button>${sports.map(s=>`<button class="tab" data-elo="${esc(s.id)}">${esc(s.name)}</button>`).join("")}</div>
    <div id="eloPanel">${eloTable(computeElo())}</div>`;
}
function honorsPage(){
  const rows=state.archive.flatMap(c=>Object.entries(c.awards||{}).map(([award,value])=>({c,award,label:c.teams?.[value]?.name||value})));
  return pageTitle("ROLL OF HONOR","Honors & Distinctions","Every award field kept from the source archive.")+
    `<div class="toolbar"><input id="hq" placeholder="Search award, club, competition..."></div><div id="honorResults">${honorsList(rows)}</div>`;
}
function honorsList(rows){
  if(!rows.length) return `<p class="empty">No honors recorded.</p>`;
  return rows.map(r=>`<div class="awardrow"><a href="#/competition/${encodeURIComponent(r.c.id)}"><b>${esc(r.c.name)}</b></a><span>${esc(r.award)} · ${esc(r.c.season)} · ${esc(sportName(r.c.sport))}</span><b>${esc(r.label)}</b></div>`).join("");
}
function recordsPage(){
  const wins=state.archive.flatMap(c=>c.matches.filter(m=>m.homeScore!=null).map(m=>{
    const gd=Math.abs(m.homeScore-m.awayScore);
    const winner=m.homeScore>=m.awayScore?m.homeName:m.awayName;
    const loser=m.homeScore>=m.awayScore?m.awayName:m.homeName;
    const score=m.homeScore>=m.awayScore?`${m.homeScore}-${m.awayScore}`:`${m.awayScore}-${m.homeScore}`;
    return {c,m,gd,winner,loser,score,total:m.homeScore+m.awayScore};
  }));
  const titles=allTeams().map(t=>({...t,n:titlesForClub(t.name,t.code).length})).sort((a,b)=>b.n-a.n);
  return pageTitle("RECORDS DESK","Federation Records","Derived only from archived scorelines and awards.")+
    `<div class="statgrid">${Object.entries(totalStats()).map(([k,v])=>`<div class="statbox"><small>${esc(k)}</small><b>${v}</b></div>`).join("")}</div>
    <div class="homegrid"><section>${section("Widest winning margins")}${wins.slice().sort((a,b)=>b.gd-a.gd).slice(0,10).map(x=>`<article class="matchline"><div class="match-meta">${esc(x.c.name)} · margin ${x.gd}</div><div class="match-teams"><b>${esc(x.winner)}</b><strong>${esc(x.score)}</strong><b>${esc(x.loser)}</b></div></article>`).join("")}</section>
    <aside>${section("Highest combined scores")}${wins.slice().sort((a,b)=>b.total-a.total).slice(0,8).map(x=>matchLine(x.c,x.m)).join("")}</aside></div>
    ${section("Championship clubs")}<div class="clubgrid">${titles.filter(t=>t.n).map(t=>`<a class="clubcard" href="#/club/${encodeURIComponent(slug(t.name))}"><small>${t.n} TITLE RECORD(S)</small><b>${esc(t.name)}</b></a>`).join("")}</div>
    ${section("Named scorers")}${scorersTable(scorersBoard().slice(0,20))}
    ${section("Handcricket innings")}${cricketTable(cricketBoard("handcricket"))}
    ${section("Cricsal innings")}${cricketTable(cricketBoard("cricsal"))}`;
}
function enrichClubPage(){
  const id=state.route[1]; if(!id)return;
  const club=allTeams().find(x=>slug(x.name)===id); if(!club)return;
  const root=$("#app"); if(!root)return;
  const globalElo=computeElo().find(x=>x.name===club.name);
  const honors=honorsForClub(club.name,club.code);
  const h2h=headToHead(club.name);
  const sportElos=state.config.sports.map(sp=>{const row=computeElo(sp.id).find(x=>x.name===club.name);return row?{sport:sp.name,...row}:null}).filter(Boolean);
  const extra=`<div class="detailfacts"><div><small>MULTI-SPORT ELO</small><b>${globalElo?globalElo.rating:"—"}</b></div><div><small>PEAK ELO</small><b>${globalElo?globalElo.peak:"—"}</b></div><div><small>FORM</small><b>${globalElo?formHtml(globalElo.form):"—"}</b></div></div>
    ${section("Elo by sport")}${sportElos.length?`<div class="tablewrap"><table><thead><tr><th>Sport</th><th>Elo</th><th>Peak</th><th>P</th><th>W-D-L</th></tr></thead><tbody>${sportElos.map(r=>`<tr><td>${esc(r.sport)}</td><td><b>${r.rating}</b></td><td>${r.peak}</td><td>${r.played}</td><td>${r.w}-${r.d}-${r.l}</td></tr>`).join("")}</tbody></table></div>`:""}
    ${section("All recorded honors")}<div class="awardgrid">${honors.map(t=>`<a class="award" href="#/competition/${encodeURIComponent(t.competition.id)}"><small>${esc(t.award)} · ${esc(t.competition.season)}</small><b>${esc(t.competition.name)}</b></a>`).join("")||'<p class="muted">No honors.</p>'}</div>
    ${section("Head-to-head")}${h2h.length?`<div class="tablewrap"><table><thead><tr><th>Opponent</th><th>P</th><th>W</th><th>D</th><th>L</th></tr></thead><tbody>${h2h.map(r=>`<tr><td><a class="textlink" href="#/club/${encodeURIComponent(slug(r.name))}">${esc(r.name)}</a></td><td>${r.p}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td></tr>`).join("")}</tbody></table></div>`:""}`;
  const ledger=root.querySelector(".sectionhead");
  if(ledger) ledger.insertAdjacentHTML("beforebegin",extra); else root.insertAdjacentHTML("beforeend",extra);
}
function enrichSportPage(){
  const id=state.route[1]; if(!id)return;
  const root=$("#app"); if(!root)return;
  const bat=["cricket","cricsal","handcricket"].includes(id);
  root.insertAdjacentHTML("beforeend", section("Sport Elo rankings")+eloTable(computeElo(id))+
    (["football","futsal"].includes(id)?section("Scoring ledger")+scorersTable(scorersBoard(id)):"")+
    (bat?section("Innings ledger")+cricketTable(cricketBoard(id)):""));
}
function enrichHome(){
  const root=$("#app"); if(!root||root.querySelector("[data-hub-elo]"))return;
  root.insertAdjacentHTML("beforeend", `<div data-hub-elo>${section("Multi-sport Elo ladder",`<a href="#/rankings">FULL RANKINGS →</a>`)}${eloTable(computeElo().slice(0,10))}</div>`);
}
const _hubOldRender=typeof render==="function"?render:function(){};
function hubRender(){
  const parts=decodeURIComponent(location.hash.replace(/^#\/?/, "")).split("/").filter(Boolean);
  state.route=parts;
  const page=parts[0]||"home";
  const extra={rankings:rankingsPage,honors:honorsPage,records:recordsPage};
  if(extra[page]){
    $("#app").innerHTML=extra[page]();
    $$("#nav a").forEach(a=>a.classList.toggle("active",a.dataset.route===page));
    if(page==="rankings"){$$("#eloTabs .tab").forEach(b=>b.addEventListener("click",()=>{$$("#eloTabs .tab").forEach(x=>x.classList.toggle("active",x===b));$("#eloPanel").innerHTML=eloTable(computeElo(b.dataset.elo))}))}
    if(page==="honors"){$("#hq")?.addEventListener("input",()=>{const q=$("#hq").value.toLowerCase();const rows=state.archive.flatMap(c=>Object.entries(c.awards||{}).map(([award,value])=>({c,award,label:c.teams?.[value]?.name||value}))).filter(r=>[r.c.name,r.award,r.label,r.c.season].join(" ").toLowerCase().includes(q));$("#honorResults").innerHTML=honorsList(rows)})}
    window.scrollTo(0,0); return;
  }
  _hubOldRender();
  if(page==="home") enrichHome();
  if(page==="sport") enrichSportPage();
  if(page==="club") enrichClubPage();
}
render=hubRender;
if(state.config) render();
const ed=document.getElementById("edition-date");
if(ed) ed.textContent=new Date().toLocaleDateString("en-IN",{weekday:"long",day:"2-digit",month:"long",year:"numeric"});

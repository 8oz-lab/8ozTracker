// EUW Flex Live-Tracker: Backend (Node 18+, Express)
const express = require('express');
const fs = require('fs');
const path = require('path');

const KEY = process.env.RIOT_API_KEY;
if (!KEY) { console.error('RIOT_API_KEY fehlt (Umgebungsvariable setzen).'); process.exit(1); }

const PORT = process.env.PORT || 3000;
const TOP_N = +process.env.TOP_N || 1000;
const IDLE_MS = (+process.env.IDLE_RECHECK_SEC || 180) * 1000;     // Kürzlich aktive Spieler: alle 3 Min prüfen
const INGAME_MS = (+process.env.INGAME_RECHECK_SEC || 360) * 1000; // Im Spiel (lange laufend): Kontrollprüfung alle 6 Min; das Ende meldet vor allem die Ladder
const LADDER_MS = (+process.env.LADDER_REFRESH_SEC || 120) * 1000; // Ladder alle 2 Min neu laden (3 Calls); steigende Spielzahl = Spiel beendet
const MIN_GAME_MS = 15 * 60 * 1000;                                // Vor Ablauf nicht neu prüfen
const RECENT_MS = 60 * 60 * 1000;                                  // Seite "Zuletzt gespielt": letzte Stunde
const NAME_EVERY = +process.env.NAME_FILL_EVERY || 30;                  // Fehlende Namen: bei jeder n-ten Abfrage einen nachladen
// LP-Grenzen (Cutoffs): LP des Spielers auf diesen Plätzen, abgeleitet aus der ohnehin geladenen Ladder (keine Zusatzabfragen)
const CUT_RANKS = (process.env.CUTOFF_RANKS || '200,700,1000').split(',').map(Number).filter(n => n > 0);
const CUT_LABELS = { 200: 'Challenger-Cutoff', 700: 'Grandmaster-Cutoff', 1000: 'Top 1000' };
const CUT_HIST_MS = (+process.env.CUTOFF_HIST_SEC || 600) * 1000;   // Verlaufspunkt alle 10 Min
const CUT_KEEP_MS = 50 * 3600e3;                                    // 50 h Verlauf behalten
// Jungle Tendencies: Rolle wird am Smite-Zauber erkannt (Spectator liefert keine Rolle), Statistik aus live beobachteten Spielen
const JG_MIN_GAMES = +process.env.JUNGLE_MIN_GAMES || 5;      // Mindestanzahl beobachteter Spiele
const JG_SHARE = +process.env.JUNGLE_MIN_SHARE || 0.7;        // mehr als 70 % Jungle
const JG_TOP = +process.env.JUNGLE_TOP || 30;
const SMITE_IDS = [11, 711];
// Spielersuche: letzte Flex-Spiele eines beliebigen Spielers (Match-V5, ca. 22 Abfragen pro Suche)
const SEARCH_N = Math.max(1, Math.min(50, +process.env.SEARCH_GAMES || 20));
const SEARCH_CACHE_MS = (+process.env.SEARCH_CACHE_SEC || 900) * 1000;   // Ergebnis einer Suche so lange wiederverwenden
const SEARCH_PER_HOUR = +process.env.SEARCH_PER_HOUR || 8;               // neue Suchen pro Besucher und Stunde
const SEARCH_QUEUE_MAX = +process.env.SEARCH_QUEUE_MAX || 10;            // wartende Suchen insgesamt
const MATCH_CACHE_MAX = +process.env.MATCH_CACHE_MAX || 3000;            // gemerkte Spiele (ändern sich nie)
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'state.json');
// Rate-Limits als "Anzahl/Sekunden". Dev-Key: 20/1,100/120. Production-Key z. B. 500/10,30000/600
const LIMITS = (process.env.RATE_LIMITS || '20/1,100/120').split(',').map(s => {
  const [n, w] = s.split('/').map(Number); return { n, w: w * 1000 };
});

const PLATFORM = 'https://euw1.api.riotgames.com';
const REGIONAL = 'https://europe.api.riotgames.com';
const QUEUE = 'RANKED_FLEX_SR';
const FLEX_QUEUE_ID = 440;

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Öffentliche Spieler-ID für die Weboberfläche (Reihenfolge der Erfassung, keine Riot-IDs nach außen)
// Zähler: echte Riot-Abfragen und durch geteilte Partien gesparte Abfragen
const stats = { spellOk: 0, noSpell: 0, calls: 0, startSaved: 0, recheckSaved: 0, nameCalls: 0,
               endByLadder: 0, endByRecheck: 0, lagSum: 0, lagN: 0, searchCalls: 0, searches: 0, matchHits: 0 };

let pidCounter = 0;
const ensurePid = p => { if (!p.pid) p.pid = ++pidCounter; return p; };

// --- Champion-Daten aus Data Dragon (statische Dateien, zählen nicht gegen das Riot-API-Limit) ---
let champs = null;
async function loadChampions() {
  try {
    const v = (await (await fetch('https://ddragon.leagueoflegends.com/api/versions.json')).json())[0];
    const c = (await (await fetch(`https://ddragon.leagueoflegends.com/cdn/${v}/data/de_DE/champion.json`)).json()).data;
    const map = {};
    for (const k of Object.keys(c)) map[c[k].key] = [c[k].name, c[k].id];
    champs = { v, c: map };
    console.log('Champion-Daten geladen:', v, Object.keys(map).length, 'Champions');
  } catch (e) { console.log('Champion-Daten konnten nicht geladen werden:', e.message); }
}

// --- Rate-Limiter (gleitende Fenster) ---
// Riot zählt die Limits je Region (euw1 und europe getrennt), darum bekommt jeder Host seinen eigenen Zähler
const buckets = {};
let prioWaiting = 0; // Suchanfragen von Besuchern haben Vorrang vor dem Hintergrund-Tracking
async function slot(url, prio) {
  const host = url.split('/')[2];
  const hist = buckets[host] || (buckets[host] = LIMITS.map(() => []));
  if (prio) prioWaiting++;
  try {
    for (;;) {
      if (!prio && prioWaiting > 0) { await sleep(100); continue; }
      const now = Date.now(); let wait = 0;
      LIMITS.forEach((l, i) => {
        const h = hist[i];
        while (h.length && now - h[0] >= l.w) h.shift();
        if (h.length >= l.n) wait = Math.max(wait, l.w - (now - h[0]));
      });
      if (!wait) break;
      await sleep(wait + 10);
    }
    const now = Date.now();
    hist.forEach(h => h.push(now));
  } finally { if (prio) prioWaiting--; }
}

async function riot(url, prio) {
  for (;;) {
    await slot(url, prio);
    stats.calls++; if (prio) stats.searchCalls++;
    let r;
    try { r = await fetch(url, { headers: { 'X-Riot-Token': KEY } }); }
    catch (e) { await sleep(5000); continue; }
    if (r.status === 429) {
      const s = +r.headers.get('retry-after') || 5;
      console.log('429 Rate-Limit, warte', s, 's');
      await sleep(s * 1000); continue;
    }
    if (r.status === 200) return { status: 200, data: await r.json() };
    return { status: r.status };
  }
}

// --- Zustand (wird auf Platte gesichert, damit PUUIDs/Namen einen Neustart überleben) ---
const players = new Map(); // key -> Spieler
let lastLadder = 0;
let statsSince = Date.now(); // seit wann die Spielstatistik (Jungle) gezählt wird
let cutNow = null;         // { t, lp: [...] } aktueller Stand der Grenzen
const cutHist = [];        // Verlauf: [t, lp1, lp2, ...]

function saveState() {
  try {
    const t = Date.now();
    const list = [...players.values()].map(p => {
      const o = { key: p.key, puuid: p.puuid, summonerId: p.summonerId, name: p.name, rank: p.rank, lp: p.lp,
                  tier: p.tier, games: p.games, lastActive: p.lastActive, endedAt: p.endedAt,
                  wins: p.wins, losses: p.losses, prevRank: p.prevRank, firstSeen: p.firstSeen, jg: p.jg, cg: p.cg };
      // Spieldaten nur sichern, solange sie angezeigt werden (hält die Datei klein)
      if (p.game && (p.status === 'ingame' || (p.endedAt && t - p.endedAt < RECENT_MS))) o.game = p.game;
      return o;
    });
    fs.writeFileSync(DATA_FILE, JSON.stringify({ lastLadder, statsSince, players: list, cutHist }));
  } catch (e) { /* Dateisystem evtl. nicht beschreibbar: kein Problem */ }
}
function loadState() {
  try {
    const s = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    lastLadder = s.lastLadder || 0;
    if (s.statsSince) statsSince = s.statsSince;
    if (Array.isArray(s.cutHist)) for (const r of s.cutHist) if (Array.isArray(r) && r.length === CUT_RANKS.length + 1) cutHist.push(r); // nur passend zur aktuellen Einstellung
    for (const p of s.players || []) players.set(p.key, ensurePid({ ...p, status: 'unknown', next: 0 }));
    console.log('Zustand geladen:', players.size, 'Spieler');
  } catch (e) { /* noch kein Zustand vorhanden */ }
}

async function loadLadder() {
  const entries = []; let complete = true;
  for (const tier of ['challenger', 'grandmaster', 'master']) {
    const r = await riot(`${PLATFORM}/lol/league/v4/${tier}leagues/by-queue/${QUEUE}`);
    if (r.status !== 200) { console.log('Ladder', tier, 'HTTP', r.status); complete = false; continue; }
    for (const e of r.data.entries || []) entries.push({ ...e, tier });
  }
  if (!entries.length) return;
  entries.sort((a, b) => b.leaguePoints - a.leaguePoints);
  const keep = new Set(); const now = Date.now();
  // LP-Grenzen nur aus einer vollständigen Ladder berechnen (fehlt eine Liga, wären die Plätze falsch)
  if (complete) {
    const lp = CUT_RANKS.map(r => (entries[r - 1] ? entries[r - 1].leaguePoints : null));
    cutNow = { t: now, lp };
    const last = cutHist[cutHist.length - 1];
    if (!last || now - last[0] >= CUT_HIST_MS) cutHist.push([now, ...lp]);
    while (cutHist.length && now - cutHist[0][0] > CUT_KEEP_MS) cutHist.shift();
  }
  entries.slice(0, TOP_N).forEach((e, i) => {
    const key = e.puuid || e.summonerId;
    keep.add(key);
    const p = players.get(key) || ensurePid({ key, puuid: e.puuid || null, summonerId: e.summonerId, status: 'unknown', next: 0, firstSeen: now });
    const games = (e.wins || 0) + (e.losses || 0);
    // Mehr Flex-Spiele als beim letzten Mal: Spieler ist aktiv und wird bevorzugt geprüft
    if (p.games != null && games > p.games) {
      // Steigende Spielzahl = ein Flex-Spiel ist beendet: Spieler sofort prüfen
      p.lastActive = now; p.next = 0;
      if (p.status === 'ingame') p.byLadder = now; // die Ladder meldet das Ende des laufenden Spiels
      else if (p.endedBy === 'check' && p.endedAt && now - p.endedAt < 20 * 60 * 1000 && p.lagFor !== p.endedAt) {
        stats.lagSum += now - p.endedAt; stats.lagN++; p.lagFor = p.endedAt; // Messung: Ladder später als die Spectator-Prüfung
      }
      // Flex-Spiel beendet, das wir evtl. nicht live gesehen haben
      if (p.status !== 'ingame' && (!p.endedAt || now - p.endedAt > 20 * 60 * 1000)) { p.endedAt = now; p.game = null; p.endedBy = 'ladder'; }
    }
    const rank = i + 1;
    if (p.rank != null && p.rank !== rank) p.prevRank = p.rank; // letzte Rangänderung merken
    Object.assign(p, { rank, lp: e.leaguePoints, tier: e.tier, games, wins: e.wins || 0, losses: e.losses || 0 });
    players.set(key, p);
  });
  for (const k of [...players.keys()]) if (!keep.has(k)) players.delete(k);
  for (const q of players.values()) if (q.leader && !players.has(q.leader)) { q.leader = null; q.next = 0; } // Leiter ist aus der Liste gefallen
  lastLadder = now;
  console.log('Ladder geladen:', players.size, 'Spieler');
  saveState();
}

// Aktive Spieler häufiger prüfen, lange inaktive selten (spart API-Budget)
function idleDelay(p, now) {
  if (!p.firstSeen) p.firstSeen = now;
  // Spielende werden ohnehin über die Ladder erkannt, daher können lange Inaktive selten geprüft werden
  if (!p.lastActive) return now - p.firstSeen < 72 * 3600e3 ? IDLE_MS * 6 : IDLE_MS * 20; // Aktivität noch unbekannt
  const age = now - p.lastActive;
  if (age < 3 * 3600e3) return IDLE_MS;        // kürzlich aktiv
  if (age < 24 * 3600e3) return IDLE_MS * 3;
  if (age < 72 * 3600e3) return IDLE_MS * 6;
  return IDLE_MS * 20;                         // seit Tagen nichts gespielt
}

async function fetchName(p) {
  const a = await riot(`${REGIONAL}/riot/account/v1/accounts/by-puuid/${p.puuid}`);
  if (a.status === 200) p.name = `${a.data.gameName}#${a.data.tagLine}`;
}

// Fehlende Namen nach und nach nachladen (beste Ränge zuerst); einmalig pro Spieler, danach gespeichert
async function fillName() {
  const now = Date.now(); let best = null;
  for (const q of players.values())
    if (!q.name && q.puuid && (!q.nameTried || now - q.nameTried > 3600e3) && (!best || q.rank < best.rank)) best = q;
  if (!best) return false;
  best.nameTried = now; stats.nameCalls++;
  await fetchName(best);
  return true;
}

const FOLLOW_MS = 2 * 3600e3; // Mitläufer werden nur zur Sicherheit nach 2 h selbst geprüft

// Wer hat das Spielende gemeldet: die Ladder (Spielzahl gestiegen) oder die normale Kontrollprüfung?
function noteEnd(p, now) {
  if (p.byLadder && now - p.byLadder < 15 * 60 * 1000) stats.endByLadder++; else stats.endByRecheck++;
  p.byLadder = null;
}

function byPuuid(id) { for (const q of players.values()) if (q.puuid === id) return q; return null; }

// Eine Partie ist vorbei: alle getrackten Spieler darin sind fertig, ohne Einzelabfragen
function endGame(gid, now) {
  for (const q of players.values()) {
    if (q.status !== 'ingame' || !q.game || q.game.id !== gid) continue;
    if (q.leader) stats.recheckSaved += Math.max(0, Math.floor((now - ((q.start || now) + MIN_GAME_MS)) / INGAME_MS) + 1); // Schätzung
    q.status = 'idle'; q.endedAt = now; q.endedBy = 'check'; q.lastActive = now; q.leader = null;
    q.next = now + idleDelay(q, now);
  }
}

// Rolle und Champion eines getrackten Spielers im aktuellen Spiel zählen (einmal pro Spiel, ohne Zusatzabfrage)
function recordRole(q, g) {
  if (q.cg === g.gameId) return; // dieses Spiel wurde schon gezählt
  const me = (g.participants || []).find(x => x.puuid === q.puuid);
  if (!me) return;
  if (me.spell1Id == null && me.spell2Id == null) { stats.noSpell++; return; } // Zauber fehlen: nicht zählen statt falsch zu zählen
  stats.spellOk++;
  q.cg = g.gameId;
  const st = q.jg || (q.jg = { n: 0, j: 0, ch: {} });
  st.n++;
  if (SMITE_IDS.includes(me.spell1Id) || SMITE_IDS.includes(me.spell2Id)) { st.j++; st.ch[me.championId] = (st.ch[me.championId] || 0) + 1; }
}

// Weitere getrackte Spieler in derselben Partie übernehmen, ohne sie einzeln abzufragen
function shareGame(p, g, now) {
  for (const x of g.participants || []) {
    if (x.puuid === p.puuid) continue;
    const q = byPuuid(x.puuid);
    if (!q) continue;
    if (q.status === 'ingame' && q.game && q.game.id === g.gameId) {
      if (!q.leader) { // war selbst Leiter dieser Partie: ab jetzt Mitläufer von p
        for (const r of players.values()) if (r.leader === q.key) r.leader = p.key;
        q.leader = p.key; q.next = now + FOLLOW_MS;
      }
      continue;
    }
    if (q.status === 'ingame' && q.game) endGame(q.game.id, now); // alte Partie war unbemerkt zu Ende
    Object.assign(q, { status: 'ingame', start: p.start, game: p.game, leader: p.key, lastActive: now, checked: now, next: now + FOLLOW_MS });
    if (!q.name && x.riotId) q.name = x.riotId;
    stats.startSaved++;
    recordRole(q, g);
  }
}

async function check(p) {
  if (!p.puuid) { // Fallback, falls die Ladder keine PUUID liefert
    const s = await riot(`${PLATFORM}/lol/summoner/v4/summoners/${p.summonerId}`);
    if (s.status !== 200) { p.next = Date.now() + 60000; return; }
    p.puuid = s.data.puuid;
  }
  const r = await riot(`${PLATFORM}/lol/spectator/v5/active-games/by-summoner/${p.puuid}`);
  const now = Date.now();
  p.checked = now;
  const wasIn = p.status === 'ingame'; // lief beim letzten Check ein Flex-Spiel?
  const oldGid = p.game ? p.game.id : null;
  if (r.status === 200) {
    const g = r.data;
    const start = g.gameStartTime || now;
    p.lastActive = now;
    if (wasIn && oldGid && oldGid !== g.gameId) { noteEnd(p, now); endGame(oldGid, now); } // direkt ein neues Spiel gestartet
    p.leader = null;
    if (g.gameQueueConfigId !== FLEX_QUEUE_ID) { // anderer Modus: wird nicht angezeigt
      p.status = 'idle'; p.next = Math.max(now + IDLE_MS, start + MIN_GAME_MS);
    } else {
      p.status = 'ingame'; p.start = start;
      p.next = Math.max(now + INGAME_MS, start + MIN_GAME_MS);
      // Alles, was die Spectator-Antwort ohnehin liefert, wird behalten (keine Zusatzabfragen)
      const parts = g.participants || [];
      p.game = {
        id: g.gameId, start,
        bans: (g.bannedChampions || []).filter(b => b.championId > 0).map(b => ({ t: b.teamId, c: b.championId })),
        players: parts.map(x => ({ n: x.riotId || x.summonerName || null, c: x.championId, t: x.teamId, u: x.puuid })),
      };
      if (!p.name) {
        const me = parts.find(x => x.puuid === p.puuid);
        if (me && me.riotId) p.name = me.riotId; // steckt schon in der Antwort
        else await fetchName(p);
      }
      recordRole(p, g);
      shareGame(p, g, now); // andere getrackte Spieler in dieser Partie gleich mit erfassen
    }
  } else if (r.status === 404) {
    if (wasIn && oldGid) { noteEnd(p, now); endGame(oldGid, now); } // Flex-Spiel vorbei: gilt für alle getrackten Spieler darin
    p.leader = null;
    p.status = 'idle'; p.next = now + idleDelay(p, now);
    if (!p.name && p.endedAt && now - p.endedAt < RECENT_MS) await fetchName(p); // einmalig, danach gespeichert
  } else if (r.status === 401 || r.status === 403) {
    console.log('API-Key ungültig oder abgelaufen (HTTP', r.status + '). Neuen Key setzen.');
    p.next = now + 60000; await sleep(60000);
  } else {
    p.next = now + 60000;
  }
}

let sinceName = 0;
async function loop() {
  for (;;) {
    try {
      if (!players.size || Date.now() - lastLadder > LADDER_MS) await loadLadder();
      if (!players.size) { await sleep(30000); continue; }
      const now = Date.now();
      let due = null;
      for (const p of players.values()) if (p.next <= now && (!due || p.next < due.next)) due = p;
      if (due) { await check(due); if (++sinceName >= NAME_EVERY) { sinceName = 0; await fillName(); } }
      else if (!(await fillName())) await sleep(1000);
    } catch (e) { console.error(e); await sleep(5000); }
  }
}


// --- Spielersuche: letzte Flex-Spiele eines beliebigen Spielers ---
// Ablauf je Suche: Riot-ID auflösen (1), Rang (1), laufendes Spiel (1), Spielliste (1), je Spiel 1 Abfrage. Bereits bekannte Spiele,
// Namen und frische Ergebnisse kosten nichts. Es läuft immer nur eine Suche gleichzeitig, weitere warten in einer Schlange.
const matchCache = new Map();   // matchId -> kompaktes Spiel (ändert sich nie)
const accountCache = new Map(); // "name#tag" (klein) -> { puuid, name }
const resultCache = new Map();  // puuid -> { t, prof, matches }
const jobs = new Map();         // normalisierte Eingabe -> Suchauftrag
const queue = [];
let working = false;
const ipHits = new Map();

const normQ = q => String(q || '').trim().replace(/\s+/g, ' ').toLowerCase();
const userErr = m => Object.assign(new Error(m), { user: true });
const capMap = (m, max) => { while (m.size > max) m.delete(m.keys().next().value); };

function compactMatch(m) {
  const i = m && m.info; if (!i || !Array.isArray(i.participants)) return null;
  return { id: m.metadata.matchId, t: i.gameStartTimestamp || i.gameCreation || 0, d: i.gameDuration || 0,
    e: i.participants.some(x => x.gameEndedInEarlySurrender) ? 1 : 0,
    ps: i.participants.map(x => ({ u: x.puuid, n: x.riotIdGameName ? `${x.riotIdGameName}#${x.riotIdTagline}` : (x.summonerName || ''),
      c: x.championId, t: x.teamId, w: x.win ? 1 : 0, k: x.kills || 0, d: x.deaths || 0, a: x.assists || 0,
      cs: (x.totalMinionsKilled || 0) + (x.neutralMinionsKilled || 0), pos: x.teamPosition || '',
      dmg: x.totalDamageDealtToChampions || 0, g: x.goldEarned || 0, l: x.champLevel || 0,
      it: [0, 1, 2, 3, 4, 5, 6].map(n => x['item' + n] || 0) })) };
}
// Ansicht für die Weboberfläche: PUUIDs bleiben auf dem Server; andere Top-1000-Spieler bekommen ihren Ladder-Rang
function viewMatch(m, puuid) {
  const me = m.ps.find(x => x.u === puuid); if (!me) return null;
  return { id: m.id, t: m.t, d: m.d, e: m.e, w: me.w, pos: me.pos, c: me.c, k: me.k, a: me.a, de: me.d, cs: me.cs, dmg: me.dmg, g: me.g, l: me.l, it: me.it,
    ps: m.ps.map(x => {
      const q = x.u !== puuid ? byPuuid(x.u) : null;
      if (q && !q.name && x.n.includes('#')) q.name = x.n; // Name nebenbei gelernt, ohne Zusatzabfrage
      return { n: x.n, c: x.c, t: x.t, k: x.k, d: x.d, a: x.a, dmg: x.dmg, pos: x.pos, me: x.u === puuid, r: q && q.rank ? q.rank : null };
    }) };
}

// Eingabe unter den getrackten Spielern suchen: "#123" = Ladder-Platz, "Name#Tag" = genau, "Name" = Anfang des Namens
function findTracked(key) {
  const all = [...players.values()];
  const mr = /^#(\d{1,4})$/.exec(key);
  if (mr) return all.filter(p => p.rank === +mr[1] && p.puuid);
  if (key.includes('#')) return all.filter(p => p.puuid && p.name && p.name.toLowerCase() === key);
  if (key.length < 3) return [];
  return all.filter(p => p.puuid && p.name && p.name.toLowerCase().startsWith(key + '#')).sort((a, b) => a.rank - b.rank);
}

async function runJob(job) {
  job.state = 'running'; job.updated = Date.now();
  try {
    let p = job.tracked, puuid, name;
    if (p) { puuid = p.puuid; name = p.name; }
    else {
      let a = accountCache.get(job.key);
      if (!a) {
        const r = await riot(`${REGIONAL}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(job.gn)}/${encodeURIComponent(job.tag)}`, true);
        if (r.status === 404) throw userErr('Spieler nicht gefunden. Prüfe Name und Tag (z. B. Name#EUW).');
        if (r.status !== 200) throw userErr('Riot antwortet gerade nicht (Fehler ' + r.status + '). Bitte später erneut versuchen.');
        a = { puuid: r.data.puuid, name: `${r.data.gameName}#${r.data.tagLine}` };
        accountCache.set(job.key, a); capMap(accountCache, 2000);
      }
      puuid = a.puuid; name = a.name; p = byPuuid(puuid); // evtl. doch ein getrackter Spieler
    }
    if (p && !p.name) { await fetchName(p); }
    if (p && p.name) name = p.name;
    job.prof = { name: name || null, tracked: !!(p && p.rank), rank: p && p.rank || null };

    // Rang, Live-Status und Jungle-Anteil: bei getrackten Spielern aus den vorhandenen Daten (0 Abfragen)
    const prof = job.prof;
    if (p && p.rank) {
      Object.assign(prof, { tier: p.tier, lp: p.lp, w: p.wins || 0, l: p.losses || 0 });
      prof.live = p.status === 'ingame' ? { start: p.start, c: ownChamp(p) } : null;
      prof.lastEnd = p.endedAt || null;
      if (p.jg && p.jg.n) prof.jg = { g: p.jg.n, j: p.jg.j, ch: Object.entries(p.jg.ch).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([c, k]) => [+c, k]) };
    } else {
      const rc0 = resultCache.get(puuid);
      if (rc0 && Date.now() - rc0.t < SEARCH_CACHE_MS) {
        job.prof = rc0.prof; job.matches = rc0.matches; job.total = job.loaded = rc0.matches.length; job.cached = true;
        job.state = 'done'; job.updated = Date.now(); return;
      }
      const lr = await riot(`${PLATFORM}/lol/league/v4/entries/by-puuid/${puuid}`, true);
      const e = lr.status === 200 && Array.isArray(lr.data) ? lr.data.find(x => x.queueType === QUEUE) : null;
      if (e) Object.assign(prof, { tier: e.tier.toLowerCase(), div: e.rank, lp: e.leaguePoints, w: e.wins, l: e.losses });
      else prof.unranked = true;
      const gr = await riot(`${PLATFORM}/lol/spectator/v5/active-games/by-summoner/${puuid}`, true);
      if (gr.status === 200 && gr.data.gameQueueConfigId === FLEX_QUEUE_ID) {
        const me = (gr.data.participants || []).find(x => x.puuid === puuid);
        prof.live = { start: gr.data.gameStartTime, c: me ? me.championId : null };
      } else prof.live = null;
    }
    const rc = resultCache.get(puuid);
    if (rc && Date.now() - rc.t < SEARCH_CACHE_MS) {
      if (!(p && p.rank)) job.prof = rc.prof;
      job.matches = rc.matches; job.total = job.loaded = rc.matches.length; job.cached = true;
      job.state = 'done'; job.updated = Date.now(); return;
    }
    job.updated = Date.now();

    const ir = await riot(`${REGIONAL}/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=${FLEX_QUEUE_ID}&start=0&count=${SEARCH_N}`, true);
    if (ir.status !== 200) throw userErr('Die Spielliste konnte nicht geladen werden (Fehler ' + ir.status + '). Bitte später erneut versuchen.');
    job.total = ir.data.length; job.loaded = 0; job.matches = [];
    for (const id of ir.data) {
      let m = matchCache.get(id);
      if (m) stats.matchHits++;
      else {
        const r = await riot(`${REGIONAL}/lol/match/v5/matches/${id}`, true);
        if (r.status === 200) { m = compactMatch(r.data); if (m) { matchCache.set(id, m); capMap(matchCache, MATCH_CACHE_MAX); } }
      }
      job.loaded++;
      const v = m && viewMatch(m, puuid); if (v) job.matches.push(v);
      job.updated = Date.now();
    }
    resultCache.set(puuid, { t: Date.now(), prof: job.prof, matches: job.matches }); capMap(resultCache, 300);
    job.state = 'done'; job.updated = Date.now(); stats.searches++;
  } catch (e) {
    job.state = 'error'; job.updated = Date.now();
    job.error = e.user ? e.message : 'Die Suche ist fehlgeschlagen. Bitte später erneut versuchen.';
    if (!e.user) console.error('Suche fehlgeschlagen:', e);
  }
}
async function worker() {
  if (working) return; working = true;
  try { while (queue.length) await runJob(queue.shift()); } finally { working = false; }
}
setInterval(() => {
  const t = Date.now();
  for (const [k, j] of jobs) if ((j.state === 'done' && t - j.updated > SEARCH_CACHE_MS) || (j.state === 'error' && t - j.updated > 60e3)) jobs.delete(k);
  for (const [k, r] of resultCache) if (t - r.t > SEARCH_CACHE_MS * 4) resultCache.delete(k);
  for (const [ip, a] of ipHits) { const b = a.filter(x => t - x < 3600e3); if (b.length) ipHits.set(ip, b); else ipHits.delete(ip); }
}, 60e3).unref();

// --- Web ---
const app = express();
app.use('/img', express.static('public/img', { maxAge: '7d' }));
app.use(express.static('public', { extensions: ['html'], maxAge: '1h' }));
// Champion, den der Spieler im zuletzt gesehenen Spiel gespielt hat (aus den ohnehin gespeicherten Spieldaten)
function ownChamp(p) {
  if (!p.game) return null;
  const me = p.game.players.find(x => x.u ? x.u === p.puuid : x.me);
  return me ? me.c : null;
}

app.get('/api/status', (req, res) => {
  const all = [...players.values()];
  const ingame = all.filter(p => p.status === 'ingame').sort((a, b) => a.rank - b.rank)
    .map(p => ({ id: p.pid, hasGame: !!p.game, gid: p.game ? p.game.id : null, rank: p.rank, name: p.name || null, lp: p.lp, tier: p.tier, start: p.start }));
  res.set('Cache-Control', 'public, max-age=5');
  const t = Date.now();
  const recent = all.filter(p => p.status !== 'ingame' && p.endedAt && t - p.endedAt < RECENT_MS)
    .sort((a, b) => b.endedAt - a.endedAt)
    .map(p => ({ id: p.pid, hasGame: !!p.game, gid: p.game ? p.game.id : null, c: ownChamp(p), rank: p.rank, name: p.name || null, lp: p.lp, endedAt: p.endedAt }));
  res.json({ total: all.length, checked: all.filter(p => p.checked).length, ingame, recent, api: { calls: stats.calls, searchCalls: stats.searchCalls, searches: stats.searches, matchCacheHits: stats.matchHits, matchesCached: matchCache.size, nameCalls: stats.nameCalls, savedStarts: stats.startSaved, savedRechecksEstimate: stats.recheckSaved,
           endDetect: { byLadder: stats.endByLadder, byRecheck: stats.endByRecheck,
                        ladderLagAvgMin: stats.lagN ? Math.round(stats.lagSum / stats.lagN / 6000) / 10 : null, samples: stats.lagN } }, now: t });
});

app.get('/api/leaderboard', (req, res) => {
  res.set('Cache-Control', 'public, max-age=30');
  const list = [...players.values()].filter(p => p.rank).sort((a, b) => a.rank - b.rank)
    .map(p => ({ r: p.rank, n: p.name || null, lp: p.lp, t: p.tier, w: p.wins || 0, l: p.losses || 0,
                 d: p.prevRank ? p.prevRank - p.rank : 0, i: p.status === 'ingame' }));
  res.json({ updated: lastLadder, now: Date.now(), list });
});
app.get('/api/cutoffs', (req, res) => {
  res.set('Cache-Control', 'public, max-age=30');
  const l = cutHist[cutHist.length - 1];
  const cur = cutNow || (l ? { t: l[0], lp: l.slice(1) } : null);
  res.json({ ranks: CUT_RANKS, labels: CUT_RANKS.map(r => CUT_LABELS[r] || 'Platz ' + r),
             updated: cur ? cur.t : null, current: cur ? cur.lp : null, history: cutHist, now: Date.now() });
});
app.get('/api/jungle', (req, res) => {
  res.set('Cache-Control', 'public, max-age=30');
  const min = Math.max(1, Math.min(50, parseInt(req.query && req.query.min, 10) || JG_MIN_GAMES));
  const all = [...players.values()], seen = all.filter(p => p.jg && p.jg.n > 0);
  const list = seen.filter(p => p.jg.n >= min && p.jg.j / p.jg.n > JG_SHARE && p.rank).sort((a, b) => a.rank - b.rank).slice(0, JG_TOP)
    .map(p => ({ r: p.rank, n: p.name || null, lp: p.lp, t: p.tier, g: p.jg.n, j: p.jg.j,
                 ch: Object.entries(p.jg.ch).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, k]) => [+c, k]) }));
  const qualified = seen.filter(p => p.jg.n >= min && p.jg.j / p.jg.n > JG_SHARE).length;
  res.json({ list, meta: { since: statsSince, now: Date.now(), total: all.length, observed: seen.length, enough: seen.filter(p => p.jg.n >= min).length,
                           qualified, minGames: min, share: JG_SHARE, top: JG_TOP, spellOk: stats.spellOk, noSpell: stats.noSpell } });
});
app.set('trust proxy', 1);
app.get('/api/player', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const q = String(req.query.q || '').trim().slice(0, 60), key = normQ(q);
  const snap = j => ({ state: j.state, error: j.error || null, pos: j.state === 'queued' ? queue.indexOf(j) + 1 : 0, total: j.total || 0, loaded: j.loaded || 0,
                       prof: j.prof || null, matches: j.matches || [], cached: !!j.cached, queries: SEARCH_N, now: Date.now() });
  if (key.length < 2) return res.status(400).json({ error: 'Bitte gib einen Namen ein, am besten mit Tag (Name#EUW).' });
  const old = jobs.get(key);
  if (old) return res.json(snap(old));

  const found = findTracked(key);
  if (/^#\d+$/.test(key) && !found.length) return res.status(404).json({ error: 'Kein Spieler auf diesem Ladder-Platz bekannt.' });
  if (found.length > 1) return res.json({ state: 'choose', options: found.slice(0, 10).map(p => ({ n: p.name, r: p.rank })) });
  let job = { key, state: 'queued', tracked: found[0] || null, updated: Date.now() };
  if (!job.tracked) {
    const i = q.lastIndexOf('#');
    if (i < 1) return res.status(400).json({ error: 'Spieler nicht in den Top 1000 gefunden. Für alle anderen gib den Riot-ID mit Tag ein, z. B. Name#EUW.' });
    job.gn = q.slice(0, i).trim(); job.tag = q.slice(i + 1).trim();
    if (!job.gn || job.gn.length > 16 || !/^[\p{L}\p{N}]{2,5}$/u.test(job.tag)) return res.status(400).json({ error: 'Ungültige Riot-ID. Format: Name#Tag (z. B. Name#EUW).' });
  }
  // Frisches Ergebnis oder bekannter Spieler im Cache kostet nichts und zählt nicht gegen das Limit
  const free = job.tracked && resultCache.has(job.tracked.puuid);
  if (!free) {
    const t = Date.now(), hits = (ipHits.get(req.ip) || []).filter(x => t - x < 3600e3);
    if (hits.length >= SEARCH_PER_HOUR) {
      const mins = Math.max(1, Math.ceil((3600e3 - (t - hits[0])) / 60e3));
      return res.status(429).json({ error: `Du hast das Limit von ${SEARCH_PER_HOUR} Suchen pro Stunde erreicht. Bitte warte etwa ${mins} Minuten.` });
    }
    if (queue.length >= SEARCH_QUEUE_MAX) return res.status(503).json({ error: 'Gerade sind viele Suchen in der Warteschlange. Bitte in einer Minute erneut versuchen.' });
    hits.push(t); ipHits.set(req.ip, hits);
  }
  jobs.set(key, job); queue.push(job); worker();
  res.json(snap(job));
});

app.get('/api/champions', (req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  res.json(champs || { v: null, c: {} });
});
app.get('/api/game/:id', (req, res) => {
  const p = [...players.values()].find(x => String(x.pid) === req.params.id);
  if (!p || !p.game) return res.status(404).json({});
  res.set('Cache-Control', 'public, max-age=10');
  // k = Ladder-Rang, wenn der Mitspieler ebenfalls zu den getrackten Top-Spielern gehört (ohne Zusatzabfrage; PUUIDs verlassen den Server nicht)
  res.json({ ...p.game, players: p.game.players.map(x => {
    const me = x.u ? x.u === p.puuid : !!x.me, q = x.u && !me ? byPuuid(x.u) : null;
    return { n: x.n, c: x.c, t: x.t, me, k: q && q.rank ? q.rank : null };
  }) });
});

loadState();
loadChampions();
setInterval(loadChampions, 6 * 3600e3);
setInterval(() => console.log(`Riot-Abfragen: ${stats.calls}, gespart durch geteilte Partien: ${stats.startSaved} (Start), ca. ${stats.recheckSaved} (Re-Checks)`), 10 * 60e3);
setInterval(() => { if (!champs) loadChampions(); }, 5 * 60e3);
setInterval(saveState, 120000);
process.on('SIGTERM', () => { saveState(); process.exit(0); });
app.listen(PORT, () => { console.log('Tracker läuft auf Port', PORT); loop(); });

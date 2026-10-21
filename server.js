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
const stats = { calls: 0, startSaved: 0, recheckSaved: 0, nameCalls: 0,
               endByLadder: 0, endByRecheck: 0, lagSum: 0, lagN: 0 };

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
const hist = LIMITS.map(() => []);
async function slot() {
  for (;;) {
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
}

async function riot(url) {
  for (;;) {
    await slot();
    stats.calls++;
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

function saveState() {
  try {
    const t = Date.now();
    const list = [...players.values()].map(p => {
      const o = { key: p.key, puuid: p.puuid, summonerId: p.summonerId, name: p.name, rank: p.rank, lp: p.lp,
                  tier: p.tier, games: p.games, lastActive: p.lastActive, endedAt: p.endedAt,
                  wins: p.wins, losses: p.losses, prevRank: p.prevRank, firstSeen: p.firstSeen };
      // Spieldaten nur sichern, solange sie angezeigt werden (hält die Datei klein)
      if (p.game && (p.status === 'ingame' || (p.endedAt && t - p.endedAt < RECENT_MS))) o.game = p.game;
      return o;
    });
    fs.writeFileSync(DATA_FILE, JSON.stringify({ lastLadder, players: list }));
  } catch (e) { /* Dateisystem evtl. nicht beschreibbar: kein Problem */ }
}
function loadState() {
  try {
    const s = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    lastLadder = s.lastLadder || 0;
    for (const p of s.players || []) players.set(p.key, ensurePid({ ...p, status: 'unknown', next: 0 }));
    console.log('Zustand geladen:', players.size, 'Spieler');
  } catch (e) { /* noch kein Zustand vorhanden */ }
}

async function loadLadder() {
  const entries = [];
  for (const tier of ['challenger', 'grandmaster', 'master']) {
    const r = await riot(`${PLATFORM}/lol/league/v4/${tier}leagues/by-queue/${QUEUE}`);
    if (r.status !== 200) { console.log('Ladder', tier, 'HTTP', r.status); continue; }
    for (const e of r.data.entries || []) entries.push({ ...e, tier });
  }
  if (!entries.length) return;
  entries.sort((a, b) => b.leaguePoints - a.leaguePoints);
  const keep = new Set(); const now = Date.now();
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
  res.json({ total: all.length, checked: all.filter(p => p.checked).length, ingame, recent, api: { calls: stats.calls, nameCalls: stats.nameCalls, savedStarts: stats.startSaved, savedRechecksEstimate: stats.recheckSaved,
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
app.get('/api/champions', (req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  res.json(champs || { v: null, c: {} });
});
app.get('/api/game/:id', (req, res) => {
  const p = [...players.values()].find(x => String(x.pid) === req.params.id);
  if (!p || !p.game) return res.status(404).json({});
  res.set('Cache-Control', 'public, max-age=10');
  res.json({ ...p.game, players: p.game.players.map(x => ({ n: x.n, c: x.c, t: x.t, me: x.u ? x.u === p.puuid : !!x.me })) });
});

loadState();
loadChampions();
setInterval(loadChampions, 6 * 3600e3);
setInterval(() => console.log(`Riot-Abfragen: ${stats.calls}, gespart durch geteilte Partien: ${stats.startSaved} (Start), ca. ${stats.recheckSaved} (Re-Checks)`), 10 * 60e3);
setInterval(() => { if (!champs) loadChampions(); }, 5 * 60e3);
setInterval(saveState, 120000);
process.on('SIGTERM', () => { saveState(); process.exit(0); });
app.listen(PORT, () => { console.log('Tracker läuft auf Port', PORT); loop(); });

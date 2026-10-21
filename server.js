// EUW Flex Live-Tracker: Backend (Node 18+, Express)
const express = require('express');
const fs = require('fs');
const path = require('path');

const KEY = process.env.RIOT_API_KEY;
if (!KEY) { console.error('RIOT_API_KEY fehlt (Umgebungsvariable setzen).'); process.exit(1); }

const PORT = process.env.PORT || 3000;
const TOP_N = +process.env.TOP_N || 1000;
const IDLE_MS = (+process.env.IDLE_RECHECK_SEC || 180) * 1000;     // Kürzlich aktive Spieler: alle 3 Min prüfen
const INGAME_MS = (+process.env.INGAME_RECHECK_SEC || 120) * 1000; // Im Spiel (lange laufend): alle 2 Min
const LADDER_MS = (+process.env.LADDER_REFRESH_SEC || 600) * 1000; // Ladder alle 10 Min neu laden (nur 3 Calls)
const MIN_GAME_MS = 15 * 60 * 1000;                                // Vor Ablauf nicht neu prüfen
const RECENT_MS = 60 * 60 * 1000;                                  // Seite "Zuletzt gespielt": letzte Stunde
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
    const list = [...players.values()].map(({ key, puuid, summonerId, name, rank, lp, tier, games, lastActive, endedAt }) =>
      ({ key, puuid, summonerId, name, rank, lp, tier, games, lastActive, endedAt }));
    fs.writeFileSync(DATA_FILE, JSON.stringify({ lastLadder, players: list }));
  } catch (e) { /* Dateisystem evtl. nicht beschreibbar: kein Problem */ }
}
function loadState() {
  try {
    const s = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    lastLadder = s.lastLadder || 0;
    for (const p of s.players || []) players.set(p.key, { ...p, status: 'unknown', next: 0 });
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
    const p = players.get(key) || { key, puuid: e.puuid || null, summonerId: e.summonerId, status: 'unknown', next: 0 };
    const games = (e.wins || 0) + (e.losses || 0);
    // Mehr Flex-Spiele als beim letzten Mal: Spieler ist aktiv und wird bevorzugt geprüft
    if (p.games != null && games > p.games) {
      p.lastActive = now; p.next = 0;
      // Flex-Spiel beendet, das wir evtl. nicht live gesehen haben
      if (p.status !== 'ingame' && (!p.endedAt || now - p.endedAt > 20 * 60 * 1000)) p.endedAt = now;
    }
    Object.assign(p, { rank: i + 1, lp: e.leaguePoints, tier: e.tier, games });
    players.set(key, p);
  });
  for (const k of [...players.keys()]) if (!keep.has(k)) players.delete(k);
  lastLadder = now;
  console.log('Ladder geladen:', players.size, 'Spieler');
  saveState();
}

// Aktive Spieler häufiger prüfen, lange inaktive selten (spart API-Budget)
function idleDelay(p, now) {
  const age = now - (p.lastActive || 0);
  if (p.lastActive && age < 3 * 3600e3) return IDLE_MS;
  if (p.lastActive && age < 24 * 3600e3) return IDLE_MS * 3;
  return IDLE_MS * 6;
}

async function fetchName(p) {
  const a = await riot(`${REGIONAL}/riot/account/v1/accounts/by-puuid/${p.puuid}`);
  if (a.status === 200) p.name = `${a.data.gameName}#${a.data.tagLine}`;
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
  if (r.status === 200) {
    const g = r.data;
    const start = g.gameStartTime || now;
    p.lastActive = now;
    if (g.gameQueueConfigId !== FLEX_QUEUE_ID) { // anderer Modus: wird nicht angezeigt
      if (wasIn) p.endedAt = now;
      p.status = 'idle'; p.next = Math.max(now + IDLE_MS, start + MIN_GAME_MS);
    } else {
      p.status = 'ingame'; p.start = start;
      p.next = Math.max(now + INGAME_MS, start + MIN_GAME_MS);
      if (!p.name) {
        const a = await riot(`${REGIONAL}/riot/account/v1/accounts/by-puuid/${p.puuid}`);
        if (a.status === 200) p.name = `${a.data.gameName}#${a.data.tagLine}`;
      }
    }
  } else if (r.status === 404) {
    if (wasIn) p.endedAt = now; // Flex-Spiel ist vorbei
    p.status = 'idle'; p.next = now + idleDelay(p, now);
    if (!p.name && p.endedAt && now - p.endedAt < RECENT_MS) await fetchName(p); // einmalig, danach gespeichert
  } else if (r.status === 401 || r.status === 403) {
    console.log('API-Key ungültig oder abgelaufen (HTTP', r.status + '). Neuen Key setzen.');
    p.next = now + 60000; await sleep(60000);
  } else {
    p.next = now + 60000;
  }
}

async function loop() {
  for (;;) {
    try {
      if (!players.size || Date.now() - lastLadder > LADDER_MS) await loadLadder();
      if (!players.size) { await sleep(30000); continue; }
      const now = Date.now();
      let due = null;
      for (const p of players.values()) if (p.next <= now && (!due || p.next < due.next)) due = p;
      if (due) await check(due); else await sleep(1000);
    } catch (e) { console.error(e); await sleep(5000); }
  }
}

// --- Web ---
const app = express();
app.use('/img', express.static('public/img', { maxAge: '7d' }));
app.use(express.static('public', { extensions: ['html'], maxAge: '1h' }));
app.get('/api/status', (req, res) => {
  const all = [...players.values()];
  const ingame = all.filter(p => p.status === 'ingame').sort((a, b) => a.rank - b.rank)
    .map(p => ({ rank: p.rank, name: p.name || null, lp: p.lp, tier: p.tier, start: p.start }));
  res.set('Cache-Control', 'public, max-age=5');
  const t = Date.now();
  const recent = all.filter(p => p.status !== 'ingame' && p.endedAt && t - p.endedAt < RECENT_MS)
    .sort((a, b) => b.endedAt - a.endedAt)
    .map(p => ({ rank: p.rank, name: p.name || null, lp: p.lp, endedAt: p.endedAt }));
  res.json({ total: all.length, checked: all.filter(p => p.checked).length, ingame, recent, now: t });
});

loadState();
setInterval(saveState, 120000);
process.on('SIGTERM', () => { saveState(); process.exit(0); });
app.listen(PORT, () => { console.log('Tracker läuft auf Port', PORT); loop(); });

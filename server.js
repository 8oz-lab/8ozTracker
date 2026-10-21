// EUW Flex Live-Tracker: Backend (Node 18+, Express)
const express = require('express');

const KEY = process.env.RIOT_API_KEY;
if (!KEY) { console.error('RIOT_API_KEY fehlt (Umgebungsvariable setzen).'); process.exit(1); }

const PORT = process.env.PORT || 3000;
const TOP_N = +process.env.TOP_N || 1000;
const IDLE_MS = (+process.env.IDLE_RECHECK_SEC || 180) * 1000;     // Nicht im Spiel: alle 3 Min prüfen
const INGAME_MS = (+process.env.INGAME_RECHECK_SEC || 120) * 1000; // Im Spiel (lange laufend): alle 2 Min
const MIN_GAME_MS = 15 * 60 * 1000;                                // Vor Ablauf nicht neu prüfen
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

// --- Zustand ---
const players = new Map(); // key -> Spieler
let lastLadder = 0;

async function loadLadder() {
  const entries = [];
  for (const tier of ['challenger', 'grandmaster', 'master']) {
    const r = await riot(`${PLATFORM}/lol/league/v4/${tier}leagues/by-queue/${QUEUE}`);
    if (r.status !== 200) { console.log('Ladder', tier, 'HTTP', r.status); continue; }
    for (const e of r.data.entries || []) entries.push({ ...e, tier });
  }
  if (!entries.length) return;
  entries.sort((a, b) => b.leaguePoints - a.leaguePoints);
  const keep = new Set();
  entries.slice(0, TOP_N).forEach((e, i) => {
    const key = e.puuid || e.summonerId;
    keep.add(key);
    const p = players.get(key) || { key, puuid: e.puuid || null, summonerId: e.summonerId, status: 'unknown', next: 0 };
    Object.assign(p, { rank: i + 1, lp: e.leaguePoints, tier: e.tier });
    players.set(key, p);
  });
  for (const k of [...players.keys()]) if (!keep.has(k)) players.delete(k);
  lastLadder = Date.now();
  console.log('Ladder geladen:', players.size, 'Spieler');
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
  if (r.status === 200) {
    const g = r.data;
    const start = g.gameStartTime || now;
    p.status = 'ingame'; p.queueId = g.gameQueueConfigId; p.start = start;
    p.next = Math.max(now + INGAME_MS, start + MIN_GAME_MS);
    if (!p.name) {
      const a = await riot(`${REGIONAL}/riot/account/v1/accounts/by-puuid/${p.puuid}`);
      if (a.status === 200) p.name = `${a.data.gameName}#${a.data.tagLine}`;
    }
  } else if (r.status === 404) {
    p.status = 'idle'; p.next = now + IDLE_MS;
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
      if (!players.size || Date.now() - lastLadder > 3 * 3600e3) await loadLadder();
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
app.use(express.static('public'));
app.get('/api/status', (req, res) => {
  const all = [...players.values()];
  const ingame = all.filter(p => p.status === 'ingame').sort((a, b) => a.rank - b.rank)
    .map(p => ({ rank: p.rank, name: p.name || null, lp: p.lp, tier: p.tier, flex: p.queueId === FLEX_QUEUE_ID, start: p.start }));
  res.json({ total: all.length, checked: all.filter(p => p.checked).length, ingame, now: Date.now() });
});
app.listen(PORT, () => { console.log('Tracker läuft auf Port', PORT); loop(); });

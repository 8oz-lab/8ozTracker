// Gemeinsamer Rahmen (Kopfzeile mit Logo, Fußzeile) und Datenhelfer
(function () {
  const pages = [['/', 'Start'], ['/live', 'Live'], ['/recent', 'Zuletzt'], ['/leaderboard', 'Leaderboard'], ['/jungle', 'Jungle Tendencies'], ['/about', 'Über']];
  const path = location.pathname.replace(/\.html$/, '').replace(/index$/, '') || '/';
  const nav = pages.map(([h, t]) => `<a href="${h}"${h === path ? ' aria-current="page"' : ''}>${t}</a>`).join('');
  document.body.insertAdjacentHTML('afterbegin',
    `<header><div class="wrap"><a class="logo" href="/"><img src="/img/logo.webp" alt="8oz Tracker" width="223" height="52"></a><nav>${nav}</nav><form class="hs" action="/player" method="get" role="search"><input type="search" name="q" placeholder="Spieler suchen: Name#Tag" aria-label="Spieler suchen" maxlength="60" autocomplete="off"></form></div></header>`);
  try { const a = document.querySelector('nav a[aria-current]'); if (a) a.scrollIntoView({ inline: 'center', block: 'nearest' }); } catch (e) { /* egal */ }
  document.body.insertAdjacentHTML('beforeend',
    `<footer><div class="wrap"><p>8oz Tracker isn’t endorsed by Riot Games and doesn’t reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.</p></div></footer>`);

  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const T = window.T = {
    champs: { v: null, c: {} }, open: new Set(), cache: new Map(),
    async status() { const r = await fetch('/api/status'); const d = await r.json(); d.fetched = Date.now(); return d; },
    mins(d, start) { return Math.max(0, Math.floor((d.now + (Date.now() - d.fetched) - start) / 60000)); }
  };
  T.ready = fetch('/api/champions').then(r => r.json()).then(x => { T.champs = x; }).catch(() => {});

  function champ(id) {
    const c = T.champs.c[id];
    if (!c) return { name: 'Champion ' + id, img: null };
    return { name: c[0], img: T.champs.v ? `https://ddragon.leagueoflegends.com/cdn/${T.champs.v}/img/champion/${c[1]}.png` : null };
  }
  function icon(id, size) {
    const c = champ(id);
    if (!c.img) return el('span', 'ph');
    const i = el('img', 'ci'); i.src = c.img; i.alt = c.name; i.title = c.name; i.width = i.height = size; i.loading = 'lazy';
    return i;
  }
  T.champ = champ; T.icon = icon;
  T.item = function (id, size) {
    if (!id || !T.champs.v) return el('span', 'it0');
    const i = el('img', 'ci it'); i.src = `https://ddragon.leagueoflegends.com/cdn/${T.champs.v}/img/item/${id}.png`; i.alt = ''; i.width = i.height = size; i.loading = 'lazy';
    return i;
  };
  // Link zur Spielerseite (Name#Tag, sonst Ladder-Platz)
  T.plink = function (name, rank, cls) {
    const a = el('a', cls || 'plink', name || ('Spieler #' + rank)); a.href = '/player?q=' + encodeURIComponent(name || ('#' + rank));
    return a;
  };
  function team(g, t, label) {
    const box = el('div', 'team'); box.append(el('h4', null, label));
    g.players.filter(p => p.t === t).forEach(p => {
      const row = el('div', 'pl' + (p.me ? ' me' : '') + (p.k ? ' top' : '')), txt = el('div');
      txt.append(el('div', 'champ', champ(p.c).name), el('div', 'muted small', p.n || ''));
      row.append(icon(p.c, 32), txt);
      if (p.k) { const b = el('span', 'rk', '#' + p.k); b.title = 'Platz ' + p.k + ' der Flex-Ladder (Top 1000)'; row.append(b); }
      box.append(row);
    });
    return box;
  }
  function renderGame(g, td, note) {
    td.textContent = '';
    const teams = el('div', 'teams');
    teams.append(team(g, 100, 'Blaues Team'), team(g, 200, 'Rotes Team'));
    td.append(teams);
    const bans = (g.bans || []).slice().sort((a, b) => a.t - b.t);
    if (bans.length) {
      const b = el('div', 'bans'); b.append(el('span', 'muted small', 'Bans:'));
      bans.forEach(x => { const i = icon(x.c, 24); i.classList.add('ban'); b.append(i); });
      td.append(b);
    }
    if (note) td.append(el('p', 'muted small note', note));
  }

  // Zeile ausklappbar machen (Details werden erst beim Öffnen geladen und gemerkt)
  T.expandable = function (tbody, tr, p, cols, note) {
    const chev = el('span', 'chev');
    tr.cells[1].prepend(chev);
    if (!p.hasGame) return;
    tr.classList.add('click'); tr.tabIndex = 0; tr.setAttribute('role', 'button');
    let detail = null;
    const key = p.id + ':' + p.gid;
    async function show() {
      detail = tbody.insertRow(tr.sectionRowIndex + 1); detail.className = 'detail';
      const td = detail.insertCell(); td.colSpan = cols; td.textContent = 'Lade …';
      await T.ready;
      let g = T.cache.get(key);
      if (!g) {
        try { const r = await fetch('/api/game/' + p.id); if (!r.ok) throw 0; g = await r.json(); T.cache.set(key, g); }
        catch (e) { td.textContent = 'Details sind nicht verfügbar.'; return; }
      }
      renderGame(g, td, note);
    }
    function set(on) {
      chev.textContent = on ? '▾' : '▸'; tr.setAttribute('aria-expanded', on);
      if (on) { T.open.add(p.id); if (!detail) show(); }
      else { T.open.delete(p.id); if (detail) { detail.remove(); detail = null; } }
    }
    tr.addEventListener('click', () => set(!T.open.has(p.id)));
    tr.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tr.click(); } });
    set(T.open.has(p.id));
  };
})();

// Gemeinsamer Rahmen (Kopfzeile mit Logo, Fußzeile) und Datenhelfer
(function () {
  const pages = [['/', tt('Start')], ['/live', tt('Live')], ['/recent', tt('Zuletzt')], ['/leaderboard', tt('Leaderboard')], ['/jungle', tt('Jungle Tendencies')], ['/about', tt('Über')]];
  const path = location.pathname.replace(/\.html$/, '').replace(/index$/, '') || '/';
  const nav = pages.map(([h, t]) => `<a href="${h}"${h === path ? ' aria-current="page"' : ''}>${t}</a>`).join('');
  document.body.insertAdjacentHTML('afterbegin',
    `<header><div class="wrap"><a class="logo" href="/"><img src="/img/logo.webp" alt="8oz Tracker" width="275" height="52"></a><nav>${nav}</nav><div class="lang" role="group" aria-label="${tt('Sprache')}"><button type="button" data-l="de" aria-pressed="${I18N.lang === 'de'}" title="Deutsch">DE</button><button type="button" data-l="en" aria-pressed="${I18N.lang === 'en'}" title="English">EN</button></div></div></header>`);
  document.querySelectorAll('.lang button').forEach(b => b.addEventListener('click', () => { if (b.dataset.l !== I18N.lang) I18N.set(b.dataset.l); }));
  try { const a = document.querySelector('nav a[aria-current]'); if (a) a.scrollIntoView({ inline: 'center', block: 'nearest' }); } catch (e) { /* egal */ }
  document.body.insertAdjacentHTML('beforeend',
    `<footer><div class="wrap"><div class="fgrid"><div class="fbrand"><a class="logo" href="/"><img src="/img/logo.webp" alt="8oz Tracker" width="206" height="39"></a><p class="muted small">${tt('Live-Tracker der EUW-Flex-Spitze')}</p></div><nav class="fnav" aria-label="Footer">${pages.map(([h, t]) => `<a href="${h}">${t}</a>`).join('')}<a href="/player">${tt('Spielersuche')}</a></nav></div><p class="disc">8oz Tracker isn’t endorsed by Riot Games and doesn’t reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.</p></div></footer>`);

  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const T = window.T = {
    champs: { v: null, c: {} }, open: new Set(), cache: new Map(),
    async status() { const r = await fetch('/api/status'); const d = await r.json(); d.fetched = Date.now(); return d; },
    mins(d, start) { return Math.max(0, Math.floor((d.now + (Date.now() - d.fetched) - start) / 60000)); }
  };
  T.ready = fetch('/api/champions?lang=' + I18N.lang).then(r => r.json()).then(x => { T.champs = x; }).catch(() => {});

  function champ(id) {
    const c = T.champs.c[id];
    if (!c) return { name: tt('Champion {id}', { id }), img: null };
    return { name: c[0], img: T.champs.v ? `https://ddragon.leagueoflegends.com/cdn/${T.champs.v}/img/champion/${c[1]}.png` : null };
  }
  function icon(id, size) {
    const c = champ(id);
    if (!c.img) return el('span', 'ph');
    const i = el('img', 'ci'); i.src = c.img; i.alt = c.name; i.title = c.name; i.width = i.height = size; i.loading = 'lazy';
    return i;
  }
  T.champ = champ; T.icon = icon;
  T.err = d => tt(d.et || d.error || 'Die Suche ist fehlgeschlagen.', d.ev);
  T.when = m => m < 1 ? tt('gerade eben') : tt('vor {m} min', { m });
  T.num = (n, dig) => n.toLocaleString(I18N.locale, { minimumFractionDigits: dig == null ? 0 : dig, maximumFractionDigits: dig == null ? 0 : dig });
  T.item = function (id, size) {
    if (!id || !T.champs.v) return el('span', 'it0');
    const i = el('img', 'ci it'); i.src = `https://ddragon.leagueoflegends.com/cdn/${T.champs.v}/img/item/${id}.png`; i.alt = ''; i.width = i.height = size; i.loading = 'lazy';
    return i;
  };
  // Link zur Spielerseite (Name#Tag, sonst Ladder-Platz)
  T.plink = function (name, rank, cls) {
    const a = el('a', cls || 'plink', name || tt('Spieler #{r}', { r: rank })); a.href = '/player?q=' + encodeURIComponent(name || ('#' + rank));
    return a;
  };

  // Carry-Score: Mittelwert der Spielwerte (0-100, 50 = Durchschnitt im Spiel) und der sechs Faktoren
  const FACT = [['dmg', 'Schaden an Champions', 30], ['kda', 'KDA', 20], ['kp', 'Killbeteiligung', 20], ['gold', 'Gold', 10], ['dth', 'Wenige Tode', 10], ['obj', 'Schaden an Zielen', 10]];
  T.scoreLabel = v => tt(v >= 68 ? 'Hard Carry' : v >= 58 ? 'Carry' : v >= 45 ? 'Solide' : v >= 35 ? 'Unter dem Schnitt' : 'Schwach');
  T.scoreCls = v => v >= 68 ? 'sc-hi' : v >= 58 ? 'sc-up' : v >= 45 ? 'sc-mid' : 'sc-lo';
  T.carry = function (ms, title) {
    const g = ms.filter(m => m.sc != null); if (!g.length) return null;
    const avg = f => g.reduce((a, m) => a + f(m), 0) / g.length, sc = Math.round(avg(m => m.sc));
    const box = el('section', 'carry'), left = el('div', 'cleft');
    left.append(el('div', 'clab', tt(title || 'Carry-Score')), el('div', 'cnum ' + T.scoreCls(sc), String(sc)), el('div', 'csub', tt('{l} · Ø aus {n} Spielen', { l: T.scoreLabel(sc), n: g.length })));
    const rt = el('div', 'cfac');
    FACT.forEach(([k, name, w]) => {
      const v = Math.round(avg(m => m.sf[k])), row = el('div', 'cf');
      const top = el('div', 'cft'); top.append(el('span', null, tt(name)), el('span', 'muted small', tt('Gewicht {w} %', { w })), el('b', null, String(v)));
      const bar = el('div', 'meter'), i = el('i'); i.style.width = v + '%'; bar.append(i); row.append(top, bar); rt.append(row);
    });
    box.append(left, rt, el('p', 'muted small cnote', tt('So wird gerechnet: In jedem Spiel wird der Spieler mit allen 10 Teilnehmern verglichen (Platz 1 = 100, letzter Platz = 0, 50 = Durchschnitt). Die sechs Faktoren werden gewichtet addiert und über die Spiele gemittelt. Supports und Tanks haben bei „Schaden“ naturgemäß niedrigere Werte.')));
    return box;
  };
  function team(g, t, label) {
    const box = el('div', 'team'); box.append(el('h4', null, label));
    g.players.filter(p => p.t === t).forEach(p => {
      const row = el('div', 'pl' + (p.me ? ' me' : '') + (p.k ? ' top' : '')), txt = el('div');
      txt.append(el('div', 'champ', champ(p.c).name), el('div', 'muted small', p.n || ''));
      row.append(icon(p.c, 32), txt);
      if (p.k) { const b = el('span', 'rk', '#' + p.k); b.title = tt('Platz {r} der Flex-Ladder (Top 1000)', { r: p.k }); row.append(b); }
      box.append(row);
    });
    return box;
  }
  function renderGame(g, td, note) {
    td.textContent = '';
    const teams = el('div', 'teams');
    teams.append(team(g, 100, tt('Blaues Team')), team(g, 200, tt('Rotes Team')));
    td.append(teams);
    const bans = (g.bans || []).slice().sort((a, b) => a.t - b.t);
    if (bans.length) {
      const b = el('div', 'bans'); b.append(el('span', 'muted small', tt('Bans:')));
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
      const td = detail.insertCell(); td.colSpan = cols; td.textContent = tt('Lade …');
      await T.ready;
      let g = T.cache.get(key);
      if (!g) {
        try { const r = await fetch('/api/game/' + p.id); if (!r.ok) throw 0; g = await r.json(); T.cache.set(key, g); }
        catch (e) { td.textContent = tt('Details sind nicht verfügbar.'); return; }
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
  // Mini-Übersicht: freie Riot-Abfragen (Zähler des Servers je Region)
  (function () {
    const box = el('aside', 'budget'); box.setAttribute('aria-label', tt('Riot-Anfragen frei'));
    box.append(el('div', 'bt', tt('Riot-Anfragen frei')));
    const rows = {};
    [['euw1', 'Live-Tracking'], ['europe', 'Suche und Spiele']].forEach(([k, label]) => {
      const row = el('div', 'br'), v = el('b', null, '–'), bar = el('div', 'bbar'), fill = el('i');
      bar.append(fill); row.append(el('span', null, tt(label)), v, bar); box.append(row); rows[k] = { v, fill, row };
    });
    document.body.append(box);
    async function poll() {
      try {
        const d = await (await fetch('/api/budget')).json();
        for (const k in rows) {
          const x = d[k]; if (!x) continue;
          rows[k].v.textContent = x.free + ' / ' + x.n;
          const f = x.n ? x.free / x.n : 0; rows[k].fill.style.width = Math.round(f * 100) + '%';
          rows[k].row.className = 'br ' + (f < 0.15 ? 'low' : f < 0.4 ? 'mid' : 'ok');
          rows[k].row.title = tt('{f} von {n} Anfragen frei (Limit: {n} je {s} Sekunden)', { f: x.free, n: x.n, s: x.s });
        }
      } catch (e) { /* Server gerade nicht erreichbar */ }
    }
    poll(); setInterval(poll, 4000);
  })();
  I18N.apply();
})();

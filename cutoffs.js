// LP-Grenzen: aktuelle LP auf bestimmten Ladder-Plätzen, Veränderung und Verlauf (Daten aus /api/cutoffs)
(function () {
  const root = document.getElementById('cutoffs');
  if (!root) return;
  const NS = 'http://www.w3.org/2000/svg';
  const RANGES = [[6, tt('6 Std.')], [24, tt('24 Std.')], [48, tt('48 Std.')]];
  const H = 64, PAD = 8;
  let hrs = 24, data = null, hovering = false;
  try { const s = +localStorage.getItem('cutRange'); if (RANGES.some(r => r[0] === s)) hrs = s; } catch (e) { /* Speicher evtl. gesperrt */ }

  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const sv = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
  const nowMs = () => data.now + (Date.now() - data.fetched);
  const fmtTime = t => new Date(t).toLocaleString(I18N.locale, { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  const fmtSpan = ms => { const m = Math.round(ms / 60000); return m < 90 ? m + ' min' : tt('{h} Std.', { h: T.num(Math.round(m / 6) / 10, 1) }); };
  const list = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + tt(' und ') + a[a.length - 1];

  // Aufbau: Kopf mit Zeitraum-Schalter, drei Kacheln, Tabellenansicht
  const head = el('div', 'cuthead');
  const titleBox = el('div'); const h2 = el('h2', null, tt('LP-Grenzen')); h2.id = 'cuth';
  const sub = el('p', 'muted small', tt('Lade Daten …')); sub.style.margin = '4px 0 0';
  titleBox.append(h2, sub);
  const seg = el('div', 'seg'); seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', tt('Zeitraum'));
  const segBtns = RANGES.map(([h, label]) => {
    const b = el('button', null, label); b.type = 'button';
    b.addEventListener('click', () => { hrs = h; try { localStorage.setItem('cutRange', h); } catch (e) { /* egal */ } render(); });
    seg.append(b); return b;
  });
  head.append(titleBox, seg);
  const tiles = el('div', 'cuts');
  const det = el('details', 'cuttab'); det.append(el('summary', null, tt('Verlauf als Tabelle')));
  const lbl = k => { const l = data.labels[k], m = /^Platz (\d+)$/.exec(l); return m ? tt('Platz {r}', { r: m[1] }) : tt(l); };
  const tabWrap = el('div', 'scroll'); det.append(tabWrap);
  root.append(head, tiles, det);

  // Datenpunkte einer Grenze im gewählten Zeitraum, am Ende ergänzt um den aktuellen Wert
  function points(k) {
    const from = nowMs() - hrs * 3600e3, rows = data.history.filter(r => r[0] >= from && r[k + 1] != null).map(r => [r[0], r[k + 1]]);
    const cur = data.current && data.current[k];
    if (cur != null && data.updated && (!rows.length || data.updated > rows[rows.length - 1][0])) rows.push([data.updated, cur]);
    return rows;
  }

  function delta(pts) {
    if (pts.length < 2 || pts[pts.length - 1][0] - pts[0][0] < 15 * 60e3) return tt('Noch kein Verlauf');
    const d = pts[pts.length - 1][1] - pts[0][1], span = pts[pts.length - 1][0] - pts[0][0];
    const when = span >= hrs * 3600e3 * 0.95 ? tt('in {h} Std.', { h: hrs }) : tt('seit {s}', { s: fmtSpan(span) });
    return (d > 0 ? '▲ +' + d : d < 0 ? '▼ −' + (-d) : '– ±0') + ' LP ' + when;
  }

  function spark(pts, w, label) {
    const box = el('div', 'sparkbox');
    if (pts.length < 2) { box.append(el('p', 'muted small nospark', tt('Der Verlauf entsteht in den nächsten Minuten.'))); return box; }
    const t0 = pts[0][0], t1 = pts[pts.length - 1][0];
    let lo = Math.min(...pts.map(p => p[1])), hi = Math.max(...pts.map(p => p[1]));
    if (hi === lo) { hi += 1; lo -= 1; }
    const X = t => PAD + (t1 === t0 ? 0 : (t - t0) / (t1 - t0)) * (w - 2 * PAD), Y = v => PAD + (1 - (v - lo) / (hi - lo)) * (H - 2 * PAD);
    const svg = sv('svg', { class: 'spark', width: w, height: H, viewBox: `0 0 ${w} ${H}`, tabindex: 0, role: 'group',
      'aria-label': tt('{label}: Verlauf der letzten {h} Stunden, von {a} auf {b} LP, Minimum {lo}, Maximum {hi}', { label, h: hrs, a: pts[0][1], b: pts[pts.length - 1][1], lo: Math.min(...pts.map(p => p[1])), hi: Math.max(...pts.map(p => p[1])) }) });
    svg.append(sv('path', { class: 'ln', d: pts.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join(' ') }));
    const end = pts[pts.length - 1];
    svg.append(sv('circle', { class: 'enddot', cx: X(end[0]), cy: Y(end[1]), r: 4 }));
    const cross = sv('line', { class: 'cross', y1: 0, y2: H, visibility: 'hidden' });
    const hov = sv('circle', { class: 'hovdot', r: 4, visibility: 'hidden' });
    svg.append(cross, hov);
    const tip = el('div', 'tip'); tip.hidden = true;
    function show(i) {
      const p = pts[i], x = X(p[0]);
      cross.setAttribute('x1', x); cross.setAttribute('x2', x); cross.setAttribute('visibility', 'visible');
      hov.setAttribute('cx', x); hov.setAttribute('cy', Y(p[1])); hov.setAttribute('visibility', 'visible');
      tip.textContent = ''; tip.append(el('strong', null, p[1] + ' LP'), el('span', 'muted', fmtTime(p[0])));
      tip.hidden = false;
      tip.style.left = Math.max(0, Math.min(w - tip.offsetWidth, x - tip.offsetWidth / 2)) + 'px';
    }
    function hide() { hovering = false; cross.setAttribute('visibility', 'hidden'); hov.setAttribute('visibility', 'hidden'); tip.hidden = true; }
    let cur = pts.length - 1;
    svg.addEventListener('pointermove', e => {
      hovering = true;
      const x = e.clientX - svg.getBoundingClientRect().left; let best = 0, bd = Infinity;
      pts.forEach((p, i) => { const d = Math.abs(X(p[0]) - x); if (d < bd) { bd = d; best = i; } });
      cur = best; show(best);
    });
    svg.addEventListener('pointerleave', hide);
    svg.addEventListener('focus', () => { hovering = true; show(cur); });
    svg.addEventListener('blur', hide);
    svg.addEventListener('keydown', e => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault(); cur = Math.max(0, Math.min(pts.length - 1, cur + (e.key === 'ArrowLeft' ? -1 : 1))); show(cur);
    });
    const ax = el('div', 'axis'); const sp = nowMs() - t0; ax.append(el('span', null, tt('vor {s}', { s: sp >= hrs * 3600e3 * 0.95 ? tt('{h} Std.', { h: hrs }) : fmtSpan(sp) })), el('span', null, tt('jetzt')));
    box.append(svg, ax, tip);
    return box;
  }

  function table() {
    tabWrap.textContent = '';
    if (!data || !data.history.length) return;
    const from = nowMs() - hrs * 3600e3, rows = []; let lastT = Infinity;
    for (let i = data.history.length - 1; i >= 0 && rows.length < 49; i--) {
      const r = data.history[i];
      if (r[0] < from) break;
      if (lastT - r[0] >= 55 * 60e3 || lastT === Infinity) { rows.push(r); lastT = r[0]; }
    }
    const t = el('table'), tr0 = t.createTHead().insertRow();
    [tt('Zeit'), ...data.labels.map((l, i) => tt('{l} (Platz {r})', { l: lbl(i), r: data.ranks[i] }))].forEach(x => tr0.append(Object.assign(el('th', null, x))));
    const body = t.createTBody();
    rows.forEach(r => { const tr = body.insertRow(); tr.insertCell().textContent = fmtTime(r[0]); for (let k = 1; k < r.length; k++) { const c = tr.insertCell(); c.textContent = r[k] == null ? '–' : r[k] + ' LP'; c.className = 'num'; } });
    tabWrap.append(t);
  }

  function render() {
    segBtns.forEach((b, i) => b.setAttribute('aria-pressed', RANGES[i][0] === hrs));
    tiles.textContent = '';
    if (!data) { for (let i = 0; i < 3; i++) { const t = el('div', 'tile'); t.append(el('div', 'lab', tt('Lade …'))); tiles.append(t); } return; }
    if (!data.current) { sub.textContent = tt('Die Ladder wird geladen. Das dauert beim ersten Start einen Moment.'); return; }
    const age = Math.max(0, Math.floor((nowMs() - data.updated) / 60000));
    sub.textContent = tt('LP auf Platz {r} der EUW-Flex-Ladder. Stand: {w}.', { r: list(data.ranks), w: T.when(age) });
    data.ranks.forEach((rank, k) => {
      const tile = el('div', 'tile'), pts = points(k), v = data.current[k];
      tile.append(el('div', 'lab', tt('{l} · Platz {r}', { l: lbl(k), r: rank })));
      const val = el('div', 'val'); val.append(v == null ? '–' : String(v)); if (v != null) val.append(el('small', null, ' LP'));
      tile.append(val, el('div', 'delta', delta(pts)));
      tiles.append(tile);
      tile.append(el('div', 'sparkbox')); // Platzhalter, die Breite wird unten gemessen
    });
    // Breite der Kacheln messen und Verläufe in echter Pixelbreite zeichnen
    [...tiles.children].forEach((tile, k) => {
      const inner = tile.clientWidth - 32; if (inner < 60) return;
      tile.lastChild.replaceWith(spark(points(k), inner, lbl(k)));
    });
    table();
  }

  async function load() {
    try { const d = await (await fetch('/api/cutoffs')).json(); d.fetched = Date.now(); data = d; if (!hovering) render(); }
    catch (e) { sub.textContent = tt('Server nicht erreichbar. Neuer Versuch in 60 Sekunden.'); }
  }
  let raf = 0; window.addEventListener('resize', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => data && render()); });
  render(); load(); setInterval(load, 60000); setInterval(() => { if (data && !hovering) render(); }, 60000);
})();

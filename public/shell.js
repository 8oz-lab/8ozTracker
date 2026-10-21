// Gemeinsamer Rahmen (Kopfzeile mit Logo, Fußzeile) und Datenhelfer
(function () {
  const pages = [['/', 'Start'], ['/live', 'Live'], ['/about', 'Über']];
  const path = location.pathname.replace(/\.html$/, '').replace(/index$/, '') || '/';
  const nav = pages.map(([h, t]) => `<a href="${h}"${h === path ? ' aria-current="page"' : ''}>${t}</a>`).join('');
  const mark = '<svg viewBox="0 0 32 32" width="34" height="34" aria-hidden="true"><circle cx="14" cy="9" r="6" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="14" cy="22" r="8" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="26" cy="6" r="3.5" fill="var(--accent)"/></svg>';
  document.body.insertAdjacentHTML('afterbegin',
    `<header><div class="wrap"><a class="logo" href="/" aria-label="8oz Tracker Startseite">${mark}<div><b>8oz</b> <span>Tracker</span></div></a><nav>${nav}</nav></div></header>`);
  document.body.insertAdjacentHTML('beforeend',
    `<footer><div class="wrap"><p>8oz Tracker isn’t endorsed by Riot Games and doesn’t reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.</p></div></footer>`);
  window.T = {
    async status() { const r = await fetch('/api/status'); const d = await r.json(); d.fetched = Date.now(); return d; },
    mins(d, start) { return Math.max(0, Math.floor((d.now + (Date.now() - d.fetched) - start) / 60000)); }
  };
})();

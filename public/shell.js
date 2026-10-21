// Gemeinsamer Rahmen (Kopfzeile mit Logo, Fußzeile) und Datenhelfer
(function () {
  const pages = [['/', 'Start'], ['/live', 'Live'], ['/recent', 'Zuletzt gespielt'], ['/about', 'Über']];
  const path = location.pathname.replace(/\.html$/, '').replace(/index$/, '') || '/';
  const nav = pages.map(([h, t]) => `<a href="${h}"${h === path ? ' aria-current="page"' : ''}>${t}</a>`).join('');
  document.body.insertAdjacentHTML('afterbegin',
    `<header><div class="wrap"><a class="logo" href="/"><img src="/img/logo.webp" alt="8oz Tracker" width="223" height="52"></a><nav>${nav}</nav></div></header>`);
  document.body.insertAdjacentHTML('beforeend',
    `<footer><div class="wrap"><p>8oz Tracker isn’t endorsed by Riot Games and doesn’t reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.</p></div></footer>`);
  window.T = {
    async status() { const r = await fetch('/api/status'); const d = await r.json(); d.fetched = Date.now(); return d; },
    mins(d, start) { return Math.max(0, Math.floor((d.now + (Date.now() - d.fetched) - start) / 60000)); }
  };
})();

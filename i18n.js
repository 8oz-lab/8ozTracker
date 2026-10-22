// Sprachumschaltung (Deutsch/Englisch). Schlüssel sind die deutschen Texte, Platzhalter {name} werden ersetzt.
// Die Sprache wird nur lokal im Browser gemerkt (localStorage), ohne Cookies; Standard ist die Browsersprache.
(function () {
  const guess = () => ((navigator.language || 'de').toLowerCase().startsWith('de') ? 'de' : 'en');
  let lang;
  try { const s = localStorage.getItem('lang'); lang = s === 'de' || s === 'en' ? s : guess(); } catch (e) { lang = guess(); }

  const EN = {
    // Navigation, Kopfzeile
    'Start': 'Home', 'Live': 'Live', 'Zuletzt': 'Recent', 'Leaderboard': 'Leaderboard', 'Jungle Tendencies': 'Jungle Tendencies', 'Über': 'About',
    'Spieler suchen: Name#Tag': 'Search player: Name#Tag', 'Spieler suchen': 'Search players', 'Sprache': 'Language',
    // Seitentitel
    'Zuletzt gespielt': 'Recently played', 'Spielersuche': 'Player search', 'Über 8oz Tracker': 'About 8oz Tracker',
    // Allgemein
    'Lade Daten …': 'Loading data …', 'Lade …': 'Loading …', 'wird geladen …': 'loading …', 'Rang': 'Rank', 'Spieler': 'Player', 'LP': 'LP',
    'Kein Treffer.': 'No match.', 'Server nicht erreichbar.': 'Server unreachable.',
    'Server nicht erreichbar. Neuer Versuch in 15 Sekunden.': 'Server unreachable. Trying again in 15 seconds.',
    'Server nicht erreichbar. Neuer Versuch in 60 Sekunden.': 'Server unreachable. Trying again in 60 seconds.',
    'Server nicht erreichbar. Bitte später erneut versuchen.': 'Server unreachable. Please try again later.',
    'Die Ladder wird geladen. Das dauert beim ersten Start einen Moment.': 'The ladder is loading. This takes a moment on the first start.',
    'gerade eben': 'just now', 'vor {m} min': '{m} min ago', 'vor {h} Std.': '{h} h ago', 'vor {d} Tag': '{d} day ago', 'vor {d} Tagen': '{d} days ago',
    // Start
    'Wer aus der EUW-Flex-Spitze spielt gerade Flex?': 'Who in the top of EUW Flex is playing Flex right now?',
    'Der Tracker prüft die Top 1000 der Flex-Ladder auf EUW und zeigt live, wer sich gerade in einem Flex-Spiel befindet.': 'The tracker checks the top 1000 of the EUW Flex ladder and shows live who is currently in a Flex game.',
    'Live ansehen': 'View live', 'Über das Projekt': 'About the project', 'im Flex-Spiel': 'in a Flex game', 'Spieler in der Liste': 'players in the list', 'bereits geprüft': 'already checked',
    'Jetzt im Flex-Spiel': 'Now in a Flex game', 'Daten werden geladen …': 'Loading data …', 'Alle anzeigen': 'Show all', 'So funktioniert es': 'How it works',
    'Top 1000 der Ladder': 'Top 1000 of the ladder', 'Grundlage sind Challenger, Grandmaster und Master der EUW-Flex-Queue, sortiert nach LP.': 'Based on Challenger, Grandmaster and Master of the EUW Flex queue, sorted by LP.',
    'Live-Status per Riot-API': 'Live status via Riot API', 'Für jeden Spieler wird geprüft, ob gerade ein Flex-Spiel läuft. Andere Modi werden nicht angezeigt.': 'For every player we check whether a Flex game is running. Other modes are not shown.',
    'Laufend aktualisiert': 'Continuously updated', 'Die Seite lädt sich alle 15 Sekunden neu. Die Abfragen laufen im Hintergrund auf dem Server.': 'The page refreshes every 15 seconds. The requests run in the background on the server.',
    'Gerade spielt niemand aus der Liste Flex.': 'Nobody from the list is playing Flex right now.', 'Die ersten Abfragen laufen noch.': 'The first checks are still running.',
    // Live
    'Klicke auf eine Zeile, um Champions, Teams und Bans der laufenden Partie zu sehen.': 'Click a row to see champions, teams and bans of the running game.',
    'Spieler im Flex-Spiel': 'players in a Flex game', 'Spielzeit': 'Game time',
    '{c} von {t} Spielern wurden bereits geprüft.': '{c} of {t} players have been checked.',
    'Kein Treffer unter den Spielern im Flex-Spiel.': 'No match among the players in a Flex game.', 'Noch keine Ergebnisse. Die ersten Abfragen laufen.': 'No results yet. The first checks are running.',
    // Zuletzt
    'Spieler, deren Flex-Spiel in der letzten Stunde zu Ende ging und die gerade nicht mehr im Spiel sind. Der Zeitpunkt ist auf wenige Minuten genau. Klicke auf eine Zeile, um Champions und Teams zu sehen, sofern wir das Spiel live gesehen haben.': 'Players whose Flex game ended within the last hour and who are no longer in a game. The time is accurate to a few minutes. Click a row to see champions and teams, provided we saw the game live.',
    'Spieler ': 'players ', 'Champion': 'Champion', 'Spiel beendet': 'Game ended',
    'Noch keine beendeten Flex-Spiele erfasst. Die Liste füllt sich, sobald Spiele zu Ende gehen.': 'No finished Flex games recorded yet. The list fills up as games end.',
    'Spiel nicht live gesehen': 'Game not seen live', 'Zuletzt live gesehener Stand dieses Spiels. Ergebnis und KDA sind nicht bekannt.': 'Last live state of this game. Result and KDA are unknown.',
    // Leaderboard
    'gerade im Flex-Spiel': 'currently in a Flex game', 'Name oder Rang suchen': 'Search name or rank', 'Letzte Rangänderung': 'Last rank change', 'Änd.': 'Chg.', 'Tier': 'Tier',
    'Siege / Niederl.': 'Wins / Losses', 'Winrate': 'Winrate', 'Status': 'Status', 'Mehr anzeigen': 'Show more', 'Mehr anzeigen ({n} weitere)': 'Show more ({n} more)',
    'Top {n} der EUW-Flex-Ladder. Stand der Ladder: {w}.': 'Top {n} of the EUW Flex ladder. Ladder updated: {w}.', 'Noch keine Daten.': 'No data yet.', 'Spieler #{r}': 'Player #{r}',
    'Zuletzt um {n} Plätze gestiegen': 'Recently climbed {n} places', 'Zuletzt um {n} Plätze gefallen': 'Recently dropped {n} places', 'Keine Änderung erfasst': 'No change recorded', ' im Spiel': ' in game',
    // Über
    'Über 8oz Tracker ': 'About 8oz Tracker', '8oz Tracker zeigt, welche Spieler der EUW-Flex-Spitze gerade in einem Flex-Spiel von League of Legends sind. Spiele in anderen Modi werden bewusst nicht angezeigt.': '8oz Tracker shows which players of the EUW Flex top are currently in a Flex game of League of Legends. Games in other modes are deliberately not shown.',
    'Woher die Daten kommen': 'Where the data comes from', 'Alle Daten stammen aus der offiziellen Riot Games API. Die Ladder (Challenger, Grandmaster, Master der EUW-Flex-Queue) wird regelmäßig neu geladen, der Live-Status der Spieler laufend im Hintergrund geprüft. Wegen der Abfragelimits der API kann ein Status um einige Minuten verzögert sein.': 'All data comes from the official Riot Games API. The ladder (Challenger, Grandmaster, Master of the EUW Flex queue) is reloaded regularly and the live status of the players is checked continuously in the background. Because of the API request limits, a status can be delayed by a few minutes.',
    'Was gespeichert wird': 'What is stored', 'Die Seite speichert keine Nutzerdaten und setzt keine Cookies. Angezeigt werden nur öffentliche Spielerdaten aus der Riot API. Deine Spracheinstellung wird nur lokal in deinem Browser gemerkt.': 'The site stores no user data and sets no cookies. Only public player data from the Riot API is shown. Your language setting is only remembered locally in your browser.',
    // Spiel-Details
    'Blaues Team': 'Blue team', 'Rotes Team': 'Red team', 'Bans:': 'Bans:', 'Details sind nicht verfügbar.': 'Details are not available.',
    'Platz {r} der Flex-Ladder (Top 1000)': 'Rank {r} of the Flex ladder (Top 1000)', 'Champion {id}': 'Champion {id}',
    // LP-Grenzen
    'LP-Grenzen': 'LP cutoffs', '6 Std.': '6 h', '24 Std.': '24 h', '48 Std.': '48 h', 'Zeitraum': 'Time range', 'Verlauf als Tabelle': 'History as table',
    'Noch kein Verlauf': 'No history yet', 'Der Verlauf entsteht in den nächsten Minuten.': 'The history will build up over the next few minutes.',
    'in {h} Std.': 'in {h} h', 'seit {s}': 'since {s}', '{m} min': '{m} min', '{h} Std.': '{h} h', 'LP {w}': 'LP {w}', ' und ': ' and ',
    '{label}: Verlauf der letzten {h} Stunden, von {a} auf {b} LP, Minimum {lo}, Maximum {hi}': '{label}: history of the last {h} hours, from {a} to {b} LP, minimum {lo}, maximum {hi}',
    'vor {s}': '{s} ago', 'jetzt': 'now', 'Zeit': 'Time', '{l} (Platz {r})': '{l} (rank {r})',
    'LP auf Platz {r} der EUW-Flex-Ladder. Stand: {w}.': 'LP at rank {r} of the EUW Flex ladder. Updated: {w}.',
    'Challenger-Cutoff': 'Challenger cutoff', 'Grandmaster-Cutoff': 'Grandmaster cutoff', 'Top 1000': 'Top 1000', 'Platz {r}': 'Rank {r}', '{l} · Platz {r}': '{l} · Rank {r}',
    // Suche / Profil
    'Suche einen beliebigen Spieler mit seiner Riot-ID (Name#Tag). Gezeigt werden Rang und die letzten 20 Flex-Spiele auf EUW. Für Spieler aus den Top 1000 reicht auch der Name oder der Ladder-Platz (z. B. <code>#25</code>).': 'Search any player by Riot ID (Name#Tag). Rank and the last 20 Flex games on EUW are shown. For players from the top 1000 the name or ladder rank (e.g. <code>#25</code>) is enough.',
    'Riot-ID': 'Riot ID', 'Suchen': 'Search',
    'In der Warteschlange: Platz {p}. Es läuft immer nur eine Suche gleichzeitig.': 'In the queue: position {p}. Only one search runs at a time.',
    'Die Suche startet gleich …': 'The search starts shortly …', 'Lade Spiele … {a} von {b}': 'Loading games … {a} of {b}',
    'Suche läuft … Spieler und Rang werden geladen.': 'Searching … loading player and rank.', 'Für diesen Spieler wurden keine Flex-Spiele gefunden.': 'No Flex games were found for this player.',
    'Mehrere Spieler gefunden. Wähle einen aus:': 'Several players found. Pick one:', 'Die Suche ist fehlgeschlagen.': 'The search failed.',
    'Dieses Ergebnis stammt aus dem Zwischenspeicher und wird nach etwa 15 Minuten neu geladen.': 'This result comes from the cache and is reloaded after about 15 minutes.',
    'Spieler': 'Player', 'Platz #{r} der Flex-Ladder': 'Rank #{r} of the Flex ladder', 'Kein Flex-Rang': 'No Flex rank',
    ' im Flex-Spiel mit {c}': ' in a Flex game with {c}', ' im Flex-Spiel': ' in a Flex game', 'Letztes Spiel beendet {w}': 'Last game ended {w}',
    'Siege / Niederlagen': 'Wins / Losses', 'Winrate (Saison)': 'Winrate (season)',
    'Siege / Niederlagen ({p} %)': 'Wins / Losses ({p} %)', 'Ø {k} / {d} / {a}': 'Avg {k} / {d} / {a}', 'Rolle unbekannt': 'Role unknown', 'Meistgespielt': 'Most played',
    '{c}: {n} Spiele, {w} Siege': '{c}: {n} games, {w} wins', 'Letzte Spiele': 'Recent games',
    'Remake': 'Remake', 'Sieg': 'Win', 'Niederlage': 'Loss', 'Score {s}': 'Score {s}', 'Carry-Score dieses Spiels: {l}': 'Carry score of this game: {l}', '{k} KDA': '{k} KDA',
    'Schaden an Champions': 'Damage to champions', 'Schaden': 'Damage',
    'Top': 'Top', 'Jungle': 'Jungle', 'Mid': 'Mid', 'Bot': 'Bot', 'Support': 'Support', 'Jungle/Fluss': 'Jungle/River',
    // Carry-Score
    'Carry-Score': 'Carry score', 'Carry-Score (alle Rollen)': 'Carry score (all roles)', 'Carry-Score im Jungle': 'Carry score in the jungle',
    'KDA': 'KDA', 'Killbeteiligung': 'Kill participation', 'Gold': 'Gold', 'Wenige Tode': 'Few deaths', 'Schaden an Zielen': 'Damage to objectives', 'Gewicht {w} %': 'Weight {w} %',
    'Hard Carry': 'Hard carry', 'Carry': 'Carry', 'Solide': 'Solid', 'Unter dem Schnitt': 'Below average', 'Schwach': 'Weak',
    '{l} · Ø aus {n} Spielen': '{l} · avg of {n} games',
    'So wird gerechnet: In jedem Spiel wird der Spieler mit allen 10 Teilnehmern verglichen (Platz 1 = 100, letzter Platz = 0, 50 = Durchschnitt). Die sechs Faktoren werden gewichtet addiert und über die Spiele gemittelt. Supports und Tanks haben bei „Schaden“ naturgemäß niedrigere Werte.': 'How it is calculated: in every game the player is compared with all 10 participants (first place = 100, last place = 0, 50 = average). The six factors are added up with weights and averaged over the games. Supports and tanks naturally have lower values for “damage”.',
    // Jungle
    'Suche einen Spieler und sieh, wie oft er in seinen letzten 20 Flex-Spielen Jungle gespielt hat und mit welchen Champions. Für Spieler aus den Top 1000 reicht auch der Name oder der Ladder-Platz (z. B. <code>#25</code>), alle anderen suchst du mit Name#Tag.': 'Search a player and see how often he played jungle in his last 20 Flex games and with which champions. For players from the top 1000 the name or ladder rank (e.g. <code>#25</code>) is enough, everyone else you search with Name#Tag.',
    'Alle Spiele ansehen': 'View all games', '{p} %': '{p} %', '{j} von {n} Spielen als Jungle': '{j} of {n} games as jungle', 'Winrate im Jungle ({w} / {l})': 'Winrate in the jungle ({w} / {l})', 'Kein Jungle-Spiel': 'No jungle game',
    'Kein Jungler': 'Not a jungler', 'Gelegentlich Jungle': 'Occasional jungle', 'Jungler': 'Jungler', 'Mehr als 70 % der Spiele im Jungle': 'More than 70 % of games in the jungle', 'Jungler ab mehr als 70 % der Spiele': 'Jungler from more than 70 % of games',
    'Die Werte ändern sich noch, bis alle Spiele geladen sind.': 'The values will still change until all games are loaded.', 'Jungle-Champions': 'Jungle champions', 'Spiele': 'Games', 'CS/min': 'CS/min',
    'Andere Rollen in diesen Spielen: {r}.': 'Other roles in these games: {r}.',
    'Early Game': 'Early game', 'Early-Game-Daten nicht verfügbar.': 'Early game data not available.',
    'Early-Game-Daten warten in der Schlange (Platz {p}).': 'Early game data is waiting in the queue (position {p}).', 'Early-Game-Daten werden gleich geladen …': 'Early game data will load shortly …',
    'Lade Early-Game-Daten … {a} von {b} Spielen': 'Loading early game data … {a} of {b} games', 'Keine auswertbaren Jungle-Spiele gefunden.': 'No analyzable jungle games found.',
    ', {i} Invade-Starts, {o} unklar': ', {i} invade starts, {o} unclear',
    'Wo er Kills und Assists bekommt (bis Minute 14)': 'Where he gets kills and assists (until minute 14)',
    'So wird gerechnet: Die Startseite ergibt sich aus der Position bei Minute 2 und 3 (Riot speichert die Position nur einmal pro Minute, es ist also eine Näherung): obere oder untere Hälfte der Karte auf der eigenen Seite des Flusses. Als Invade gilt, wer bei mindestens 2 der 4 Messpunkte (Minute 2 bis 5) im gegnerischen Jungle war. Gezählt werden nur Ganks mit Kill oder Assist, Ganks ohne Ergebnis sind in den Daten nicht sichtbar. Der Spielstil vergleicht CS pro Minute und Kills plus Assists bis Minute 20 mit Richtwerten für Jungler (6,6 CS/min, 6 Kills und Assists); die Richtwerte sind Schätzungen. Das Ergebnis ist aus höchstens {m} Jungle-Spielen.': 'How it is calculated: the starting side comes from the position at minute 2 and 3 (Riot stores the position only once per minute, so this is an approximation): top or bottom half of the map on the player’s own side of the river. An invade is counted if the player was in the enemy jungle at at least 2 of the 4 measuring points (minute 2 to 5). Only ganks with a kill or assist are counted, ganks without a result are not visible in the data. The playstyle compares CS per minute and kills plus assists until minute 20 with benchmark values for junglers (6.6 CS/min, 6 kills and assists); the benchmarks are estimates. The result is based on at most {m} jungle games.',
    'Ausgewogen': 'Balanced', 'Startseite': 'Starting side', 'Obere Seite {p}': 'Top side {p}', 'Untere Seite {p}': 'Bottom side {p}', 'Ausgeglichen': 'Balanced', 'Obere Seite {a} · Untere Seite {b}': 'Top side {a} · Bottom side {b}',
    'Invade bis Minute 5': 'Invade until minute 5', '{a} von {b} Spielen · {c} der Zeit im gegnerischen Jungle': '{a} of {b} games · {c} of the time in the enemy jungle',
    'Spielstil bis Minute 20': 'Playstyle until minute 20', 'Eher aktiv': 'Rather active', 'Eher passiv': 'Rather passive',
    'Ø {c} CS/min · Ø {k} Kills und Assists': 'Avg {c} CS/min · avg {k} kills and assists', 'Zu wenige lange Spiele': 'Too few long games',
    'Passiv (Farm) gegen aktiv (Fights)': 'Passive (farm) vs. active (fights)', 'Passiv (Farm)': 'Passive (farm)', 'Aktiv (Fights)': 'Active (fights)',
    'CS pro Minute (inkl. Jungle-Camps)': 'CS per minute (incl. jungle camps)', 'Kills + Assists pro 20 Min. ({k} Kills, {a} Assists)': 'Kills + assists per 20 min ({k} kills, {a} assists)',
    'ausgewertete Spiele (mind. 12 Min.)': 'games analyzed (at least 12 min)', 'Farbe = Stärke der Tendenz:': 'Color = strength of the tendency:',
    'gering': 'low', 'leicht': 'slight', 'deutlich': 'clear', 'stark': 'strong',
    // Fehlermeldungen vom Server
    'Bitte gib einen Namen ein, am besten mit Tag (Name#EUW).': 'Please enter a name, preferably with tag (Name#EUW).',
    'Kein Spieler auf diesem Ladder-Platz bekannt.': 'No player known at this ladder rank.',
    'Spieler nicht in den Top 1000 gefunden. Für alle anderen gib den Riot-ID mit Tag ein, z. B. Name#EUW.': 'Player not found in the top 1000. For everyone else enter the Riot ID with tag, e.g. Name#EUW.',
    'Ungültige Riot-ID. Format: Name#Tag (z. B. Name#EUW).': 'Invalid Riot ID. Format: Name#Tag (e.g. Name#EUW).',
    'Du hast das Limit von {n} Suchen pro Stunde erreicht. Bitte warte etwa {m} Minuten.': 'You have reached the limit of {n} searches per hour. Please wait about {m} minutes.',
    'Gerade sind viele Suchen in der Warteschlange. Bitte in einer Minute erneut versuchen.': 'There are many searches in the queue right now. Please try again in a minute.',
    'Spieler nicht gefunden. Prüfe Name und Tag (z. B. Name#EUW).': 'Player not found. Check name and tag (e.g. Name#EUW).',
    'Riot antwortet gerade nicht (Fehler {s}). Bitte später erneut versuchen.': 'Riot is not responding right now (error {s}). Please try again later.',
    'Die Spielliste konnte nicht geladen werden (Fehler {s}). Bitte später erneut versuchen.': 'The game list could not be loaded (error {s}). Please try again later.',
    'Die Suche ist fehlgeschlagen. Bitte später erneut versuchen.': 'The search failed. Please try again later.',
    'Erst die Spielersuche abschließen.': 'Finish the player search first.',
    'Die Early-Game-Daten konnten nicht geladen werden.': 'The early game data could not be loaded.'
  };

  const missing = new Set();
  const fill = (s, v) => (v ? s.replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? v[k] : m)) : s);
  function tt(de, v) {
    let s = de;
    if (lang === 'en') { if (EN[de] != null) s = EN[de]; else if (/[A-Za-zÄÖÜäöüß]{3,}/.test(de)) missing.add(de); }
    return fill(s, v);
  }
  const I18N = window.I18N = { lang, tt, missing, locale: lang === 'en' ? 'en-GB' : 'de-DE', EN,
    set(l) { try { localStorage.setItem('lang', l); } catch (e) { /* egal */ } location.reload(); },
    // Statische Texte: Elemente mit data-i18n (innerHTML ist der deutsche Schlüssel), data-ia = Attribute (placeholder|aria-label|title)
    apply() {
      document.documentElement.lang = lang;
      document.querySelectorAll('[data-i18n]').forEach(e => {
        const k = e.innerHTML.replace(/\s+/g, ' ').trim();
        if (lang === 'en') { if (EN[k] != null) e.innerHTML = EN[k]; else missing.add(k); }
      });
      document.querySelectorAll('[data-ia]').forEach(e => e.dataset.ia.split('|').forEach(a => { const v = e.getAttribute(a); if (v) e.setAttribute(a, tt(v)); }));
      const m = /^(.*): 8oz Tracker$/.exec(document.title);
      if (m && lang === 'en') document.title = tt(m[1]) + ': 8oz Tracker';
    } };
  window.tt = tt;
  document.documentElement.lang = lang;
})();

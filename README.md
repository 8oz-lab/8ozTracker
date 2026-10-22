# EUW Flex Live-Tracker

Zeigt, welche Spieler der EUW-Flex-Ladder (Challenger, Grandmaster, Master; Top 1000 nach LP) gerade in einem Spiel sind.

## Lokal starten

```
npm install
RIOT_API_KEY="RGAPI-..." npm start
```

Dann im Browser `http://localhost:3000` öffnen.

## Umgebungsvariablen

| Variable | Standard | Bedeutung |
|---|---|---|
| `RIOT_API_KEY` | (Pflicht) | Key aus dem Riot Developer Portal |
| `PORT` | 3000 | Port der Web-App (Hoster setzt ihn meist selbst) |
| `TOP_N` | 1000 | Wie viele Spieler getrackt werden |
| `RATE_LIMITS` | `20/1,100/120` | Limits als Anzahl/Sekunden. Production-Key z. B. `500/10,30000/600` |
| `IDLE_RECHECK_SEC` | 180 | Abstand der Abfragen bei Spielern, die nicht spielen |
| `INGAME_RECHECK_SEC` | 360 | Kontrollprüfung bei Spielern im Spiel (das Spielende meldet vor allem die Ladder) |
| `LADDER_REFRESH_SEC` | 120 | Wie oft die Ladder neu geladen wird (3 Abfragen). Steigt die Spielzahl eines Spielers, ist sein Spiel beendet |
| `CUTOFF_RANKS` | `200,700,1000` | Ladder-Plätze, deren LP auf `/live` als LP-Grenzen angezeigt werden (durch Komma getrennt) |
| `JUNGLE_MIN_GAMES` | 5 | Mindestanzahl beobachteter Spiele für „Jungle Tendencies“ (auf der Seite zusätzlich zwischen 3, 5 und 10 umschaltbar) |
| `JUNGLE_MIN_SHARE` | 0.7 | Mindestanteil an Jungle-Spielen (mehr als 70 %) |
| `SEARCH_GAMES` | 20 | Wie viele letzte Flex-Spiele die Spielersuche lädt (max. 50) |
| `SEARCH_CACHE_SEC` | 900 | So lange wird das Ergebnis einer Suche wiederverwendet (0 Abfragen) |
| `SEARCH_PER_HOUR` | 8 | Neue Suchen pro Besucher und Stunde (Schutz vor Leerlaufen des Kontingents) |
| `SEARCH_QUEUE_MAX` | 10 | Wie viele Suchen höchstens warten dürfen |
| `MATCH_CACHE_MAX` | 3000 | Wie viele Spiele im Speicher gemerkt werden (Spiele ändern sich nie) |
| `NAME_FILL_EVERY` | 30 | Fehlende Namen für das Leaderboard: bei jeder n-ten Abfrage einen nachladen |
| `DATA_FILE` | `state.json` | Datei, in der PUUIDs und Namen für Neustarts gesichert werden |

## Spieldetails

Die Zeilen auf `/live` und `/recent` lassen sich ausklappen (Champions, Teams, Bans). Die Daten stammen aus der Spectator-Antwort, die ohnehin abgefragt wird, es entstehen keine zusätzlichen Riot-Abfragen. Ist in einer aufgeklappten Partie ein weiterer Spieler der Top 1000 dabei, wird er grün markiert und mit seinem Ladder-Rang angezeigt (aus den ohnehin bekannten Daten, ohne Zusatzabfrage). Auf `/recent` steht außerdem der Champion in der Zeile (nur wenn das Spiel live gesehen wurde, sonst „–“). Champion-Namen und Bilder kommen aus Data Dragon (statische Dateien von Riot, zählt nicht gegen das API-Limit).

## Geteilte Partien

Spielen mehrere Spieler der Liste in derselben Partie, wird nur einer von ihnen abgefragt: Die Spectator-Antwort enthält alle 10 Teilnehmer, die anderen getrackten Spieler werden daraus direkt übernommen. Läuft die Partie nicht mehr, gilt das Ende für alle. Wie viele Abfragen das spart, steht in `/api/status` unter `api` (`calls` = echte Riot-Abfragen seit dem Start, `savedStarts` = gesparte Abfragen beim Erkennen, `savedRechecksEstimate` = geschätzte gesparte Re-Checks) und alle 10 Minuten in den Logs.

## Leaderboard

`/leaderboard` zeigt die Top 1000 mit Rang, LP, Siegen/Niederlagen, Winrate und Live-Status. Die Daten stammen aus der Ladder, die ohnehin alle 2 Minuten geladen wird. Fehlende Namen werden nebenbei nachgeladen (beste Ränge zuerst, bei jeder `NAME_FILL_EVERY`-ten Abfrage, Standard 30) und gespeichert. Wie viele Namensabfragen es waren, steht in `/api/status` unter `api.nameCalls`.

## Spielende über die Ladder

Die Ladder wird alle 2 Minuten geladen. Steigt bei einem Spieler im Spiel die Zahl der Flex-Spiele, wird er sofort einmal geprüft und das Spielende für alle getrackten Spieler dieser Partie eingetragen. Dadurch genügt eine seltene Kontrollprüfung (`INGAME_RECHECK_SEC`, Standard 6 Minuten) statt vieler Dauer-Prüfungen. Spieler, die seit Tagen nichts gespielt haben, werden nur noch etwa stündlich geprüft; ein beendetes Spiel erkennt die Ladder trotzdem.

Wie gut das funktioniert, zeigt `/api/status` unter `api.endDetect`: `byLadder` und `byRecheck` sind die Spielenden, die von der Ladder bzw. der Kontrollprüfung zuerst gemeldet wurden. `ladderLagAvgMin` ist, wie viele Minuten die Ladder im Schnitt später als die Kontrollprüfung war (je Spieler gezählt, `samples` = Anzahl). Überwiegt `byLadder` und ist die Verzögerung klein, kannst du `INGAME_RECHECK_SEC` weiter erhöhen (z. B. 900).

## LP-Grenzen

Auf `/live` zeigen drei Kacheln die LP des Spielers auf Platz 200, 700 und 1000 (Challenger-Cutoff, Grandmaster-Cutoff, Top 1000), die Veränderung im gewählten Zeitraum (6, 24 oder 48 Stunden) und einen kleinen Verlauf mit Hover-Anzeige. Eine Tabelle mit stündlichen Werten steckt unter „Verlauf als Tabelle“. Die Werte werden aus der Ladder berechnet, die ohnehin alle 2 Minuten geladen wird, es entstehen keine zusätzlichen Riot-Abfragen. Der Verlauf wird alle 10 Minuten als Punkt gespeichert (50 Stunden lang, in `state.json`). Wurde die Ladder nur unvollständig geladen (z. B. weil eine Liga einen Fehler lieferte), wird kein neuer Wert eingetragen, damit die Plätze nicht verfälscht werden. Welche Plätze angezeigt werden, stellst du mit `CUTOFF_RANKS` ein; ändert sich die Anzahl der Plätze, beginnt der gespeicherte Verlauf neu. Die Daten liefert `/api/cutoffs`.

## Jungle Tendencies

`/jungle` zeigt bis zu 30 Spieler der Top 1000 (nach Ladder-Rang), die in mehr als 70 % ihrer beobachteten Flex-Spiele Jungle gespielt haben, mit ihren meistgespielten Jungle-Champions. Die Rolle liefert die Riot-API in der Live-Abfrage nicht, deshalb gilt als Jungle, wer Smite (Zauber-ID 11 bzw. 711) dabeihatte. Gezählt werden nur Flex-Spiele, die der Tracker live sieht, jedes Spiel einmal pro Spieler. Das kostet keine zusätzlichen Riot-Abfragen. Die Zähler stehen in `state.json`; geht die Datei verloren, beginnt die Statistik bei null. Liefert die API keine Zauber, wird nichts gezählt (statt falsch zu zählen), und die Seite weist darauf hin. Die Daten liefert `/api/jungle` (optional `?min=` für die Mindestanzahl Spiele).

## Spielersuche

Das Suchfeld in der Kopfzeile (und `/player`) lädt Rang und die letzten 20 Flex-Spiele eines beliebigen EUW-Spielers: Ergebnis, Champion, KDA, CS, Items, Rolle, Dauer und beide Teams mit Schadensbalken. Andere Spieler der Top 1000 sind in den Teams grün markiert und mit ihrem Rang versehen. Namen im Leaderboard und bei Jungle Tendencies verlinken auf die Spielerseite.

Kosten pro Suche (Riot-Abfragen): Riot-ID auflösen (1), Rang (1), laufendes Spiel (1), Spielliste (1) und je Spiel eine Abfrage (bis zu 20), also etwa 24. Bei Spielern aus den Top 1000 entfallen Rang und Live-Status (kommen aus dem Tracker), und die Riot-ID wird bei bekanntem Namen nicht aufgelöst. Gesparte Abfragen:
- Spiele werden gemerkt (`MATCH_CACHE_MAX`), ein Spiel mit mehreren gesuchten Spielern wird nur einmal geladen.
- Dasselbe Ergebnis wird `SEARCH_CACHE_SEC` lang wiederverwendet, ohne Abfragen und ohne Anrechnung auf das Limit des Besuchers.
- Riot zählt die Limits je Region. Die Suche nutzt vor allem `europe` (Account und Match), der Live-Tracker vor allem `euw1`; der Server zählt deshalb je Region getrennt. Suchanfragen haben Vorrang vor dem Hintergrund-Tracking. Das Verhalten pro Region ist ein Erfahrungswert, kontrolliere es zu Beginn in den Logs (Meldungen „429 Rate-Limit“).

Es läuft immer nur eine Suche gleichzeitig, weitere warten in einer Schlange (`SEARCH_QUEUE_MAX`). Pro Besucher gelten `SEARCH_PER_HOUR` neue Suchen pro Stunde (nach IP). `/api/status` zeigt unter `api` die Suchstatistik (`searches`, `searchCalls`, `matchCacheHits`, `matchesCached`).

## Hosting als Node.js Web-App

- Dateien hochladen oder per GitHub verbinden, Startdatei `server.js` (bzw. Start-Befehl `npm start`), Node 18 oder neuer.
- `RIOT_API_KEY` als Umgebungsvariable beim Hoster eintragen, nie in den Code schreiben.
- Der Dev-Key läuft nach 24 Stunden ab und darf nicht für eine öffentliche Seite genutzt werden. Für den öffentlichen Betrieb brauchst du den Production-Key.
- Die App muss dauerhaft laufen, weil sie im Hintergrund abfragt. Prüfe, ob dein Tarif Dauerprozesse erlaubt.

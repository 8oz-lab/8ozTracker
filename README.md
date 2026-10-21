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
| `NAME_FILL_EVERY` | 30 | Fehlende Namen für das Leaderboard: bei jeder n-ten Abfrage einen nachladen |
| `DATA_FILE` | `state.json` | Datei, in der PUUIDs und Namen für Neustarts gesichert werden |

## Spieldetails

Die Zeilen auf `/live` und `/recent` lassen sich ausklappen (Champions, Teams, Bans). Die Daten stammen aus der Spectator-Antwort, die ohnehin abgefragt wird, es entstehen keine zusätzlichen Riot-Abfragen. Auf `/recent` steht außerdem der Champion in der Zeile (nur wenn das Spiel live gesehen wurde, sonst „–“). Champion-Namen und Bilder kommen aus Data Dragon (statische Dateien von Riot, zählt nicht gegen das API-Limit).

## Geteilte Partien

Spielen mehrere Spieler der Liste in derselben Partie, wird nur einer von ihnen abgefragt: Die Spectator-Antwort enthält alle 10 Teilnehmer, die anderen getrackten Spieler werden daraus direkt übernommen. Läuft die Partie nicht mehr, gilt das Ende für alle. Wie viele Abfragen das spart, steht in `/api/status` unter `api` (`calls` = echte Riot-Abfragen seit dem Start, `savedStarts` = gesparte Abfragen beim Erkennen, `savedRechecksEstimate` = geschätzte gesparte Re-Checks) und alle 10 Minuten in den Logs.

## Leaderboard

`/leaderboard` zeigt die Top 1000 mit Rang, LP, Siegen/Niederlagen, Winrate und Live-Status. Die Daten stammen aus der Ladder, die ohnehin alle 2 Minuten geladen wird. Fehlende Namen werden nebenbei nachgeladen (beste Ränge zuerst, bei jeder `NAME_FILL_EVERY`-ten Abfrage, Standard 30) und gespeichert. Wie viele Namensabfragen es waren, steht in `/api/status` unter `api.nameCalls`.

## Spielende über die Ladder

Die Ladder wird alle 2 Minuten geladen. Steigt bei einem Spieler im Spiel die Zahl der Flex-Spiele, wird er sofort einmal geprüft und das Spielende für alle getrackten Spieler dieser Partie eingetragen. Dadurch genügt eine seltene Kontrollprüfung (`INGAME_RECHECK_SEC`, Standard 6 Minuten) statt vieler Dauer-Prüfungen. Spieler, die seit Tagen nichts gespielt haben, werden nur noch etwa stündlich geprüft; ein beendetes Spiel erkennt die Ladder trotzdem.

Wie gut das funktioniert, zeigt `/api/status` unter `api.endDetect`: `byLadder` und `byRecheck` sind die Spielenden, die von der Ladder bzw. der Kontrollprüfung zuerst gemeldet wurden. `ladderLagAvgMin` ist, wie viele Minuten die Ladder im Schnitt später als die Kontrollprüfung war (je Spieler gezählt, `samples` = Anzahl). Überwiegt `byLadder` und ist die Verzögerung klein, kannst du `INGAME_RECHECK_SEC` weiter erhöhen (z. B. 900).

## Hosting als Node.js Web-App

- Dateien hochladen oder per GitHub verbinden, Startdatei `server.js` (bzw. Start-Befehl `npm start`), Node 18 oder neuer.
- `RIOT_API_KEY` als Umgebungsvariable beim Hoster eintragen, nie in den Code schreiben.
- Der Dev-Key läuft nach 24 Stunden ab und darf nicht für eine öffentliche Seite genutzt werden. Für den öffentlichen Betrieb brauchst du den Production-Key.
- Die App muss dauerhaft laufen, weil sie im Hintergrund abfragt. Prüfe, ob dein Tarif Dauerprozesse erlaubt.

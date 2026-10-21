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
| `INGAME_RECHECK_SEC` | 120 | Abstand bei Spielern, deren Spiel schon länger läuft |
| `LADDER_REFRESH_SEC` | 600 | Wie oft die Ladder neu geladen wird (erkennt auch, wer gerade ein Spiel beendet hat) |
| `DATA_FILE` | `state.json` | Datei, in der PUUIDs und Namen für Neustarts gesichert werden |

## Hosting als Node.js Web-App

- Dateien hochladen oder per GitHub verbinden, Startdatei `server.js` (bzw. Start-Befehl `npm start`), Node 18 oder neuer.
- `RIOT_API_KEY` als Umgebungsvariable beim Hoster eintragen, nie in den Code schreiben.
- Der Dev-Key läuft nach 24 Stunden ab und darf nicht für eine öffentliche Seite genutzt werden. Für den öffentlichen Betrieb brauchst du den Production-Key.
- Die App muss dauerhaft laufen, weil sie im Hintergrund abfragt. Prüfe, ob dein Tarif Dauerprozesse erlaubt.

# HTTP-Analyse

Die HTTP-Analyse (`http.html`) sendet HTTP-Anfragen und zeigt die Antworten, wie Postman: zum Testen von APIs, Webdiensten und Webservern.
Anfragen werden in Sammlungen organisiert, die als **Postman-Collection v2.1** gespeichert werden.

## Anfragen senden

1. Wählen Sie die **Methode** (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS) und geben Sie die **URL** ein.
2. Füllen Sie bei Bedarf die Reiter aus:
   - **Parameter**: Query-Parameter (mit der URL abgeglichen);
   - **Header**: Anfrage-Header;
   - **Body**: *roh* (JSON, XML, Text, HTML, JavaScript, mit Syntaxhervorhebung), *x-www-form-urlencoded*, *form-data* (Textfelder und Dateien,
     als Multipart gesendet) oder eine *Datei*; der passende `Content-Type` wird gesetzt, außer Sie setzen einen eigenen;
   - **Anmeldung**: Basic (Benutzer und Passwort) oder ein Bearer-Token.
   Zeilen lassen sich mit ihrem Kontrollkästchen abschalten; × entfernt eine Zeile; Tippen in die leere letzte Zeile fügt eine hinzu.
3. **Senden** (`Strg+Eingabe`).

**Senden über** wählt den Weg:

- **Relay** (empfohlen): Das lokale Relay sendet die Anfrage (siehe Benutzerhandbuch, „Netzwerkfunktionen und das Relay“). Es gibt keine
  Browser-Grenzen: jede Methode, jeder Header (auch `Cookie`, `Host`, …) und jeder Antwort-Header (auch `Set-Cookie`) funktioniert, und Server
  ohne CORS-Header sind erreichbar. Optionen unter **Umgebungen… → Relay**: nicht vertrauenswürdige Zertifikate akzeptieren, Weiterleitungen folgen.
- **Browser**: Der Browser sendet die Anfrage selbst. Das funktioniert ohne Relay, aber nur bei Servern, die es mit CORS-Headern erlauben; der
  Browser verbirgt manche Header.

## Antworten

Die Statuszeile zeigt den Statuscode (farbig), die Dauer und die Größe. **Body** zeigt den Inhalt: **Formatiert** (JSON eingerückt,
Syntaxhervorhebung), **roh** oder **Vorschau** (Bilder, HTML in einer Sandbox ohne Skripte). **Header** listet alle Antwort-Header.
**Body speichern** lädt den Inhalt herunter.

## Variablen und Umgebungen

Schreiben Sie `{{name}}` in URL, Header, Body oder Anmeldefelder, um eine Variable zu verwenden. **Umgebungen…** verwaltet Umgebungen (z. B. *Test*
und *Produktion*) mit jeweils eigenen Variablen; die Liste in der Werkzeugleiste wählt die aktive. Variablen der Sammlung (in der
Sammlungsdatei gespeichert) gelten, wenn die Umgebung keine Variable dieses Namens hat.

Umgebungen und Relay-Einstellungen liegen in einer Verbindungsdatei (KeePass-Datenbank oder JSON-Datei, **Speichern** und **Öffnen…** im linken
Bereich), sodass Tokens und Passwörter verschlüsselt gespeichert werden können.

## Skripte und Tests

Der Reiter **Skripte** einer Anfrage enthält zwei JavaScript-Stücke im Stil von Postman (Sammlungen aus Postman behalten sie):

- **Vor der Anfrage** läuft vor dem Senden, etwa um einen Wert zu berechnen: `pm.environment.set('stamp', Date.now())`,
  `pm.variables.set('page', 2)` (nur für diese Anfrage), `pm.request.headers.add({ key: 'X-Id', value: '1' })`.
- **Tests** laufen nach der Antwort: `pm.test('Status', () => pm.response.to.have.status(200))`,
  `pm.test('Name', () => pm.expect(pm.response.json().name).to.equal('Anna'))`. Die Ergebnisse erscheinen im Reiter **Tests** der
  Antwort (✓/✗ mit Begründung), dazu die Ausgaben von `console.log`. Tests können auch Werte für die nächste Anfrage speichern, etwa
  ein Anmelde-Token: `pm.environment.set('token', pm.response.json().token)`.

Verfügbar: `pm.environment`, `pm.collectionVariables`, `pm.variables` (`get`, `set`, `unset`, `has`), `pm.request` (`method`, `url`,
`headers`), `pm.response` (`code`, `status`, `responseTime`, `headers.get()`, `text()`, `json()`, `to.have.status()`, `to.have.header()`,
`to.be.ok`, `to.be.json`), `pm.test()` und `pm.expect()` mit den üblichen Prüfungen (`to.equal`, `to.eql`, `to.include`,
`to.have.property`, `to.be.above`/`below`, `to.match`, `to.be.oneOf`, `to.be.true`, `to.exist`, `to.be.empty`, `.not`, …). Skripte laufen
abgeschottet von der Suite (kein Zugriff auf ihren Speicher, Dateien oder Passwörter) und werden nach fünf Sekunden beendet.

## WebSocket

Eine URL, die mit `ws://` oder `wss://` beginnt, macht die Anfrage zu einer WebSocket-Verbindung: **Verbinden** öffnet sie, die untere
Hälfte zeigt die Nachrichten (↑ gesendet, ↓ empfangen, mit Uhrzeit; binäre Nachrichten hexadezimal) und ein Feld zum Schreiben
(**Senden** oder `Strg+Eingabe`, `{{Variablen}}` werden ersetzt); **Trennen** schließt sie, Code und Grund des Schließens werden angezeigt.
Ein Header `Sec-WebSocket-Protocol` fordert Unterprotokolle an. WebSockets öffnet der Browser direkt, nicht über das Relay.

## OpenAPI

**Sammlung öffnen…** liest auch OpenAPI-3- und Swagger-2-Beschreibungen (JSON oder YAML) und erstellt daraus eine Sammlung: ein Ordner je
Tag und eine Anfrage je Operation mit `{{baseUrl}}` (vom ersten Server), Pfadparametern als Variablen (`/pets/{{petId}}`), erforderlichen
Query-Parametern und Headern mit ihren Beispielen, einem aus dem Schema erzeugten JSON-Beispiel-Body sowie Basic-/Bearer-Anmeldung oder
API-Key-Headern aus den Sicherheitsschemata (`{{token}}`, `{{username}}`, …). Tragen Sie die Werte der Variablen in der Sammlung ein und
speichern Sie sie (als Postman-Sammlung).

## Sammlungen

- Der linke Bereich zeigt die Sammlung: **+ Neue Anfrage**, **+ Neuer Ordner**; beim Zeigen auf einen Eintrag ⧉ duplizieren, ✎ umbenennen und × löschen.
- **Sammlung öffnen…** (`Strg+O`) öffnet eine Postman-Collection (v2.1 JSON); **Sammlung speichern** (`Strg+S`) speichert sie (in Chrome/Edge am
  Desktop direkt in die Datei, in Firefox und unter Android als Download).
- **Verlauf** listet die in dieser Sitzung gesendeten Anfragen; ein Klick übernimmt eine in die Sammlung.

Rückgängig (↶, `Strg+Z`) und Wiederholen (↷, `Strg+Y`) wirken auf alle Änderungen der Sammlung: Anfragen, Ordner, URL, Header, Body, Anmeldung. Tippen in ein Feld zählt als ein Schritt.

## cURL

- **cURL importieren…** macht aus einem `curl`-Befehl (z. B. „Als cURL kopieren“ aus den Entwicklerwerkzeugen des Browsers) eine Anfrage: Methode,
  URL, Header, Daten, Formularfelder, `-u`-Benutzer und mehr.
- **cURL** neben den Reitern zeigt die aktuelle Anfrage als `curl`-Befehl (mit aufgelösten Variablen) zum Kopieren.

## Tastenkürzel

Auf dem Mac verwenden Sie Cmd statt Strg. `F1` (oder `?`) zeigt diese Liste in der Anwendung.

### Dateien

| Tasten | Funktion |
|---|---|
| `Strg+O` | Sammlung öffnen |
| `Strg+S` | Sammlung speichern |
| `Strg+Umschalt+S` | Speichern unter |

### Anfrage

| Tasten | Funktion |
|---|---|
| `Strg+Eingabe` | Anfrage senden |

### Bearbeiten

| Tasten | Funktion |
|---|---|
| `Strg+Z` | Rückgängig |
| `Strg+Y` / `Strg+Umschalt+Z` | Wiederholen |

### Hilfe

| Tasten | Funktion |
|---|---|
| `F1` / `?` | diese Liste zeigen (außerhalb von Textfeldern) |

## Auf Smartphones und Tablets

☰ öffnet die Sammlung. Die Anfrage steht über der Antwort.
